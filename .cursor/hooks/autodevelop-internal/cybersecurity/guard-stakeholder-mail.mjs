#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, collectStrings, readHookInput, writeHookOutput } from "../lib.mjs";
import { hasValidConfirmToken } from "../../../skills/autodevelop-internal/scripts/confirm-token.mjs";

const MAIL_WRITE =
  /send-stakeholder-mail\.mjs|\.collection\(\s*['"]mail['"]\s*\)|collection\(\s*['"]mail['"]\s*\)/;

const confirmFrom = (command) => {
  const match = String(command).match(/--confirm(?:=|\s+)([A-Za-z0-9]+)/);
  return match ? match[1] : "";
};

try {
  const input = await readHookInput();
  const command = asString(input.command || input.cmd || collectStrings(input).find((s) => /\s/.test(s)));
  if (!MAIL_WRITE.test(command)) {
    writeHookOutput({ permission: "allow" });
    process.exit(0);
  }
  if (hasValidConfirmToken(confirmFrom(command))) {
    writeHookOutput({ permission: "allow" });
    process.exit(0);
  }
  writeHookOutput({
    permission: "deny",
    user_message: "Blocked: stakeholder mail needs an explicit yes and --confirm <token>.",
    agent_message: "A project hook denied Firestore mail / send-stakeholder-mail without a valid confirm token.",
  });
} catch {
  writeHookOutput({
    permission: "deny",
    user_message: "Blocked: mail guard failed closed.",
    agent_message: "Stakeholder mail guard failed closed.",
  });
}
