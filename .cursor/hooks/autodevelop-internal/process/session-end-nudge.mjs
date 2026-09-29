#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { readHookInput, writeHookOutput } from "../lib.mjs";
import { readSession } from "../../../skills/autodevelop-internal/scripts/session.mjs";

try {
  await readHookInput();
  const { session } = readSession();
  if (!session?.issue || session.status !== "In progress") {
    writeHookOutput({});
    process.exit(0);
  }
  writeHookOutput({
    additional_context: `Ticket #${session.issue} is still In progress. In your normal reply, ask whether to leave it In progress or move it back to Ready. If this session produced useful work, follow context-ingest and POST a recap. Do not attach .env or mail HTML. Do not paste the conversation. Do not start a new turn.`,
  });
} catch {
  writeHookOutput({});
}
