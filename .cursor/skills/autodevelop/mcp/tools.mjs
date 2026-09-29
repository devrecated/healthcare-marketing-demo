/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Read-only kit tools for the Autodevelop stdio MCP. No mail, issues, or deploys.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig, workspaceRootFromHook } from "../scripts/config-load.mjs";
import { readPeopleFile, validatePeople } from "../scripts/people.mjs";
import { readSession, shouldAskProgress } from "../scripts/session.mjs";

export const WORKSPACE_ROOT_REQUIRED =
  "workspace_root is required (the consumer git/app root). User-scope plugin cwd is the plugin, not the workspace.";

export const TOOL_NAMES = ["kit_doctor", "kit_config", "kit_session", "kit_people", "kit_git"];

export const resolveWorkspaceRoot = (args = {}) => {
  const raw = args.workspace_root ?? args.workspaceRoot;
  if (raw == null || !String(raw).trim()) {
    throw new Error(WORKSPACE_ROOT_REQUIRED);
  }
  return workspaceRootFromHook({ workspace_path: String(raw).trim() });
};

const git = (root, args) =>
  spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 5000 });

const vsRef = (root, ref) => {
  const verify = git(root, ["rev-parse", "--verify", ref]);
  if (verify.status !== 0) return { exists: false };
  const count = git(root, ["rev-list", "--left-right", "--count", `HEAD...${ref}`]);
  if (count.status !== 0) return { exists: true };
  const [ahead, behind] = count.stdout.trim().split(/\s+/).map((n) => Number(n));
  return { exists: true, ahead, behind };
};

const doctorCandidates = (root) => [
  join(root, "scripts", "doctor.mjs"),
  fileURLToPath(new URL("../../../../scripts/doctor.mjs", import.meta.url)),
];

export const kitDoctor = async (root, env = process.env) => {
  const path = doctorCandidates(root).find((item) => existsSync(item));
  if (!path) {
    return {
      ok: false,
      bound: false,
      hardFails: ["scripts/doctor.mjs is not in this repository"],
      checks: [],
    };
  }
  const { runDoctor } = await import(pathToFileURL(path).href);
  const result = runDoctor({ root, env });
  return {
    ok: result.ok,
    bound: result.bound,
    hardFails: result.hardFails,
    checks: result.checks.map(({ name, ok, detail }) => ({ name, ok, detail })),
  };
};

export const kitConfig = (root) => {
  const loaded = loadConfig({ allowExample: true, root });
  const { config, source, instance } = loaded;
  return {
    source,
    instance: instance || null,
    board: {
      provider: config.board?.provider || "github",
    },
    github: {
      owner: config.github.owner,
      repo: config.github.repo,
      projectNumber: config.github.projectNumber,
    },
    mail: {
      firestoreProject: config.mail.firestoreProject,
      allowlistCount: Array.isArray(config.mail.allowlist) ? config.mail.allowlist.length : 0,
    },
    preview: {
      firebaseProject: config.preview.firebaseProject,
      baseBranch: config.preview.baseBranch,
    },
    forbiddenProjectCount: Array.isArray(config.forbiddenProjects) ? config.forbiddenProjects.length : 0,
  };
};

export const kitSession = (root) => {
  const { session } = readSession(root);
  if (!session) {
    return { issue: null, title: null, startedAt: null, lastProgressAt: null, lastTouchedAt: null, shouldAskProgress: false };
  }
  return {
    issue: session.issue ?? null,
    title: session.title ?? null,
    startedAt: session.startedAt ?? null,
    lastProgressAt: session.lastProgressAt ?? null,
    lastTouchedAt: session.lastTouchedAt ?? null,
    shouldAskProgress: shouldAskProgress(session),
  };
};

export const kitPeople = (root) => {
  const { path, people } = readPeopleFile(root);
  const present = people != null;
  return {
    present,
    path: present ? path : null,
    errors: present ? validatePeople(people) : [],
    developerCount: present && Array.isArray(people.developers) ? people.developers.length : 0,
    stakeholderCount: present && Array.isArray(people.stakeholders) ? people.stakeholders.length : 0,
  };
};

export const kitGit = (root) => {
  const head = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (head.status !== 0) {
    return { git: false, error: "not a git work tree" };
  }
  const porcelain = git(root, ["status", "--porcelain"]);
  return {
    git: true,
    branch: head.stdout.trim(),
    dirty: Boolean((porcelain.stdout || "").trim()),
    originMaster: vsRef(root, "origin/master"),
    originRelease: vsRef(root, "origin/release"),
  };
};

export const HANDLERS = {
  kit_doctor: (root, env) => kitDoctor(root, env),
  kit_config: (root) => kitConfig(root),
  kit_session: (root) => kitSession(root),
  kit_people: (root) => kitPeople(root),
  kit_git: (root) => kitGit(root),
};

export const callTool = async (name, args = {}, env = process.env) => {
  const handler = HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}. Allowed: ${TOOL_NAMES.join(", ")}`);
  }
  const root = resolve(resolveWorkspaceRoot(args));
  return handler(root, env);
};

export const toolDefinitions = () =>
  TOOL_NAMES.map((name) => ({
    name,
    description: {
      kit_doctor: "Read-only Autodevelop doctor: PATH bins, gh auth, config bound, Firebase creds present. No tokens.",
      kit_config:
        "Redacted instance config: source, board.provider, github owner/repo/projectNumber, mail/preview project ids, allowlist and forbidden counts. Never emails.",
      kit_session: "Active board session: issue, title, timestamps, whether a progress comment is due.",
      kit_people: "people.json present, validation errors, developer and stakeholder counts only.",
      kit_git: "Local git only (no fetch): branch, dirty, HEAD vs origin/master and origin/release if those refs exist.",
    }[name],
    inputSchema: {
      type: "object",
      properties: {
        workspace_root: {
          type: "string",
          description: "Consumer git/app root. Required because plugin cwd is the plugin tree.",
        },
      },
      required: ["workspace_root"],
    },
  }));
