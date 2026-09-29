#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Deny edits that introduce forbidden package-boundary imports.
 * ADR: docs/internal/adr/autodevelop-sdk-and-package-boundaries.md
 */
import { asString, readHookInput, writeHookOutput } from "../lib.mjs";

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
  return asString(candidates.find((value) => typeof value === "string" && value));
};

const contentFromInput = (input) => {
  const toolInput = input.tool_input || input.toolInput || input.arguments || {};
  return [
    asString(toolInput.contents),
    asString(toolInput.new_string),
    asString(toolInput.content),
    asString(input.content),
  ]
    .filter(Boolean)
    .join("\n");
};

const normalize = (filePath) => String(filePath || "").replace(/\\/g, "/");

const hasClientSdkImport = (content) =>
  /from\s+["']@devrecated\/[a-z0-9-]+-sdk(\/[^"']*)?["']/.test(content) ||
  /(?:import|require)\s*\(\s*["']@devrecated\/[a-z0-9-]+-sdk(\/[^"']*)?["']\s*\)/.test(content) ||
  /packages\/[a-z0-9-]+-sdk/.test(content);

const hasServicesImport = (content) =>
  /from\s+["'][^"']*\/services\//.test(content) ||
  /(?:import|require)\s*\(\s*["'][^"']*\/services\//.test(content);

const forbiddenFor = (filePath, content) => {
  const path = normalize(filePath);
  const notes = [];

  if (/\/services\//.test(path) && hasClientSdkImport(content)) {
    notes.push(
      "DENIED: services/** must not import @devrecated/*-sdk (including autodevelop-sdk and capability SDKs). Share contracts via @devrecated/models (ADR autodevelop-sdk-and-package-boundaries).",
    );
  }
  if (/\/packages\/[a-z0-9-]+-sdk\//.test(path) && hasServicesImport(content)) {
    notes.push(
      "DENIED: packages/*-sdk must not import services/**. Keep SDKs client-only.",
    );
  }
  if (
    /\/packages\/cli\/(bin|customer|login|install|github|host|mcp-host|credentials|kit|direct-run|parse|host-mcp|kit-mcp|user-mcp|workspace-mcp)\./.test(
      path,
    ) &&
    hasServicesImport(content)
  ) {
    notes.push(
      "DENIED: customer CLI entry must not import services/**. Use @devrecated/autodevelop-sdk or @devrecated/models.",
    );
  }
  return notes;
};

const main = async () => {
  const input = await readHookInput();
  const filePath = pathFromInput(input);
  const content = contentFromInput(input);
  const notes = forbiddenFor(filePath, content);
  if (!notes.length) {
    writeHookOutput({});
    return;
  }
  writeHookOutput({
    permission: "deny",
    user_message: notes.join(" "),
    agent_message: notes.join(" "),
  });
};

main().catch((error) => {
  writeHookOutput({
    permission: "allow",
    agent_message: `package-boundaries hook error: ${error?.message || error}`,
  });
});
