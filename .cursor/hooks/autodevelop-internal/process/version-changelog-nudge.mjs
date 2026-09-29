#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, workspaceRootFromHook } from "../../../skills/autodevelop-internal/scripts/config-load.mjs";
import { readHookInput, writeHookOutput } from "../lib.mjs";

const readText = (root, rel) => {
  if (!rel) return "";
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return "";
  }
};

try {
  const input = await readHookInput();
  const root = workspaceRootFromHook(input);
  let tree = "";
  try {
    tree = loadConfig({ root, allowExample: true }).config?.docs?.tree || "";
  } catch {
    tree = "";
  }
  const version = readText(root, "VERSION").replace(/\s+/g, "");
  if (!/^\d+\.\d+\.\d+$/.test(version) || !tree) {
    writeHookOutput({});
    process.exit(0);
  }
  const heading = new RegExp(`^## (v)?${version.replace(/\./g, "\\.")}( |$)`, "m");
  const biz = heading.test(readText(root, `${tree}/business/changelog.md`));
  const dev = heading.test(readText(root, `${tree}/developer/changelog.md`));
  const app = readText(root, "web/app/src/constants/appVersion.ts").includes(`'${version}'`);
  if (biz && dev && app) {
    writeHookOutput({});
    process.exit(0);
  }
  writeHookOutput({
    additional_context:
      `VERSION is ${version} but changelog headings or APP_VERSION are out of sync. In your normal reply, mention provision-production-release. Do not start a new turn.`,
  });
} catch {
  writeHookOutput({});
}
