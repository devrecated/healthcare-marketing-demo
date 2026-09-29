#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Local, sanitized knowledge staging. The write tool appends short knowledge
 * notes here during a session; the post-chat sender flushes them to the org
 * store. Never a chat transcript. Values are stripped by sanitizeFeedback.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { sanitizeFeedback } from "./outcomes-client.mjs";

export const PENDING_REL = join(".cursor", "local", "knowledge", "pending.jsonl");
export const KNOWLEDGE_KINDS = ["decision", "change", "blocker", "learning", "note"];
const MAX_TITLE = 200;

export const pendingPath = (root) => join(root, PENDING_REL);

/** Sanitize inputs into a storable entry, or null when the note is empty. */
export const buildEntry = ({ note, title = "", kind = "note", repoUrl = "", ticket = null } = {}) => {
  const cleanNote = sanitizeFeedback(note);
  if (!cleanNote) return null;
  const cleanTitle = sanitizeFeedback(title).slice(0, MAX_TITLE);
  const cleanKind = KNOWLEDGE_KINDS.includes(String(kind)) ? String(kind) : "note";
  const cleanRepo = String(repoUrl || "").trim().slice(0, 300);
  const ticketNum = Number(ticket);
  return {
    title: cleanTitle || null,
    note: cleanNote,
    kind: cleanKind,
    repo_url: cleanRepo || null,
    ticket: Number.isInteger(ticketNum) && ticketNum > 0 ? ticketNum : null,
    at: new Date().toISOString(),
  };
};

export const appendEntry = (root, entry) => {
  const path = pendingPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`);
  return path;
};

/** Sanitize and append a note in one step. Returns the stored entry or null. */
export const stageKnowledge = (root, input) => {
  const entry = buildEntry(input);
  if (!entry) return null;
  appendEntry(root, entry);
  return entry;
};

export const readPending = (root) => {
  const path = pendingPath(root);
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return out;
};

export const writePending = (root, entries) => {
  const path = pendingPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const body = (entries || []).map((entry) => JSON.stringify(entry)).join("\n");
  writeFileSync(path, body ? `${body}\n` : "");
  return path;
};

export const clearPending = (root) => writePending(root, []);
