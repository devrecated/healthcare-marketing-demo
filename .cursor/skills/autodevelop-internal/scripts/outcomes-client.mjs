#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Fail-open HTTPS client for product outcomes. Never sends chat transcripts.
 * Never prints tokens. Hosted ingest lives outside the plugin zip.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findRepoRoot, loadConfig } from "./config-load.mjs";

export const FLAG_REL = join(".cursor", "local", "autodevelop-outcome-flags.json");
export const BILLING_EXPIRED = "Your billing has expired";

const SOURCES = new Set(["plugin", "admin", "tickets", "feedback"]);
const OUTCOMES = new Set(["success", "failure", "unknown"]);
const WORKSPACE_KINDS = new Set(["internal", "client", "unknown"]);
const MAX_FEEDBACK = 4000;
const MAX_SKILL = 120;
const MAX_ERROR_CLASS = 64;
const MAX_FLAGS = 50;

export const outcomesEndpoint = (base) => {
  const trimmed = String(base || "").trim();
  if (!trimmed) return "";
  if (/\/outcomes\/?$/i.test(trimmed)) return trimmed.replace(/\/$/, "");
  if (/\/feedback\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/feedback\/?$/i, "/outcomes");
  }
  if (/\/entitlement\/?$/i.test(trimmed)) {
    return trimmed.replace(/\/entitlement\/?$/i, "/outcomes");
  }
  return `${trimmed.replace(/\/$/, "")}/outcomes`;
};

export const feedbackEndpoint = (base) => {
  const outcomes = outcomesEndpoint(base);
  if (!outcomes) return "";
  return outcomes.replace(/\/outcomes$/i, "/feedback");
};

export const sanitizeFeedback = (text) => {
  let out = String(text ?? "");
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  out = out.replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[redacted]");
  out = out.replace(
    /\b(AUTODEVELOP_TOKEN|AUTODEVELOP_ADMIN_KEY|SUPABASE_SERVICE_ROLE|TOKEN|password|passwd|secret)\s*[=:]\s*\S+/gi,
    "$1=[redacted]",
  );
  out = out.replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, "[redacted]");
  out = out.replace(/\bad_[A-Za-z0-9_-]{16,}/g, "[redacted]");
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  if (out.length > MAX_FEEDBACK) out = out.slice(0, MAX_FEEDBACK);
  return out.trim();
};

export const sanitizeErrorClass = (value) => {
  if (value == null || value === "") return null;
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, MAX_ERROR_CLASS);
  return cleaned || null;
};

export const sanitizeSkill = (value) => {
  if (value == null || value === "") return null;
  const cleaned = String(value)
    .replace(/[\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SKILL);
  return cleaned || null;
};

export const normalizeOutcomePayload = (input = {}) => {
  const source = SOURCES.has(input.source) ? input.source : null;
  if (!source) {
    const err = new Error("source must be plugin, admin, tickets, or feedback");
    err.status = 400;
    throw err;
  }
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "unknown";
  const workspaceKind = WORKSPACE_KINDS.has(input.workspace_kind) ? input.workspace_kind : null;
  const feedback = sanitizeFeedback(input.feedback);
  return {
    source,
    outcome,
    skill: sanitizeSkill(input.skill),
    error_class: sanitizeErrorClass(input.error_class),
    feedback: feedback || null,
    workspace_kind: workspaceKind,
  };
};

export const detectWorkspaceKind = (root = findRepoRoot()) => {
  try {
    const pluginPath = join(root, ".cursor-plugin", "plugin.json");
    if (existsSync(pluginPath)) {
      const name = JSON.parse(readFileSync(pluginPath, "utf8")).name;
      if (name === "autodevelop") return "internal";
    }
  } catch {
    /* keep going */
  }
  try {
    const loaded = loadConfig({ allowExample: true, root });
    if (loaded.source && loaded.source !== "example") return "client";
  } catch {
    /* keep going */
  }
  return "unknown";
};

export const outcomeStatePath = (root = findRepoRoot()) => join(root, FLAG_REL);

export const readOutcomeState = (root = findRepoRoot()) => {
  const path = outcomeStatePath(root);
  if (!existsSync(path)) return { path, flags: [], successLogged: null };
  try {
    const doc = JSON.parse(readFileSync(path, "utf8")) || {};
    const flags = Array.isArray(doc.flags) ? doc.flags : [];
    return { path, flags, successLogged: doc.successLogged || null };
  } catch {
    return { path, flags: [], successLogged: null };
  }
};

const writeOutcomeState = (state, root = findRepoRoot()) => {
  const path = outcomeStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        flags: (state.flags || []).slice(-MAX_FLAGS),
        successLogged: state.successLogged || null,
      },
      null,
      2,
    )}\n`,
  );
  return path;
};

export const writeOutcomeFlag = (flag, root = findRepoRoot()) => {
  const state = readOutcomeState(root);
  state.flags.push({
    error_class: sanitizeErrorClass(flag.error_class),
    skill: sanitizeSkill(flag.skill),
    feedback: flag.feedback ? sanitizeFeedback(flag.feedback) : null,
    logged: Boolean(flag.logged),
    at: flag.at || new Date().toISOString(),
  });
  writeOutcomeState(state, root);
  return state;
};

export const markFlagsLogged = (root = findRepoRoot()) => {
  const state = readOutcomeState(root);
  for (const flag of state.flags) flag.logged = true;
  writeOutcomeState(state, root);
  return state;
};

export const classifySessionOutcome = ({ session, state } = {}) => {
  const flags = state?.flags || [];
  const unlogged = flags.filter((flag) => !flag.logged);
  if (unlogged.length) {
    const first = unlogged[0];
    return {
      action: "failure",
      outcome: "failure",
      skill: first.skill || "session-end",
      error_class: first.error_class || "session_fail",
      feedback: first.feedback || null,
    };
  }
  if (flags.length) return null;
  const issue = session?.issue;
  if (!issue) return null;
  if (state?.successLogged?.issue === issue) return null;
  return {
    action: "success",
    outcome: "success",
    skill: "session-end",
    error_class: null,
    feedback: null,
    issue,
  };
};

export const consumeOutcomeDecision = (decision, root = findRepoRoot()) => {
  const state = readOutcomeState(root);
  if (decision?.action === "failure") {
    for (const flag of state.flags) flag.logged = true;
  }
  if (decision?.action === "success" && decision.issue) {
    state.successLogged = { issue: decision.issue, at: new Date().toISOString() };
  }
  writeOutcomeState(state, root);
  return state;
};

const readSubscriptionToken = (env = process.env) => {
  for (const key of ["AUTODEVELOP_TOKEN", "TOKEN"]) {
    const value = env[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
};

export const postOutcome = async (
  input,
  { env = process.env, fetchImpl = fetch, endpoint, sourceForce } = {},
) => {
  try {
    const url =
      endpoint ||
      (sourceForce === "feedback"
        ? feedbackEndpoint(env.AUTODEVELOP_ENTITLEMENT_URL)
        : outcomesEndpoint(env.AUTODEVELOP_ENTITLEMENT_URL));
    if (!url) return { ok: false, skipped: true };
    const payload = normalizeOutcomePayload({
      ...input,
      source: sourceForce || input.source || "plugin",
    });
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    const token = readSubscriptionToken(env);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
};

export const logDoctorRun = async (result, entitlement, opts = {}) => {
  const root = result?.root;
  const kind = root ? detectWorkspaceKind(root) : "unknown";
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;

  if (result && !result.ok) {
    const payload = {
      source: "plugin",
      outcome: "failure",
      skill: "doctor",
      error_class: "doctor_fail",
      feedback: (result.hardFails || []).join(", "),
      workspace_kind: kind,
    };
    if (root) writeOutcomeFlag({ ...payload, logged: false }, root);
    const posted = await postOutcome(payload, { env, fetchImpl });
    if (posted.ok && root) markFlagsLogged(root);
  }

  if (entitlement && entitlement.ok === false && entitlement.detail === BILLING_EXPIRED) {
    if (root) {
      writeOutcomeFlag({ error_class: "billing_expired", skill: "entitlement", logged: true }, root);
    }
  } else if (entitlement && /HTTP\s+5\d\d/.test(String(entitlement.detail || ""))) {
    const payload = {
      source: "plugin",
      outcome: "failure",
      skill: "entitlement",
      error_class: "host_error",
      workspace_kind: kind,
    };
    if (root) writeOutcomeFlag({ ...payload, logged: false }, root);
    const posted = await postOutcome(payload, { env, fetchImpl });
    if (posted.ok && root) markFlagsLogged(root);
  }
};
