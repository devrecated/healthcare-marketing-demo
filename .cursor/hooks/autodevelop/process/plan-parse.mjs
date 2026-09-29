#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
/** Parse plan frontmatter todos and inventory-looking paths. */
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { findInstanceFile, findKitRoot } from "../../../skills/autodevelop-internal/scripts/config-load.mjs";

export const parsePlanTodos = (markdown) => {
  const todos = [];
  const lines = String(markdown || "").split(/\r?\n/);
  let inFront = false;
  let current = null;
  for (const line of lines) {
    if (line.trim() === "---") {
      if (!inFront) {
        inFront = true;
        continue;
      }
      if (current) todos.push(current);
      break;
    }
    if (!inFront) continue;
    const item = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (item) {
      if (current) todos.push(current);
      current = { id: item[1].replace(/^["']|["']$/g, ""), content: "", status: "" };
      continue;
    }
    if (!current) continue;
    const content = line.match(/^\s+content:\s*(.+)$/);
    if (content) {
      current.content = content[1].replace(/^["']|["']$/g, "");
      continue;
    }
    const status = line.match(/^\s+status:\s*(.+)$/);
    if (status) current.status = status[1].trim();
  }
  return todos;
};

export const extractInventoryPaths = (markdown) => {
  const paths = new Set();
  const body = String(markdown || "");
  for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
    const path = match[1].split("#")[0];
    if (/^(\.cursor\/|scripts\/|services\/|GH_|web\/)/.test(path)) paths.add(path);
  }
  for (const match of body.matchAll(/`((?:\.cursor|scripts|services|web)\/[^`]+)`/g)) {
    paths.add(match[1].replace(/\/$/, ""));
  }
  return [...paths];
};

const walkFiles = (dir, acc = []) => {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, name.name);
    if (name.isDirectory()) walkFiles(next, acc);
    else acc.push(next);
  }
  return acc;
};

/** Runtime / gitignored session files are not plan inventory. */
export const isRuntimePath = (path) => path.startsWith(".cursor/local/");

export const isGlobPath = (path) => /[*?]/.test(path);

export const pathExistsInRepo = (root, path, kitRoot = findKitRoot()) => {
  if (isRuntimePath(path) || isGlobPath(path)) return true;
  if (existsSync(join(root, path)) || existsSync(join(kitRoot, path))) return true;

  const name = basename(path);
  const underCursor = path.startsWith(".cursor/");
  if (!underCursor) return false;

  const searchRoots = [...new Set([root, kitRoot])];
  if (path.startsWith(".cursor/hooks/") && name.endsWith(".mjs")) {
    return searchRoots.some((base) =>
      walkFiles(join(base, ".cursor/hooks")).some((file) => basename(file) === name),
    );
  }
  if (path.endsWith("/SKILL.md")) {
    const skill = basename(dirname(path));
    // Skill bodies live locally under .cursor/skills or hosted under services/brain/skills.
    const skillDirs = searchRoots.flatMap((base) => [
      join(base, ".cursor/skills"),
      join(base, "services/brain/skills"),
    ]);
    return skillDirs.some((dir) =>
      walkFiles(dir).some(
        (file) => basename(file) === "SKILL.md" && basename(dirname(file)) === skill,
      ),
    );
  }
  if (name === "config.json" && path.includes("autodevelop")) {
    return Boolean(
      findInstanceFile(root, "autodevelop", "config.json") ||
        searchRoots.some(
          (base) =>
            existsSync(join(base, ".cursor/skills/autodevelop-internal/config.json")) ||
            existsSync(join(base, ".cursor/skills/autodevelop-internal/config.example.json")),
        ),
    );
  }
  if (name === "aliases.json") {
    return searchRoots.some((base) =>
      walkFiles(join(base, ".cursor/skills")).some((file) => basename(file) === "aliases.json"),
    );
  }
  if (name === "lib.mjs" && path.startsWith(".cursor/hooks/")) {
    return searchRoots.some((base) => existsSync(join(base, ".cursor/hooks/autodevelop/lib.mjs")));
  }
  return false;
};
