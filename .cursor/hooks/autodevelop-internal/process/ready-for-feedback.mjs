#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, collectStrings, readHookInput, writeHookOutput } from "../lib.mjs";
import { readSession, writeSession } from "../../../skills/autodevelop-internal/scripts/session.mjs";

const READY = /\b(done|ready for review|ship|feature complete|in review)\b/i;
const RATE_MS = 30 * 60 * 1000;

try {
  const input = await readHookInput();
  const { session } = readSession();
  if (!session?.issue) {
    writeHookOutput({});
    process.exit(0);
  }
  const last = Number(session.lastShareAskAt || 0);
  if (last && Date.now() - last < RATE_MS) {
    writeHookOutput({});
    process.exit(0);
  }
  const blob = collectStrings(input).join("\n");
  const command = asString(input.command);
  const looksReady = READY.test(blob) || /gh\s+pr\s+create/.test(command);
  const files = Array.isArray(session.filesTouched) ? session.filesTouched.length : 0;
  if (!looksReady && files < 8) {
    writeHookOutput({});
    process.exit(0);
  }
  session.lastShareAskAt = Date.now();
  writeSession(session);
  writeHookOutput({
    additional_context:
      "In your normal reply, ask PDF, PPT, video, or skip for share-stakeholder-update. Do not start a new turn. Do not email unless they confirm.",
  });
} catch {
  writeHookOutput({});
}
