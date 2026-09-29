#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_SEGMENTS = ["autodevelop"];
export const KIT_INSTANCE_SKIP = new Set([
  "autodevelop",
  "third-party",
]);

/** Workspace bind: policies, hyperparameters, and branch config. Not a skill tree. */
export const WORKSPACE_BIND_DIR = ".autodevelop";
export const DEFAULT_WORKSPACE_SLUG = "workspace";
export const BINDING_META_KEYS = Object.freeze(["slug"]);

/** This file lives at `.cursor/skills/autodevelop/scripts/config-load.mjs`. */
export const findKitRoot = (fromUrl = import.meta.url) =>
  resolve(dirname(fileURLToPath(fromUrl)), "..", "..", "..", "..");

export const kitScriptPath = (...rel) => join(dirname(fileURLToPath(import.meta.url)), ...rel);

export const workspaceRootFromHook = (input = {}, fallback = process.cwd()) => {
  const roots = input.workspace_roots || input.workspaceRoots;
  if (Array.isArray(roots) && roots[0]) return resolve(String(roots[0]));
  const named = input.workspace_path || input.workspacePath;
  if (named) return resolve(String(named));
  if (input.cwd) return resolve(String(input.cwd));
  try {
    return findRepoRoot(fallback);
  } catch {
    return resolve(fallback);
  }
};

const hasSkills = (dir) => existsSync(join(dir, ".cursor", "skills"));

const walkForSkills = (startDir) => {
  let dir = startDir;
  for (let i = 0; i < 16; i += 1) {
    if (hasSkills(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

export const findRepoRoot = (startDir = process.cwd()) => {
  if (hasSkills(startDir)) return startDir;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir,
      encoding: "utf8",
    }).trim();
    if (top && hasSkills(top)) return top;
    if (top) return top;
  } catch {
    // not a git work tree
  }
  const walked = walkForSkills(startDir);
  if (walked) return walked;
  throw new Error("Could not find repo root (no .cursor/skills and not a git work tree).");
};

export const findWorkspaceBindDir = (root) => {
  const path = join(root, WORKSPACE_BIND_DIR);
  return existsSync(path) ? path : null;
};

export const readWorkspaceSlug = (bindDir) => {
  const path = join(bindDir, "config.json");
  if (!existsSync(path)) return DEFAULT_WORKSPACE_SLUG;
  try {
    const config = JSON.parse(readFileSync(path, "utf8"));
    const slug = String(config.slug || "")
      .trim()
      .toLowerCase();
    if (/^[a-z][a-z0-9-]{1,48}$/.test(slug) && !KIT_INSTANCE_SKIP.has(slug)) {
      return slug;
    }
  } catch {
    // ignore unreadable bind config
  }
  return DEFAULT_WORKSPACE_SLUG;
};

export const listInstanceNames = (root) => {
  const names = new Set();
  const bind = findWorkspaceBindDir(root);
  if (bind) names.add(readWorkspaceSlug(bind));
  const skillsRoot = join(root, ".cursor", "skills");
  if (existsSync(skillsRoot)) {
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && !KIT_INSTANCE_SKIP.has(entry.name)) {
        names.add(entry.name);
      }
    }
  }
  return [...names].sort();
};

export const findInstanceFile = (root, ...relSegments) => {
  const bind = findWorkspaceBindDir(root);
  if (bind) {
    const stripped = relSegments[0] === "autodevelop" ? relSegments.slice(1) : relSegments;
    const path = join(bind, ...stripped);
    if (existsSync(path)) {
      return { instance: readWorkspaceSlug(bind), path };
    }
  }
  const skillsRoot = join(root, ".cursor", "skills");
  if (existsSync(skillsRoot)) {
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || KIT_INSTANCE_SKIP.has(entry.name)) continue;
      const path = join(skillsRoot, entry.name, ...relSegments);
      if (existsSync(path)) return { instance: entry.name, path };
    }
  }
  return null;
};

export const SUPPORTED_BOARD_PROVIDERS = ["github"];

/** Keys that bind git branch mode without a full board config. */
export const BRANCH_BINDING_KEYS = Object.freeze(["singleBranch", "branches"]);

const BRANCH_OBJECT_KEYS = Object.freeze([
  "staging",
  "production",
  "singleBranch",
  "askStaging",
  "askProduction",
  "protected",
]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

export const isBranchBindingConfig = (config) => {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const keys = Object.keys(config);
  return (
    keys.length > 0 &&
    keys.every((key) => BRANCH_BINDING_KEYS.includes(key) || BINDING_META_KEYS.includes(key))
  );
};

export const extractConfigBranchOverrides = (config) => {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const nested =
    config.branches && typeof config.branches === "object" && !Array.isArray(config.branches)
      ? { ...config.branches }
      : {};
  const hasTop = Object.hasOwn(config, "singleBranch");
  const hasNested = BRANCH_OBJECT_KEYS.some((key) => Object.hasOwn(nested, key));
  if (!hasTop && !hasNested) return null;
  if (hasTop) nested.singleBranch = config.singleBranch;
  return nested;
};

export const readInstanceConfigFile = (root) => {
  const hit = findInstanceFile(root, "autodevelop", "config.json");
  if (!hit || !existsSync(hit.path) || hit.path.includes("<instance>")) return null;
  return { instance: hit.instance, path: hit.path, config: readJson(hit.path) };
};

const applyInstanceBranchOverrides = (config, instanceFile) => {
  if (!instanceFile?.config) return config;
  const next = { ...config };
  if (Object.hasOwn(instanceFile.config, "singleBranch")) {
    next.singleBranch = instanceFile.config.singleBranch;
  }
  if (instanceFile.config.branches && typeof instanceFile.config.branches === "object") {
    next.branches = instanceFile.config.branches;
  }
  return next;
};

export const normalizeConfig = (config) => {
  if (!config || typeof config !== "object") return config;
  const provider = String(config.board?.provider || "github").trim() || "github";
  return {
    ...config,
    board: {
      ...(config.board && typeof config.board === "object" ? config.board : {}),
      provider,
    },
  };
};

const isPlaceholder = (value) =>
  typeof value === "string" &&
  (value === "" ||
    value.includes("example-") ||
    value.includes("xxxxxxxx") ||
    value === "example-org" ||
    value === "example-repo" ||
    value === "example-stg" ||
    value === "example-production");

export const configPaths = (root, kitRoot = findKitRoot()) => {
  const instance = findInstanceFile(root, "autodevelop", "config.json");
  return {
    instance: instance?.path || join(root, WORKSPACE_BIND_DIR, "config.json"),
    kit: join(kitRoot, ".cursor", "skills", ...KIT_SEGMENTS, "config.json"),
    example: join(kitRoot, ".cursor", "skills", ...KIT_SEGMENTS, "config.example.json"),
  };
};

export const validateConfig = (config) => {
  const errors = [];
  if (!config || typeof config !== "object") return ["config must be an object"];
  if (!config.github?.owner) errors.push("github.owner is required");
  if (!config.github?.repo) errors.push("github.repo is required");
  if (!config.github?.projectNumber) errors.push("github.projectNumber is required");
  if (!config.github?.projectId) errors.push("github.projectId is required");
  if (!config.fields?.status?.id) errors.push("fields.status.id is required");
  const mailTransport = String(config.mail?.transport || "hosted");
  if (mailTransport === "firestore" && !config.mail?.firestoreProject) {
    errors.push("mail.firestoreProject is required");
  }
  if (!Array.isArray(config.mail?.allowlist)) errors.push("mail.allowlist must be an array");
  if (!Array.isArray(config.forbiddenProjects)) errors.push("forbiddenProjects must be an array");
  if (!config.preview?.firebaseProject) errors.push("preview.firebaseProject is required");
  if (!config.preview?.baseBranch) errors.push("preview.baseBranch is required");
  if (!Array.isArray(config.stakeholders)) errors.push("stakeholders must be an array");
  const provider = config.board?.provider ?? "github";
  if (!SUPPORTED_BOARD_PROVIDERS.includes(provider)) {
    errors.push("board.provider must be github (other adapters are not shipped)");
  }
  if (config.singleBranch != null && typeof config.singleBranch !== "boolean") {
    errors.push("singleBranch must be a boolean");
  }
  if (config.branches != null) {
    if (typeof config.branches !== "object" || Array.isArray(config.branches)) {
      errors.push("branches must be an object");
    } else {
      if (config.branches.singleBranch != null && typeof config.branches.singleBranch !== "boolean") {
        errors.push("branches.singleBranch must be a boolean");
      }
      if (config.branches.staging != null && typeof config.branches.staging !== "string") {
        errors.push("branches.staging must be a string");
      }
      if (config.branches.production != null && typeof config.branches.production !== "string") {
        errors.push("branches.production must be a string");
      }
    }
  }
  return errors;
};

export const isExampleConfig = (config) => {
  const values = [
    config?.github?.owner,
    config?.github?.repo,
    config?.github?.projectId,
    config?.mail?.firestoreProject,
    config?.preview?.firebaseProject,
  ];
  return values.some(isPlaceholder);
};

export const assertSafeProject = (projectId, config) => {
  const id = String(projectId || "").trim();
  if (!id) throw new Error("Firebase project id is required.");
  const forbidden = config.forbiddenProjects || [];
  if (forbidden.includes(id)) {
    throw new Error(`Refusing forbidden project: ${id}`);
  }
};

export const loadConfig = (options = {}) => {
  const root = options.root || findRepoRoot();
  const paths = configPaths(root, options.kitRoot || findKitRoot());
  const allowExample = options.allowExample === true;
  const tried = [];
  const instanceFile = readInstanceConfigFile(root);

  for (const key of ["instance", "kit", "example"]) {
    if (key === "example" && !allowExample) continue;
    const path = paths[key];
    tried.push(path);
    if (!existsSync(path) || path.includes("<instance>")) continue;
    const parsed = readJson(path);
    if (key === "instance" && isBranchBindingConfig(parsed)) continue;
    const config = normalizeConfig(parsed);
    const errors = validateConfig(config);
    if (errors.length) {
      throw new Error(`Invalid config at ${path}: ${errors.join("; ")}`);
    }
    if (key === "example" && isExampleConfig(config) && options.requireInstance) {
      throw new Error(
        `Refusing example config. Copy config.example.json to an instance folder and fill real ids.`,
      );
    }
    return {
      config: applyInstanceBranchOverrides(config, instanceFile),
      path,
      source: key,
      root,
      instance: instanceFile?.instance || findInstanceFile(root, "autodevelop", "config.json")?.instance,
    };
  }

  throw new Error(`No autodevelop config found. Looked at:\n${tried.join("\n")}`);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const loaded = loadConfig({ allowExample: process.argv.includes("--allow-example") });
  process.stdout.write(
    `${JSON.stringify(
      {
        path: loaded.path,
        source: loaded.source,
        instance: loaded.instance,
        singleBranch: loaded.config.singleBranch ?? null,
        branches: loaded.config.branches ?? null,
      },
      null,
      2,
    )}\n`,
  );
}
