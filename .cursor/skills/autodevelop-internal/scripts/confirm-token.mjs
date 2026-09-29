#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "./config-load.mjs";
import { sessionDir } from "./session.mjs";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export const tokenPath = (root) => join(sessionDir(root), "confirm-token.json");

export const issueConfirmToken = (meta = {}, root = findRepoRoot()) => {
  const dir = sessionDir(root);
  mkdirSync(dir, { recursive: true });
  const token = randomBytes(16).toString("hex");
  const record = {
    token,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    ...meta,
  };
  writeFileSync(tokenPath(root), `${JSON.stringify(record, null, 2)}\n`);
  return record;
};

export const readConfirmToken = (root = findRepoRoot()) => {
  const path = tokenPath(root);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

export const consumeConfirmToken = (presented, root = findRepoRoot()) => {
  const record = readConfirmToken(root);
  if (!record?.token || !presented) return { ok: false, reason: "missing" };
  if (Date.now() > Number(record.expiresAt || 0)) return { ok: false, reason: "expired" };
  const a = Buffer.from(String(record.token));
  const b = Buffer.from(String(presented));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };
  try {
    unlinkSync(tokenPath(root));
  } catch {
    /* ignore */
  }
  return { ok: true, record };
};

export const hasValidConfirmToken = (presented, root = findRepoRoot()) => {
  const record = readConfirmToken(root);
  if (!record?.token || !presented) return false;
  if (Date.now() > Number(record.expiresAt || 0)) return false;
  const a = Buffer.from(String(record.token));
  const b = Buffer.from(String(presented));
  return a.length === b.length && timingSafeEqual(a, b);
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (process.argv[1]?.endsWith("confirm-token.mjs")) {
  const root = findRepoRoot();
  if (process.argv.includes("--issue")) {
    const record = issueConfirmToken({ purpose: "mail" }, root);
    process.stdout.write(`${JSON.stringify({ token: record.token, expiresAt: record.expiresAt })}\n`);
  }
}
