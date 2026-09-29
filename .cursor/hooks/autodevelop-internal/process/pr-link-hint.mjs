#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, readHookInput, writeHookOutput } from "../lib.mjs";
import { readSession } from "../../../skills/autodevelop-internal/scripts/session.mjs";

try {
  const input = await readHookInput();
  const command = asString(input.command);
  if (!/gh\s+pr\s+create/.test(command)) {
    writeHookOutput({});
    process.exit(0);
  }
  const { session } = readSession();
  if (!session?.issue) {
    writeHookOutput({});
    process.exit(0);
  }
  const linked = new RegExp(`(?:Closes|Refs)\\s+#${session.issue}\\b`, "i").test(command);
  if (linked) {
    writeHookOutput({});
    process.exit(0);
  }
  writeHookOutput({
    additional_context: `PR is missing Closes/Refs #${session.issue}. In your normal reply, run link-pr.mjs after they confirm. Do not start a new turn.`,
  });
} catch {
  writeHookOutput({});
}
