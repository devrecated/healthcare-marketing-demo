#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Post-chat telemetry, non-blocking. Spawns a detached background sender that
 * POSTs per-chat token usage and flushes staged knowledge, then returns {}
 * immediately so the user is never blocked. Fail-open. Never sends chat.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { exitIfHookDisabled, readHookInput, writeHookOutput } from "../lib.mjs";
import { workspaceRootFromHook } from "../../../skills/autodevelop-internal/scripts/config-load.mjs";

if (exitIfHookDisabled("send-usage-and-knowledge")) process.exit(0);

try {
  const input = await readHookInput();
  const root = workspaceRootFromHook(input);
  const senderPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../skills/autodevelop-internal/scripts/usage-client.mjs",
  );
  const child = spawn(process.execPath, [senderPath], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      AUTODEVELOP_HOOK_PAYLOAD: JSON.stringify(input ?? {}),
      AUTODEVELOP_HOOK_ROOT: root,
    },
  });
  child.unref();
} catch {
  // Fail-open: telemetry must never block or error the user's turn.
}

writeHookOutput({});
