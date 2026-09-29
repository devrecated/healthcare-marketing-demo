#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * afterAgentResponse: record whether the reply already has the worktree footer.
 * stop: if this window is a linked worktree and the footer is missing, one
 * follow-up (loop_limit: 1) so the block lands before the turn ends.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHookDisabled, readHookInput, writeHookOutput } from "../lib.mjs";
import { collectWorktreeStatus, replyHasWorktreeFooter } from "./worktree-info.mjs";

const stampPath = () => {
  const root = collectWorktreeStatus().directory;
  return join(root, ".cursor", "local", "worktree-footer.json");
};

const readStamp = () => {
  try {
    return JSON.parse(readFileSync(stampPath(), "utf8"));
  } catch {
    return { ok: true };
  }
};

const writeStamp = (data) => {
  const path = stampPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data)}\n`);
};

const eventName = (input) =>
  String(input.hook_event_name || input.hookEventName || input.event || "").toLowerCase();

try {
  if (exitIfHookDisabled("worktree-status")) process.exit(0);
  const input = await readHookInput();
  const status = collectWorktreeStatus();
  const event = eventName(input);

  if (!status.linked) {
    writeStamp({ ok: true, linked: false });
    writeHookOutput({});
    process.exit(0);
  }

  if (event.includes("afteragentresponse") || event.includes("agentresponse")) {
    const text = String(input.text || input.response || "");
    const ok = replyHasWorktreeFooter(text);
    writeStamp({ ok, linked: true, block: status.block, at: new Date().toISOString() });
    writeHookOutput({});
    process.exit(0);
  }

  const loopCount = Number(input.loop_count ?? input.loopCount ?? 0);
  const stamp = readStamp();
  if (stamp.ok || loopCount > 0) {
    writeHookOutput({});
    process.exit(0);
  }

  writeStamp({ ok: true, linked: true, forced: true, at: new Date().toISOString() });
  writeHookOutput({
    additional_context: [
      "This window is a git worktree. Append this exact block at the end of your reply, then stop. Do not start new work.",
      "",
      status.block,
    ].join("\n"),
  });
} catch {
  writeHookOutput({});
}
