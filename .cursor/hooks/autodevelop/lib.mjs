#!/usr/bin/env node
/**
 * Shared stdin/stdout JSON helpers for project Cursor hooks.
 * Copyright (c) 2026 Devrecated.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKIGNORE_NAME = "hookignore.yaml";

export const hooksDir = () => join(dirname(fileURLToPath(import.meta.url)), "..");

export const hookignorePath = () => join(hooksDir(), HOOKIGNORE_NAME);

const asHookName = (value) =>
  String(value || "")
    .trim()
    .replace(/\.mjs$/i, "")
    .toLowerCase();

const unquote = (value) => {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
};

/** Enough YAML for hookignore, skill-invoke, and instance policies (maps, scalar lists, comments). */
export const parseSimpleYaml = (raw) => {
  const lines = String(raw || "").split(/\r?\n/);
  const root = {};
  const stack = [{ indent: -1, node: root }];
  const nextSignificant = (fromIndex) => {
    for (let i = fromIndex + 1; i < lines.length; i += 1) {
      const original = lines[i];
      const trimmed = original.replace(/\s+#.*$/, "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      return {
        trimmed,
        indent: original.length - original.trimStart().length,
      };
    }
    return null;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const original = lines[i];
    const line = original.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const indent = original.length - original.trimStart().length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) continue;
      parent.push(unquote(trimmed.slice(2)));
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    if (!Array.isArray(parent) && rest === "") {
      const peek = nextSignificant(i);
      const child =
        peek && peek.indent > indent && peek.trimmed.startsWith("- ") ? [] : {};
      parent[key] = child;
      stack.push({ indent, node: child });
      continue;
    }
    if (!Array.isArray(parent)) parent[key] = unquote(rest);
  }
  return root;
};

export const loadHookIgnore = () => {
  const path = hookignorePath();
  if (!existsSync(path)) return { path, ignore: [], hooks: {} };
  try {
    const doc = parseSimpleYaml(readFileSync(path, "utf8")) || {};
    const ignore = (Array.isArray(doc.ignore) ? doc.ignore : []).map(asHookName).filter(Boolean);
    const hooks = doc.hooks && typeof doc.hooks === "object" && !Array.isArray(doc.hooks) ? doc.hooks : {};
    return { path, ignore, hooks };
  } catch {
    return { path, ignore: [], hooks: {} };
  }
};

/** Missing key = on. `ignore: [name]` or `hooks: { name: false }` turns a hook off. */
export const isHookEnabled = (name) => {
  const id = asHookName(name);
  if (!id) return true;
  const { ignore, hooks } = loadHookIgnore();
  if (ignore.includes(id)) return false;
  const flag = hooks[id];
  if (flag === false || flag === "off" || flag === "false") return false;
  return true;
};

export const writeHookOutput = (payload) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};

export const exitIfHookDisabled = (name) => {
  if (isHookEnabled(name)) return false;
  writeHookOutput({});
  return true;
};

export const readHookInput = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const asString = (value) => (typeof value === "string" ? value : "");

export const collectStrings = (value, out = []) => {
  if (typeof value === "string" && value) out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
};
