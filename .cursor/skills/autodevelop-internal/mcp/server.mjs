#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Minimal JSON-RPC 2.0 stdio MCP. Read-only Autodevelop tools only.
 */
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { callTool, toolDefinitions } from "./tools.mjs";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "autodevelop", version: "1.0.0" };

const writeMessage = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const ok = (id, result) => writeMessage({ jsonrpc: "2.0", id, result });

const fail = (id, code, message) =>
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });

export const handleRequest = async (message) => {
  const { id, method, params } = message;
  if (id === undefined || id === null) return;

  if (method === "initialize") {
    ok(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
    return;
  }

  if (method === "ping") {
    ok(id, {});
    return;
  }

  if (method === "tools/list") {
    ok(id, { tools: toolDefinitions() });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    try {
      const result = await callTool(name, args);
      ok(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
      });
    } catch (error) {
      ok(id, {
        content: [{ type: "text", text: error.message }],
        isError: true,
      });
    }
    return;
  }

  fail(id, -32601, `Method not found: ${method}`);
};

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
})();

if (isMain) {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (message.jsonrpc !== "2.0") return;
    void handleRequest(message);
  });
}
