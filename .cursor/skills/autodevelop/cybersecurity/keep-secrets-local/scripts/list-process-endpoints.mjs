#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated.
 *
 * Local lsof snapshot for Cursor (or --pid). No payloads. --all is opt-in.
 */
import { execFileSync } from "node:child_process";

const pidArg = (() => {
  const i = process.argv.indexOf("--pid");
  return i === -1 ? "" : process.argv[i + 1];
})();
const allPids = process.argv.includes("--all");

const run = (args) => {
  try {
    return execFileSync("lsof", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return error.stdout || "";
  }
};

const parse = (text, commandPrefix) => {
  const listen = new Set();
  const remote = new Set();
  const procs = new Set();
  for (const line of text.split("\n").slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(/\s+/);
    const command = cols[0];
    if (commandPrefix && !command.toLowerCase().startsWith(commandPrefix)) {
      continue;
    }
    const pid = cols[1];
    const name = cols.slice(8).join(" ");
    procs.add(`${command}\t${pid}`);
    if (/\bLISTEN\b/.test(line)) {
      const m = name.match(/:(\d+)\s+\(LISTEN\)/);
      if (m) listen.add(`${command}:${m[1]}`);
      continue;
    }
    const est = name.match(/->([^:]+:\d+)/);
    if (est) remote.add(`${command}\t${est[1]}`);
  }
  return { listen, remote, procs };
};

const args = ["-nP", "-iTCP"];
if (pidArg) {
  args.push("-p", pidArg);
} else if (!allPids) {
  args.push("-c", "Cursor");
}

const commandPrefix = pidArg || allPids ? "" : "cursor";
const { listen, remote, procs } = parse(run(args), commandPrefix);

console.log("## processes");
for (const row of [...procs].sort()) console.log(row);
console.log("## listen");
for (const row of [...listen].sort()) console.log(row);
console.log("## established_remote");
for (const row of [...remote].sort()) console.log(row);
