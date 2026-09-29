#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 *
 * Public handbook workflows in autodevelop-docs/workflows/ must exist
 * and each must be linked from index.md. Do not require a page per skill,
 * rule, or hook — those live under .cursor/.
 * Internal handbook stays in docs/internal/ and is not published.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "../../../scripts/config-load.mjs";

export const WORKFLOWS = [
  "initial-setup.md",
  "create-tickets.md",
  "notify-stakeholders.md",
  "ship-to-staging.md",
  "ship-to-production.md",
  "when-something-breaks.md",
];

export const handbookDir = (root) => join(root, "autodevelop-docs");

export const workflowPath = (root, name) => join(handbookDir(root), "workflows", name);

export const listWorkflowFiles = (root) => {
  const dir = join(handbookDir(root), "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".md")).toSorted();
};

export const checkInventory = (root) => {
  const index = readFileSync(join(handbookDir(root), "index.md"), "utf8");
  const onDisk = listWorkflowFiles(root);
  const missing = WORKFLOWS.filter((name) => !existsSync(workflowPath(root, name))).map((name) => ({
    kind: "missing-file",
    name,
  }));
  const unlinked = WORKFLOWS.filter(
    (name) => existsSync(workflowPath(root, name)) && !index.includes(`workflows/${name}`),
  ).map((name) => ({ kind: "unlinked", name }));
  const extra = onDisk
    .filter((name) => !WORKFLOWS.includes(name))
    .map((name) => ({ kind: "extra", name }));
  return { workflows: WORKFLOWS, onDisk, missing: [...missing, ...unlinked, ...extra] };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = findRepoRoot();
  const { workflows, missing } = checkInventory(root);
  if (missing.length) {
    process.stderr.write(
      `Handbook workflow check failed (${missing.length}):\n${missing
        .map((item) => `  ${item.kind}: autodevelop-docs/workflows/${item.name}`)
        .join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`ok  ${workflows.length} workflows listed and linked from index.md\n`);
}
