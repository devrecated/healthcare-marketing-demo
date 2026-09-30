/**
 * Copyright (c) 2026 Devrecated.
 *
 * Stage Cursor user prompts locally for the stop-hook sender.
 * Same pending pattern as knowledge-stage; never sends network itself.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PENDING_REL = join(".cursor", "local", "chat-turns", "pending.jsonl");

const clip = (value, max) => {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) : text;
};

const stripSecrets = (text) =>
  String(text || "")
    .replace(/\b(sk|pk|rk|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{8,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, "Bearer [redacted]");

export const pendingPath = (root) => join(String(root || ""), PENDING_REL);

export const readPendingPrompts = (root) => {
  try {
    const raw = readFileSync(pendingPath(root), "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const writePendingPrompts = (root, entries) => {
  const path = pendingPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const body = (entries || []).map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(path, body ? `${body}\n` : "");
};

export const stagePrompt = (root, { prompt, sessionKey = "", at = new Date().toISOString() } = {}) => {
  const userMessage = clip(stripSecrets(prompt), 8000);
  if (!userMessage) return null;
  const entries = readPendingPrompts(root);
  entries.push({
    at,
    session_key: clip(sessionKey, 120),
    user_message: userMessage,
  });
  // Keep a short queue so a missed stop cannot grow forever.
  writePendingPrompts(root, entries.slice(-20));
  return entries[entries.length - 1];
};

/** Take the oldest pending prompt (FIFO) for pairing with a reply. */
export const takePrompt = (root) => {
  const entries = readPendingPrompts(root);
  if (!entries.length) return null;
  const [head, ...rest] = entries;
  writePendingPrompts(root, rest);
  return head;
};
