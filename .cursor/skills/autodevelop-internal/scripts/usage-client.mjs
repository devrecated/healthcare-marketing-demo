#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Background sender for the post-chat hook. Fail-open. Never sends a chat
 * transcript. Two jobs, both best-effort:
 *   1. POST per-chat token usage to /usage (skipped when no token counts).
 *   2. Flush locally staged knowledge notes to /context/recaps, then clear.
 *
 * Run detached by send-usage-and-knowledge.mjs with the hook payload in
 * AUTODEVELOP_HOOK_PAYLOAD and the workspace root in AUTODEVELOP_HOOK_ROOT.
 */
import { execFileSync } from "node:child_process";
import { recapsEndpoint, readSubscriptionToken } from "../process/context-ingest/submit-recap.mjs";
import { readPending, writePending } from "./knowledge-stage.mjs";
import { readSession } from "./session.mjs";

export const usageEndpoint = (base) => {
  const trimmed = String(base || "").trim();
  if (!trimmed) return "";
  if (/\/usage\/?$/i.test(trimmed)) return trimmed.replace(/\/$/, "");
  if (/\/entitlement\/?$/i.test(trimmed)) return trimmed.replace(/\/entitlement\/?$/i, "/usage");
  return `${trimmed.replace(/\/$/, "")}/usage`;
};

const positiveInt = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const originRemote = (root) => {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch {
    return "";
  }
};

/**
 * Pull token counts and ids from whatever shape the Cursor hook provides.
 * Returns null when no token counts are present (ADR: do not send zero rows).
 */
export const extractUsage = (payload = {}) => {
  const nested = payload && typeof payload.usage === "object" ? payload.usage : {};
  const tokens = payload && typeof payload.tokens === "object" ? payload.tokens : {};
  const pick = (...keys) => {
    for (const src of [payload, nested, tokens]) {
      if (!src || typeof src !== "object") continue;
      for (const key of keys) {
        if (src[key] != null) return src[key];
      }
    }
    return undefined;
  };
  const input = positiveInt(pick("input_tokens", "inputTokens", "prompt_tokens", "promptTokens"));
  const output = positiveInt(pick("output_tokens", "outputTokens", "completion_tokens", "completionTokens"));
  const cacheRead = positiveInt(
    pick("cache_read_tokens", "cacheReadTokens", "cached_tokens", "cache_read_input_tokens"),
  );
  const cacheWrite = positiveInt(
    pick("cache_write_tokens", "cacheWriteTokens", "cache_creation_input_tokens"),
  );
  if (!input && !output && !cacheRead && !cacheWrite) return null;
  const str = (...keys) => {
    const value = String(pick(...keys) || "").trim();
    return value ? value.slice(0, 120) : undefined;
  };
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    model: str("model", "model_name", "modelName"),
    provider: str("provider"),
    conversation_id: str("conversation_id", "conversationId", "session_id", "sessionId", "thread_id"),
    generation_id: str("generation_id", "generationId", "message_id", "messageId"),
    cursor_agent_id: str("cursor_agent_id", "cursorAgentId", "agent_id", "agentId"),
  };
};

const authHeaders = (token) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

export const sendUsage = async ({ endpoint, token, usage, extra = {}, fetchImpl = fetch }) => {
  if (!usage || !endpoint || !token) return { ok: false, skipped: true };
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...usage, ...extra }),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
};

export const buildRecapText = (entries) =>
  entries
    .map((entry) => {
      const kind = entry.kind && entry.kind !== "note" ? `[${entry.kind}] ` : "";
      const title = entry.title ? `${entry.title}: ` : "";
      return `- ${kind}${title}${entry.note}`;
    })
    .join("\n");

/**
 * POST staged knowledge grouped by repo, one recap per repo. Entries whose POST
 * fails stay queued for the next turn; succeeded groups are cleared.
 */
export const flushKnowledge = async ({ root, endpoint, token, fallbackRepoUrl = "", fetchImpl = fetch }) => {
  const entries = readPending(root);
  if (!entries.length) return { flushed: 0, remaining: 0 };
  if (!endpoint || !token) return { flushed: 0, remaining: entries.length, skipped: true };

  const groups = new Map();
  for (const entry of entries) {
    const key = entry.repo_url || fallbackRepoUrl || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const remaining = [];
  let flushed = 0;
  for (const [repoUrl, groupEntries] of groups) {
    const ticket = groupEntries.map((entry) => entry.ticket).find((value) => value != null) ?? null;
    const body = {
      recap: buildRecapText(groupEntries),
      ticket_number: ticket,
      outcome: "unknown",
    };
    if (repoUrl) body.repo_url = repoUrl;
    let ok = false;
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      ok = response.ok;
    } catch {
      ok = false;
    }
    if (ok) flushed += groupEntries.length;
    else remaining.push(...groupEntries);
  }
  writePending(root, remaining);
  return { flushed, remaining: remaining.length };
};

export const runBackgroundSend = async ({ root, payload = {}, env = process.env, fetchImpl = fetch }) => {
  const base = env.AUTODEVELOP_ENTITLEMENT_URL;
  const token = readSubscriptionToken(env);
  const repoUrl = originRemote(root);
  const { session } = readSession(root);
  const ticket = session?.issue ?? null;

  const results = { usage: { ok: false, skipped: true }, knowledge: { flushed: 0, remaining: 0 } };

  const usage = extractUsage(payload);
  if (usage) {
    const extra = {};
    if (repoUrl) extra.repo_url = repoUrl;
    if (ticket != null) extra.ticket_number = ticket;
    results.usage = await sendUsage({ endpoint: usageEndpoint(base), token, usage, extra, fetchImpl });
  }

  results.knowledge = await flushKnowledge({
    root,
    endpoint: recapsEndpoint(base),
    token,
    fallbackRepoUrl: repoUrl,
    fetchImpl,
  });

  return results;
};

const isDirectRun = Boolean(process.argv[1]) && process.argv[1].endsWith("usage-client.mjs");

if (isDirectRun) {
  let payload = {};
  try {
    payload = JSON.parse(process.env.AUTODEVELOP_HOOK_PAYLOAD || "{}");
  } catch {
    payload = {};
  }
  const root = process.env.AUTODEVELOP_HOOK_ROOT || process.cwd();
  try {
    await runBackgroundSend({ root, payload });
  } catch {
    // Fail-open: background telemetry must never surface an error.
  }
}
