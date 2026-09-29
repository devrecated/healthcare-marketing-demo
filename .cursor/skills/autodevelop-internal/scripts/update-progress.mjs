#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 */
import { loadConfig } from "./config-load.mjs";
import { argValue, fail, parseArgs, printJson, runCommand } from "./lib.mjs";
import { readSession, writeSession } from "./session.mjs";

export const progressComment = ({
  started,
  moved,
  remakes,
  remaining,
  finishEta,
  prodEta,
  stakeholders,
}) =>
  [
    "## Progress",
    started ? `- Started: ${started}` : null,
    moved ? `- Moved: ${moved}` : null,
    remakes ? `- Remakes / issues: ${remakes}` : null,
    remaining ? `- Remaining: ${remaining}` : null,
    finishEta ? `- Estimate to finish: ${finishEta}` : null,
    prodEta ? `- Estimate to production: ${prodEta}` : null,
    stakeholders ? `- Stakeholders still needed: ${stakeholders}` : null,
  ]
    .filter(Boolean)
    .join("\n") + "\n";

if (process.argv[1]?.endsWith("update-progress.mjs")) {
  const args = parseArgs();
  try {
    const { config } = loadConfig({ requireInstance: !args.dryRun, allowExample: args.dryRun });
    const issue = argValue(args, "issue");
    if (!issue) fail("Missing --issue.");
    const body = progressComment({
      started: argValue(args, "started"),
      moved: argValue(args, "moved"),
      remakes: argValue(args, "remakes"),
      remaining: argValue(args, "remaining"),
      finishEta: argValue(args, "finish-eta"),
      prodEta: argValue(args, "prod-eta"),
      stakeholders: argValue(args, "stakeholders"),
    });
    const repo = `${config.github.owner}/${config.github.repo}`;
    const result = runCommand(
      "gh",
      ["issue", "comment", issue, "--repo", repo, "--body", body],
      { dryRun: args.dryRun },
    );
    if ((result.ok || args.dryRun) && !args.dryRun) {
      const { session } = readSession();
      if (session && String(session.issue) === String(issue)) {
        session.lastProgressAt = new Date().toISOString();
        writeSession(session);
      }
    }
    printJson({ ok: result.ok || args.dryRun, dryRun: args.dryRun, body, command: result.preview || null });
    if (!result.ok && !args.dryRun) process.exit(result.status);
  } catch (error) {
    fail(error.message);
  }
}
