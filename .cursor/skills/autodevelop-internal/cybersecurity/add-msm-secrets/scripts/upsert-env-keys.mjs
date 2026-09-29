#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Copy named keys between env files. Prints key names and status only.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const usage = () => {
  console.error(
    "usage: upsert-env-keys.mjs --from <env> --to <env> (--keys KEY,KEY | --all-keys | --alias SRC=DEST) [--dry-run]",
  );
  process.exit(2);
};

const argValue = (args, name) => {
  const i = args.indexOf(name);
  if (i === -1 || !args[i + 1]) return "";
  return args[i + 1];
};

const parseEnv = (text) => {
  const map = new Map();
  const order = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#") || !line.includes("=")) {
      order.push({ kind: "raw", line });
      continue;
    }
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    map.set(key, value);
    order.push({ kind: "key", key });
  }
  return { map, order };
};

const args = process.argv.slice(2);
const fromPath = resolve(argValue(args, "--from"));
const toPath = resolve(argValue(args, "--to"));
const keys = argValue(args, "--keys")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);
const allKeys = args.includes("--all-keys");
const aliasRaw = argValue(args, "--alias");
const alias = aliasRaw.includes("=")
  ? { src: aliasRaw.split("=")[0].trim(), dest: aliasRaw.split("=").slice(1).join("=").trim() }
  : null;
const dryRun = args.includes("--dry-run");

if (!fromPath || !toPath || (!allKeys && keys.length === 0 && !alias)) usage();
if (!existsSync(fromPath)) {
  console.error(`missing --from ${fromPath}`);
  process.exit(1);
}

const from = parseEnv(readFileSync(fromPath, "utf8"));
const toText = existsSync(toPath) ? readFileSync(toPath, "utf8") : "";
const to = parseEnv(toText);
const selected = allKeys ? [...from.map.keys()] : keys;

if (alias) {
  if (!from.map.has(alias.src)) {
    console.log(`${alias.src}->${alias.dest}\tmissing-in-from`);
  } else {
    selected.push(alias.dest);
    from.map.set(alias.dest, from.map.get(alias.src));
  }
}

for (const key of selected) {
  if (!from.map.has(key)) {
    console.log(`${key}\tmissing-in-from`);
    continue;
  }
  const next = from.map.get(key);
  if (!to.map.has(key)) {
    to.map.set(key, next);
    to.order.push({ kind: "key", key });
    console.log(`${key}\tadded`);
    continue;
  }
  if (to.map.get(key) === next) {
    console.log(`${key}\tunchanged`);
    continue;
  }
  to.map.set(key, next);
  console.log(`${key}\tupdated`);
}

if (dryRun) process.exit(0);

const lines = [];
const seen = new Set();
for (const item of to.order) {
  if (item.kind === "raw") {
    lines.push(item.line);
    continue;
  }
  if (seen.has(item.key)) continue;
  seen.add(item.key);
  lines.push(`${item.key}=${to.map.get(item.key)}`);
}
for (const key of to.map.keys()) {
  if (seen.has(key)) continue;
  lines.push(`${key}=${to.map.get(key)}`);
}

mkdirSync(dirname(toPath), { recursive: true });
const body = lines.join("\n").replace(/\n*$/, "\n");
writeFileSync(toPath, body, { mode: 0o600 });
