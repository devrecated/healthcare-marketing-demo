#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Load skill-invoke.yaml (manual vs automatic) and append a gitignored log
 * when an Autodevelop skill starts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimpleYaml } from "../../hooks/autodevelop/lib.mjs";
import { findRepoRoot } from "./scripts/config-load.mjs";

export const SKILL_INVOKE_NAME = "skill-invoke.yaml";
export const LOG_REL = join(".cursor", "local", "skill-invoke-log.yaml");
const MAX_EVENTS = 200;

const asName = (value) =>
  String(value || "")
    .trim()
    .replace(/^\/+/, "")
    .toLowerCase();

export const skillInvokePath = (root = findRepoRoot()) =>
  join(root, ".cursor", "skills", "autodevelop", SKILL_INVOKE_NAME);

export const skillInvokeLogPath = (root = findRepoRoot()) => join(root, LOG_REL);

export const loadSkillInvoke = (root = findRepoRoot()) => {
  const path = skillInvokePath(root);
  if (!existsSync(path)) return { path, default: "automatic", skills: {} };
  try {
    const doc = parseSimpleYaml(readFileSync(path, "utf8")) || {};
    const skills = doc.skills && typeof doc.skills === "object" ? doc.skills : {};
    const fallback = doc.default === "manual" ? "manual" : "automatic";
    return { path, default: fallback, skills };
  } catch {
    return { path, default: "automatic", skills: {} };
  }
};

/** `manual` | `automatic`. Missing name uses yaml `default`. */
export const invokeMode = (name, root = findRepoRoot()) => {
  const id = asName(name);
  const { default: fallback, skills } = loadSkillInvoke(root);
  const row = skills[id] || skills[name];
  const mode = row && typeof row === "object" ? row.invoke : row;
  if (mode === "manual" || mode === "automatic") return mode;
  return fallback;
};

export const loadSkillInvokeLog = (root = findRepoRoot()) => {
  const path = skillInvokeLogPath(root);
  if (!existsSync(path)) return { path, events: [] };
  try {
    const doc = parseSimpleYaml(readFileSync(path, "utf8")) || {};
    const events = Array.isArray(doc.events) ? doc.events : [];
    return { path, events };
  } catch {
    return { path, events: [] };
  }
};

const stringifyLog = (events) => {
  const lines = ["version: 1", "events:"];
  for (const event of events) {
    lines.push(`  - name: ${event.name}`);
    lines.push(`    mode: ${event.mode}`);
    lines.push(`    at: ${event.at}`);
  }
  if (!events.length) lines.push("  []");
  return `${lines.join("\n")}\n`;
};

export const recordSkillInvoke = (
  { name, mode, at = new Date().toISOString() },
  root = findRepoRoot(),
) => {
  const id = asName(name);
  const resolved = mode === "manual" || mode === "automatic" ? mode : invokeMode(id, root);
  const path = skillInvokeLogPath(root);
  const { events } = loadSkillInvokeLog(root);
  events.push({ name: id, mode: resolved, at });
  const kept = events.slice(-MAX_EVENTS);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyLog(kept));
  return { path, name: id, mode: resolved, at };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const [cmd, name, mode] = process.argv.slice(2);
  if (cmd === "record") {
    if (!name) {
      console.error("usage: skill-invoke.mjs record <name> [manual|automatic]");
      process.exit(1);
    }
    const row = recordSkillInvoke({ name, mode });
    process.stdout.write(`${row.name}\t${row.mode}\t${row.at}\n`);
    process.exit(0);
  }
  if (cmd === "mode") {
    process.stdout.write(`${invokeMode(name)}\n`);
    process.exit(0);
  }
  const { default: fallback, skills } = loadSkillInvoke();
  process.stdout.write(`default\t${fallback}\n`);
  for (const [key, row] of Object.entries(skills).toSorted(([a], [b]) => a.localeCompare(b))) {
    const invoke = row && typeof row === "object" ? row.invoke : row;
    process.stdout.write(`${key}\t${invoke}\n`);
  }
}
