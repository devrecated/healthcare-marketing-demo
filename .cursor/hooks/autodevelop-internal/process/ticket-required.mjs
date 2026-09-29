#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * Silent unless product files changed with no session ticket. Then one chat ask
 * to bind or call issues_ensure. Fail open. Never create issues from this hook.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asString, readHookInput, writeHookOutput } from "../lib.mjs";
import { kitScriptPath, workspaceRootFromHook } from "../../../skills/autodevelop-internal/scripts/config-load.mjs";
import {
  readSession,
  sessionDir,
} from "../../../skills/autodevelop-internal/scripts/session.mjs";

export const normalizePath = (filePath) => String(filePath || "").replace(/\\/g, "/");

export const isDevrecatedExemptPath = (filePath) => {
  const p = normalizePath(filePath);
  if (!p) return true;
  if (/\.cursor\/local\//.test(p)) return true;
  if (/\.cursor\/(skills|hooks|rules)\/autodevelop(-internal)?(\/|$)/.test(p)) return true;
  if (/\.cursor\/(skills|hooks|rules)\/third-party(\/|$)/.test(p)) return true;
  if (/\.cursor\/(agents|plans|commands)(\/|$)/.test(p)) return true;
  if (/\.cursor\/rules\/(frontend|design|testing|documents|cybersecurity)(\/|$)/.test(p)) return true;
  if (/^docs\/(adr|internal|workflows|public)\//.test(p)) return true;
  if (/^docs\/[^/]+\.md$/.test(p)) return true;
  if (/docs\/devrecated-autodevelop(\/|$)/.test(p)) return true;
  if (/\.cursor\/(skills|hooks|rules)\/README\.md$/.test(p)) return true;
  if (/\.cursor\/skills\/SOURCES\.md$/.test(p)) return true;
  if (/\.cursor\/hooks\.json$/.test(p)) return true;
  return false;
};

export const isRecordableProductPath = (filePath) => {
  const p = normalizePath(filePath);
  if (!p || p.startsWith("{") || p.startsWith("[")) return false;
  if (/agent-transcripts\//.test(p)) return false;
  if (/\/terminals\/\d+\.txt$/.test(p)) return false;
  if (!/[\\/]/.test(p) && !/\.[a-zA-Z0-9]+$/.test(p)) return false;
  const leaf = p.replace(/\/$/, "");
  if (/^\//.test(leaf) && !/\.[a-zA-Z0-9]+$/.test(leaf)) return false;
  if (isDevrecatedExemptPath(p)) return false;
  return true;
};

export const samePathSet = (left, right) => {
  const a = [...new Set(left || [])].sort();
  const b = [...new Set(right || [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export const formatOpenTicketLines = (items, limit = 20) => {
  const open = (items || []).filter((item) => String(item.status || "") !== "Done");
  return open.slice(0, limit).map((item) => {
    const number = item.content?.number || item.number;
    const title = item.title || item.content?.title || "untitled";
    return number ? `#${number} ${title}` : title;
  });
};

export const buildAskMessage = (ticketLines) => {
  const list =
    ticketLines.length > 0
      ? `If this work is already on the board, reply with the issue number from this list:\n${ticketLines.map((line) => `- ${line}`).join("\n")}`
      : "If this work is already on the board, reply with the existing issue number (e.g. #812).";
  return [
    "Product work is not bound to a board ticket.",
    "Bind an existing open ticket if this chat already named one (same effort as last turn). If none match, call issues_ensure to file one GitHub Project issue, write session.json, then continue.",
    "Do not invent a number. Do not open a second issue. Do not open child issues.",
    list,
  ].join(" ");
};

const pathFromInput = (input) => {
  const toolInput = input.tool_input || input.toolInput || input.arguments || {};
  const candidates = [
    toolInput.path,
    toolInput.file_path,
    toolInput.filePath,
    toolInput.target_file,
    input.file_path,
    input.path,
  ];
  const raw = candidates.find((value) => typeof value === "string" && value && !value.startsWith("{"));
  return asString(raw);
};

const untrackedFile = (root) => join(sessionDir(root), "untracked.json");

const writeUntracked = (root, data) => {
  const path = untrackedFile(root);
  mkdirSync(sessionDir(root), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
};

export const readUntracked = (root) => {
  const path = untrackedFile(root);
  if (!existsSync(path)) return { path, paths: [], askedPaths: [] };
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const paths = (Array.isArray(data.paths) ? data.paths : []).filter(isRecordableProductPath);
    const askedPaths = (Array.isArray(data.askedPaths) ? data.askedPaths : []).filter(
      isRecordableProductPath,
    );
    return { path, paths, askedPaths };
  } catch {
    return { path, paths: [], askedPaths: [] };
  }
};

export const noteUntrackedProductFile = (filePath, root) => {
  if (!isRecordableProductPath(filePath)) return null;
  const { session } = readSession(root);
  if (session?.issue) return null;
  const current = readUntracked(root);
  const next = current.paths.includes(filePath)
    ? current.paths
    : [...current.paths, filePath].slice(-20);
  writeUntracked(root, {
    paths: next,
    askedPaths: current.askedPaths,
    updatedAt: new Date().toISOString(),
  });
  return next;
};

const listOpenTicketLines = (root) => {
  const script = kitScriptPath("list-project.mjs");
  if (!existsSync(script)) return [];
  const result = spawnSync("node", [script, "--limit", "40"], {
    cwd: root,
    encoding: "utf8",
    timeout: 4000,
  });
  if (result.status !== 0) return [];
  try {
    return formatOpenTicketLines(JSON.parse(result.stdout || "[]"));
  } catch {
    return [];
  }
};

const isStopEvent = (input) =>
  /stop/i.test(asString(input.hook_event_name || input.hookEventName || input.event));

const run = async () => {
  const input = await readHookInput();
  const root = workspaceRootFromHook(input);
  const { session } = readSession(root);
  const filePath = pathFromInput(input);
  if (filePath) noteUntrackedProductFile(filePath, root);

  const stop = isStopEvent(input) || (!filePath && !input.tool_input && !input.toolInput);
  if (!stop || session?.issue) {
    writeHookOutput({});
    return;
  }

  const state = readUntracked(root);
  if (state.paths.length === 0 || samePathSet(state.paths, state.askedPaths)) {
    writeHookOutput({});
    return;
  }

  writeUntracked(root, {
    paths: state.paths,
    askedPaths: state.paths,
    updatedAt: new Date().toISOString(),
  });
  writeHookOutput({ additional_context: buildAskMessage(listOpenTicketLines(root)) });
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    await run();
  } catch {
    writeHookOutput({});
  }
}
