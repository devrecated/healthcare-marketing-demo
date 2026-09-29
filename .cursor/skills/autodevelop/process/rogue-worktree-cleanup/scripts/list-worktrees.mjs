#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 * Print linked worktrees (not the primary checkout) for /rogue-worktree-cleanup.
 */
import { describeCheckout, listLinkedWorktrees } from "../../../../../hooks/autodevelop/process/worktree-info.mjs";

const rows = listLinkedWorktrees(process.cwd());
if (!rows.length) {
  console.log("No linked worktrees (only the primary checkout).");
  process.exit(0);
}

for (const row of rows) {
  const status = describeCheckout(row.directory);
  console.log("---");
  console.log(status.block);
  console.log(`dirty: ${status.dirty}`);
}
