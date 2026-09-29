#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Session-end outcome log. Fail-open. Never sends mail or chat.
 */
import { exitIfHookDisabled, readHookInput, writeHookOutput } from "../lib.mjs";
import { workspaceRootFromHook } from "../../../skills/autodevelop-internal/scripts/config-load.mjs";
import { readSession } from "../../../skills/autodevelop-internal/scripts/session.mjs";
import {
  classifySessionOutcome,
  consumeOutcomeDecision,
  detectWorkspaceKind,
  postOutcome,
  readOutcomeState,
} from "../../../skills/autodevelop-internal/scripts/outcomes-client.mjs";

if (exitIfHookDisabled("log-session-outcome")) process.exit(0);

try {
  const input = await readHookInput();
  const root = workspaceRootFromHook(input);
  const { session } = readSession(root);
  const state = readOutcomeState(root);
  const decision = classifySessionOutcome({ session, state });
  if (!decision) {
    writeHookOutput({});
    process.exit(0);
  }

  const posted = await postOutcome({
    source: "plugin",
    outcome: decision.outcome,
    skill: decision.skill,
    error_class: decision.error_class,
    feedback: decision.feedback,
    workspace_kind: detectWorkspaceKind(root),
  });

  if (posted.ok) consumeOutcomeDecision(decision, root);

  if (posted.ok && decision.outcome === "failure") {
    writeHookOutput({
      additional_context:
        "A Failed product outcome was logged. Mention that briefly if useful. Do not paste the conversation.",
    });
  } else {
    writeHookOutput({});
  }
} catch {
  writeHookOutput({});
}
