#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findRepoRoot } from "./config-load.mjs";

export const sessionDir = (root) => join(root, ".cursor", "local", "gh-projects");
export const sessionPath = (root) => join(sessionDir(root), "session.json");

export const readSession = (root = findRepoRoot()) => {
  const path = sessionPath(root);
  if (!existsSync(path)) return { path, session: null };
  try {
    return { path, session: JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return { path, session: null };
  }
};

export const writeSession = (session, root = findRepoRoot()) => {
  const path = sessionPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`);
  return path;
};

const normalizePath = (filePath) => String(filePath || "").replace(/\\/g, "/");

/** Process / local files do not count as ticket progress. */
export const isTicketProgressPath = (filePath) => {
  const p = normalizePath(filePath);
  if (!p) return false;
  if (/\.cursor\/local\//.test(p)) return false;
  if (/\.cursor\/(skills|hooks|rules)\/autodevelop(\/|$)/.test(p)) return false;
  if (/\.cursor\/(skills|hooks|rules)\/third-party(\/|$)/.test(p)) return false;
  if (/\.cursor\/rules\/(frontend|design|testing|documents|cybersecurity)(\/|$)/.test(p)) return false;
  if (/docs\/devrecated-autodevelop(\/|$)/.test(p)) return false;
  return true;
};

export const touchSessionFile = (filePath, root = findRepoRoot()) => {
  const { session } = readSession(root);
  if (!session) return null;
  const files = Array.isArray(session.filesTouched) ? session.filesTouched : [];
  if (filePath && !files.includes(filePath)) files.push(filePath);
  session.filesTouched = files;
  if (isTicketProgressPath(filePath)) session.lastTouchedAt = new Date().toISOString();
  writeSession(session, root);
  return session;
};

/** True when product files changed after the last progress comment. */
export const shouldAskProgress = (session) => {
  if (!session?.issue || !session.lastTouchedAt) return false;
  if (!session.lastProgressAt) return true;
  return Date.parse(session.lastTouchedAt) > Date.parse(session.lastProgressAt);
};
