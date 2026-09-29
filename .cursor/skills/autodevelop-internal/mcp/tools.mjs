/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Kit tools for the Autodevelop stdio MCP. Read-only except kit_knowledge_stage,
 * which appends a sanitized local knowledge note. No mail, issues, or deploys.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig, workspaceRootFromHook } from "../scripts/config-load.mjs";
import { readPeopleFile, validatePeople } from "../scripts/people.mjs";
import { readSession, shouldAskProgress } from "../scripts/session.mjs";
import { KNOWLEDGE_KINDS, readPending, stageKnowledge } from "../scripts/knowledge-stage.mjs";

export const WORKSPACE_ROOT_REQUIRED =
  "workspace_root is required (the consumer git/app root). User-scope plugin cwd is the plugin, not the workspace.";

export const TOOL_NAMES = [
  "kit_doctor",
  "kit_config",
  "kit_session",
  "kit_people",
  "kit_git",
  "kit_knowledge_stage",
  "kit_knowledge_pending",
];

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
  join(root, "scripts", "doctor", "doctor.mjs"),
  join(root, "scripts", "doctor.mjs"),
  fileURLToPath(new URL("../../../../scripts/doctor/doctor.mjs", import.meta.url)),
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

const originRemote = (root) => {
  const remote = git(root, ["remote", "get-url", "origin"]);
  return remote.status === 0 ? remote.stdout.trim() : "";
};

export const kitKnowledgeStage = (root, args = {}) => {
  const note = args.note ?? args.text ?? "";
  const { session } = readSession(root);
  const entry = stageKnowledge(root, {
    note,
    title: args.title ?? "",
    kind: args.kind ?? "note",
    repoUrl: originRemote(root),
    ticket: session?.issue ?? null,
  });
  if (!entry) {
    throw new Error(
      "note is required: a short knowledge statement (decision, change, blocker, learning) — not the chat transcript.",
    );
  }
  return {
    staged: true,
    kind: entry.kind,
    title: entry.title,
    repo_url: entry.repo_url,
    ticket: entry.ticket,
    pending: readPending(root).length,
  };
};

export const kitKnowledgePending = (root) => {
  const entries = readPending(root);
  return {
    count: entries.length,
    repo_url: entries.length ? entries[entries.length - 1].repo_url : null,
    ticket: entries.length ? entries[entries.length - 1].ticket : null,
    preview: entries.slice(0, 10).map((entry) => ({
      kind: entry.kind,
      title: entry.title,
      at: entry.at,
    })),
  };
};

export const HANDLERS = {
  kit_doctor: (root, env) => kitDoctor(root, env),
  kit_config: (root) => kitConfig(root),
  kit_session: (root) => kitSession(root),
  kit_people: (root) => kitPeople(root),
  kit_git: (root) => kitGit(root),
  kit_knowledge_stage: (root, env, args) => kitKnowledgeStage(root, args),
  kit_knowledge_pending: (root) => kitKnowledgePending(root),
};

export const callTool = async (name, args = {}, env = process.env) => {
  const handler = HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}. Allowed: ${TOOL_NAMES.join(", ")}`);
  }
  const root = resolve(resolveWorkspaceRoot(args));
  return handler(root, env, args);
};

const WORKSPACE_ROOT_PROP = {
  workspace_root: {
    type: "string",
    description: "Consumer git/app root. Required because plugin cwd is the plugin tree.",
  },
};

const EXTRA_PROPS = {
  kit_knowledge_stage: {
    note: {
      type: "string",
      description: "One short knowledge statement (a decision, change, blocker, or learning). Never the chat transcript or secrets.",
    },
    title: { type: "string", description: "Optional short label for the note." },
    kind: {
      type: "string",
      enum: KNOWLEDGE_KINDS,
      description: "Note kind. Defaults to note.",
    },
  },
};

const REQUIRED_PROPS = {
  kit_knowledge_stage: ["workspace_root", "note"],
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
      kit_knowledge_stage:
        "Stage one short, substantial knowledge note locally (repo + ticket scoped). The post-chat hook flushes staged notes to the org store. Never pass the chat transcript or secrets.",
      kit_knowledge_pending:
        "Count and preview knowledge notes staged this session but not yet flushed to the org store.",
    }[name],
    inputSchema: {
      type: "object",
      properties: { ...WORKSPACE_ROOT_PROP, ...(EXTRA_PROPS[name] || {}) },
      required: REQUIRED_PROPS[name] || ["workspace_root"],
    },
  }));
