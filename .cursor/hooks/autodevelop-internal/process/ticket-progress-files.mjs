#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, readHookInput, writeHookOutput } from "../lib.mjs";
import {
  isTicketProgressPath,
  readSession,
  shouldAskProgress,
  touchSessionFile,
} from "../../../skills/autodevelop-internal/scripts/session.mjs";

const pathFromInput = (input) => {
  const toolInput = input.tool_input || input.toolInput || input.arguments || {};
  const candidates = [
    toolInput.path,
    toolInput.file_path,
    toolInput.filePath,
    toolInput.target_file,
    input.file_path,
    input.path,
  ];
  return asString(candidates.find((value) => typeof value === "string" && value && !value.startsWith("{")));
};

try {
  const input = await readHookInput();
  const path = pathFromInput(input);
  if (path) touchSessionFile(path);
  const { session } = readSession();
  if (session?.issue && isTicketProgressPath(path) && shouldAskProgress(session)) {
    writeHookOutput({
      additional_context: `Ticket #${session.issue} has product file changes since the last progress comment. In your normal reply, ask the user if they want a progress comment posted. Do not post until they say yes. Do not start a new turn. Do not invent estimates. Do not write Firestore mail.`,
    });
  } else {
    writeHookOutput({});
  }
} catch {
  writeHookOutput({});
}
