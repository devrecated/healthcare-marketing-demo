/**
 * Copyright (c) 2026 Devrecated.
 * Linked-worktree status for the stop / afterAgentResponse hook and rogue cleanup.
 */
import { existsSync, lstatSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";

const git = (cwd, args, allowFail = false) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFail) return "";
    throw error;
  }
};

export const FOOTER_MARK = "- worktree:";

export const checkoutCommand = (directory) => {
  const path = String(directory || "");
  const quoted = /[\s'"\\]/.test(path) ? JSON.stringify(path) : path;
  return `cursor --reuse-window ${quoted}`;
};

export const formatWorktreeBlock = (info) =>
  [
    `${FOOTER_MARK} ${info.directory}`,
    `- branch: ${info.branch}`,
    `- commits: ${info.commits}`,
    `- created: ${info.created}`,
    `- pushed: ${info.pushed}`,
    `- checkout: ${checkoutCommand(info.directory)}`,
  ].join("\n");

export const replyHasWorktreeFooter = (text) => /^- worktree:\s/im.test(String(text || ""));

export const isLinkedWorktree = (cwd = process.cwd()) => {
  const top = git(cwd, ["rev-parse", "--show-toplevel"], true);
  const marker = join(top || resolve(cwd), ".git");
  try {
    return lstatSync(marker).isFile();
  } catch {
    return false;
  }
};

const createdAt = (directory) => {
  try {
    const st = statSync(directory);
    const date = st.birthtimeMs && st.birthtimeMs > 0 ? st.birthtime : st.ctime;
    return date.toISOString();
  } catch {
    return "unknown";
  }
};

const remotePushed = (cwd) => {
  const upstream = git(cwd, ["rev-parse", "--abbrev-ref", "@{u}"], true);
  if (!upstream) return false;
  const ahead = git(cwd, ["rev-list", "--count", "@{u}..HEAD"], true);
  return ahead === "0";
};

const commitList = (cwd) => {
  const base =
    git(cwd, ["rev-parse", "--verify", "origin/master"], true) ||
    git(cwd, ["rev-parse", "--verify", "master"], true) ||
    git(cwd, ["rev-parse", "--verify", "origin/release"], true);
  const range = base ? `${base}..HEAD` : "--max-count=20";
  const log = git(cwd, ["log", "--oneline", range], true);
  if (!log) return "(none)";
  const lines = log.split("\n").filter(Boolean);
  if (lines.length > 15) {
    return `${lines.slice(0, 15).join("; ")} (+${lines.length - 15} more)`;
  }
  return lines.join("; ");
};

export const describeCheckout = (cwd = process.cwd()) => {
  const directory = git(cwd, ["rev-parse", "--show-toplevel"], true) || resolve(cwd);
  const linked = existsSync(directory) && isLinkedWorktree(directory);
  const branch = git(directory, ["rev-parse", "--abbrev-ref", "HEAD"], true) || "HEAD";
  const dirty = Boolean(git(directory, ["status", "--porcelain"], true));
  const info = {
    linked,
    directory,
    branch,
    commits: commitList(directory),
    created: createdAt(directory),
    pushed: remotePushed(directory),
    dirty,
  };
  return { ...info, block: formatWorktreeBlock(info) };
};

export const collectWorktreeStatus = (cwd = process.cwd()) => {
  const info = describeCheckout(cwd);
  if (!info.linked) return { linked: false, directory: info.directory, block: "" };
  return info;
};

const parseWorktreePorcelain = (cwd) => {
  const porcelain = git(cwd, ["worktree", "list", "--porcelain"], true);
  if (!porcelain) return [];
  const rows = [];
  let current = null;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) rows.push(current);
      current = { directory: line.slice(9), branch: "", bare: false };
    } else if (line.startsWith("branch ") && current) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    } else if (line === "bare" && current) {
      current.bare = true;
    } else if (line.startsWith("HEAD ") && current) {
      current.head = line.slice(5);
    }
  }
  if (current) rows.push(current);
  return rows.filter((row) => row.directory && !row.bare);
};

export const listCheckoutRows = (cwd = process.cwd()) => parseWorktreePorcelain(cwd);

export const listLinkedWorktrees = (cwd = process.cwd()) =>
  listCheckoutRows(cwd).filter((row) => isLinkedWorktree(row.directory));

const scoreCheckout = (row, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const dir = row.directory.toLowerCase();
  const base = basename(row.directory).toLowerCase();
  const parent = basename(dirname(row.directory)).toLowerCase();
  const branch = String(row.branch || "").toLowerCase();
  if (dir === q) return 100;
  if (branch === q) return 90;
  if (parent === q) return 80;
  if (base === q) return 70;
  if (dir.endsWith(`/${q}`) || dir.endsWith(q)) return 40;
  if (parent.includes(q) || branch.includes(q) || base.includes(q)) return 30;
  return 0;
};

/** Path, branch, or worktree folder name. Strong unique match wins; ties stay ambiguous. */
export const matchCheckouts = (query, cwd = process.cwd()) => {
  const scored = listCheckoutRows(cwd)
    .map((row) => ({ row, score: scoreCheckout(row, query) }))
    .filter((item) => item.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((item) => item.score));
  return scored.filter((item) => item.score === best).map((item) => item.row);
};
