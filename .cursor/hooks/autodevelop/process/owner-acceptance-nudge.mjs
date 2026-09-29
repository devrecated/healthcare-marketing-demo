#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, readHookInput, writeHookOutput } from "../lib.mjs";
import { readSession } from "../../../skills/autodevelop-internal/scripts/session.mjs";

try {
  const input = await readHookInput();
  const command = asString(input.command);
  const { session } = readSession();
  const afterStatus =
    /set-status\.mjs/.test(command) && /Owner acceptance/.test(command);
  const afterPr = /gh\s+pr\s+create/.test(command);
  if (!session?.issue) {
    writeHookOutput({});
    process.exit(0);
  }
  if (!afterStatus && !afterPr && session.status !== "Owner acceptance") {
    writeHookOutput({});
    process.exit(0);
  }
  if (session.acceptanceMailSent) {
    writeHookOutput({});
    process.exit(0);
  }
  if (afterStatus || afterPr || session.status === "Owner acceptance") {
    writeHookOutput({
      additional_context: `Ticket #${session.issue} is in Owner acceptance. In your normal reply, ask to send the owner-acceptance mail via share-stakeholder-update. Do not start a new turn. Do not email unless they confirm.`,
    });
    process.exit(0);
  }
  writeHookOutput({});
} catch {
  writeHookOutput({});
}
