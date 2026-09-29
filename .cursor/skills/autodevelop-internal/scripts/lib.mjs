#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 */
import { spawnSync } from "node:child_process";

export const parseArgs = (argv = process.argv.slice(2)) => {
  const flags = new Set();
  const values = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        values[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        values[key] = next;
        i += 1;
      } else {
        flags.add(key);
      }
      continue;
    }
    positional.push(token);
  }
  return { flags, values, positional, dryRun: flags.has("dry-run") };
};

export const hasFlag = (args, name) => args.flags.has(name);

export const argValue = (args, name, fallback = "") =>
  args.values[name] !== undefined ? String(args.values[name]) : fallback;

export const runCommand = (command, commandArgs, options = {}) => {
  if (options.dryRun) {
    return {
      ok: true,
      stdout: "",
      stderr: "",
      status: 0,
      dryRun: true,
      preview: [command, ...commandArgs].join(" "),
    };
  }
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options.spawn,
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status ?? 1,
    dryRun: false,
  };
};

export const fail = (message, code = 1) => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

export const printJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export const parseRecipientList = (raw) =>
  String(raw || "")
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean);

export const allowlistCheck = (recipients, allowlist, overridePhrase, typedOverride) => {
  const allowed = new Set((allowlist || []).map(normalizeEmail));
  const blocked = recipients.filter((email) => !allowed.has(email));
  if (blocked.length === 0) return { ok: true, blocked: [] };
  const overrideOk =
    Boolean(typedOverride) &&
    String(typedOverride).trim().toLowerCase() === String(overridePhrase || "send anyway").toLowerCase();
  return { ok: overrideOk, blocked };
};

export const ticketTemplate = ({
  what,
  steps = [],
  acceptance = [],
  stakeholder = "",
  sourceUrl = "",
  excerpt = "",
  visuals = [],
  notes = "",
}) => {
  const lines = ["## What to build", what || "", ""];
  if (steps.length) {
    lines.push("## Steps");
    steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    lines.push("");
  }
  if (acceptance.length) {
    lines.push("## Acceptance criteria");
    for (const item of acceptance) lines.push(`- [ ] ${item}`);
    lines.push("");
  }
  if (stakeholder) {
    lines.push("## Stakeholder", stakeholder, "");
  }
  if (sourceUrl || excerpt) {
    lines.push("## Source");
    if (sourceUrl) lines.push(`Notes: ${sourceUrl}`);
    if (excerpt) lines.push(`Excerpt: "${excerpt}"`);
    lines.push("");
  }
  if (visuals.length) {
    lines.push("## Visuals");
    for (const visual of visuals) {
      lines.push(`![${visual.caption || "visual"}](${visual.url})`);
    }
    lines.push("");
  }
  if (notes) {
    lines.push("## Notes", notes, "");
  }
  return `${lines.join("\n").trim()}\n`;
};
