#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * Never followup_message — that injects a new chat turn. Progress asks happen
 * in the agent's normal reply via additional_context on file edits.
 */
import { readHookInput, writeHookOutput } from "../lib.mjs";

try {
  await readHookInput();
  writeHookOutput({});
} catch {
  writeHookOutput({});
}
