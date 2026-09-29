#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { asString, collectStrings, readHookInput, writeHookOutput } from "../lib.mjs";
import { readSession } from "../../../skills/autodevelop-internal/scripts/session.mjs";
import { hasVerbalAcceptance } from "../../../skills/autodevelop-internal/scripts/people.mjs";

const PROD_RELEASE =
  /\b(?:env:prod|deploy:prod|release:prod|release-prod|deploy:docs:prod)\b/i;

const ALLOWED = new Set(["Accepted by owner", "Ready for deploy", "Done"]);

try {
  const input = await readHookInput();
  const command = asString(input.command || input.cmd || collectStrings(input).find((s) => /\s/.test(s)));
  if (!PROD_RELEASE.test(command)) {
    writeHookOutput({ permission: "allow" });
    process.exit(0);
  }
  const { session } = readSession();
  if (!session?.issue) {
    writeHookOutput({ permission: "allow" });
    process.exit(0);
  }
  if (ALLOWED.has(session.status) || hasVerbalAcceptance(session.verbalAcceptance)) {
    writeHookOutput({ permission: "allow" });
    process.exit(0);
  }
  writeHookOutput({
    permission: "deny",
    user_message:
      "Blocked: this ticket is not Accepted by owner. Confirm verbal acceptance (comment on the issue) or wait for the stakeholder reply before production deploy.",
    agent_message:
      "A project hook denied production deploy because the session ticket is not Accepted by owner and has no verbal-acceptance note.",
  });
} catch {
  writeHookOutput({ permission: "allow" });
}
