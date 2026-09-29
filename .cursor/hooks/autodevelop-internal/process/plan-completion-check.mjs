#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workspaceRootFromHook } from "../../../skills/autodevelop-internal/scripts/config-load.mjs";
import { readHookInput, writeHookOutput } from "../lib.mjs";
import { extractInventoryPaths, parsePlanTodos, pathExistsInRepo } from "./plan-parse.mjs";

const newestPlan = (root) => {
  const dir = join(root, ".cursor", "plans");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".plan.md"))
    .map((name) => {
      const path = join(dir, name);
      return { path, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] || null;
};

try {
  const input = await readHookInput();
  const root = workspaceRootFromHook(input);
  const plan = newestPlan(root);
  if (!plan) {
    writeHookOutput({});
    process.exit(0);
  }
  const markdown = readFileSync(plan.path, "utf8");
  const pending = parsePlanTodos(markdown).filter((todo) => todo.status && todo.status !== "completed" && todo.status !== "cancelled");
  const missing = extractInventoryPaths(markdown).filter((path) => !pathExistsInRepo(root, path));
  if (!pending.length && !missing.length) {
    writeHookOutput({});
    process.exit(0);
  }
  const lines = ["Plan still has unfinished work. Do not treat the plan as done."];
  if (pending.length) {
    lines.push("Pending todos:");
    for (const todo of pending.slice(0, 12)) lines.push(`- ${todo.id}: ${todo.content || todo.status}`);
  }
  if (missing.length) {
    lines.push("Missing inventory paths:");
    for (const path of missing.slice(0, 12)) lines.push(`- ${path}`);
  }
  writeHookOutput({ additional_context: lines.join("\n") });
} catch {
  writeHookOutput({});
}
