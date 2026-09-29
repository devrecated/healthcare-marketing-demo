#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Instance config.json is authoritative for branch mode (singleBranch /
 * branches). Instance .policies/branch-policy.yaml may say the same thing.
 * If both exist, they must agree. Legacy: autodevelop/branches.yaml.
 * Missing both uses master / release with ask off (two-branch).
 * singleBranch or staging === production is one shared branch.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimpleYaml } from "../../../hooks/autodevelop/lib.mjs";
import {
  extractConfigBranchOverrides,
  findInstanceFile,
  findRepoRoot,
  readInstanceConfigFile,
} from "./config-load.mjs";

export const DEFAULT_BRANCHES = Object.freeze({
  staging: "master",
  production: "release",
  askStaging: false,
  askProduction: false,
  singleBranch: false,
});

/** Historic gates. Mapped to whatever names YAML sets. Do not rename these strings. */
export const STAGING_CONFIRM_PHRASE = "YES PUSH TO MASTER";
export const PRODUCTION_CONFIRM_PHRASE = "YES PUSH TO RELEASE";

const BRANCH_NAME = /^(?!\/)[A-Za-z0-9._][A-Za-z0-9._\/-]*$/;

const asBool = (value, fallback) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
};

const asBranch = (value, fallback) => {
  const name = String(value ?? "").trim();
  return name || fallback;
};

const asProtectedList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text === "[]") return [];
    return text
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }
  return null;
};

const productionSpecified = (raw) =>
  raw.production != null && String(raw.production).trim() !== "";

export const confirmPhraseFor = (role) =>
  role === "production" ? PRODUCTION_CONFIRM_PHRASE : STAGING_CONFIRM_PHRASE;

export const isSingleBranch = (branches) => {
  if (!branches || typeof branches !== "object") return false;
  if (branches.singleBranch === true) return true;
  return Boolean(branches.staging) && branches.staging === branches.production;
};

export const singleBranchRefuseReason = (branches) => {
  const name = branches?.staging || DEFAULT_BRANCHES.staging;
  return `This instance is single-branch (${name} only). There is no separate production branch. /commit-push-release and /promote-master-to-release must refuse. Use /commit-push-master. Do not fetch origin/release.`;
};

export const describeBranchMode = (branches) => {
  if (isSingleBranch(branches)) {
    return { mode: "single-branch", note: singleBranchRefuseReason(branches) };
  }
  return { mode: "two-branch", note: null };
};

const specifiedBranchKeys = (raw) => {
  if (!raw || typeof raw !== "object") return new Set();
  const keys = new Set();
  for (const key of ["staging", "production", "singleBranch", "askStaging", "askProduction"]) {
    if (Object.hasOwn(raw, key) && raw[key] != null && raw[key] !== "") keys.add(key);
  }
  return keys;
};

/** single-branch | two-branch | null when the document does not assert a mode. */
export const impliedBranchMode = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  if (Object.hasOwn(raw, "singleBranch") && raw.singleBranch != null && raw.singleBranch !== "") {
    return asBool(raw.singleBranch, null) ? "single-branch" : "two-branch";
  }
  if (productionSpecified(raw)) {
    const staging = asBranch(raw.staging, DEFAULT_BRANCHES.staging);
    const production = asBranch(raw.production, DEFAULT_BRANCHES.production);
    return staging === production ? "single-branch" : "two-branch";
  }
  return null;
};

export const branchConflictKeys = (configRaw, policyRaw) => {
  if (!configRaw || !policyRaw) return [];
  const keys = [];
  const configMode = impliedBranchMode(configRaw);
  const policyMode = impliedBranchMode(policyRaw);
  if (configMode && policyMode && configMode !== policyMode) keys.push("singleBranch");
  const configSpec = specifiedBranchKeys(configRaw);
  const policySpec = specifiedBranchKeys(policyRaw);
  const fromConfig = normalizeBranches(configRaw);
  const fromPolicy = normalizeBranches(policyRaw);
  for (const key of ["staging", "production", "askStaging", "askProduction"]) {
    if (configSpec.has(key) && policySpec.has(key) && fromConfig[key] !== fromPolicy[key]) {
      keys.push(key);
    }
  }
  return [...new Set(keys)];
};

const branchSourceName = (configRaw, policyFound) => {
  if (configRaw && policyFound) {
    return policyFound.source === "legacy" ? "config+legacy" : "config+instance";
  }
  if (configRaw) return "config";
  if (policyFound) return policyFound.source;
  return "default";
};

export const resolveInstanceBranches = (root) => {
  const found = findBranchPolicyFile(root);
  let policyRaw = null;
  if (found?.path && existsSync(found.path)) {
    policyRaw = parseSimpleYaml(readFileSync(found.path, "utf8")) || {};
  }
  const instanceFile = readInstanceConfigFile(root);
  const configRaw = extractConfigBranchOverrides(instanceFile?.config);
  if (configRaw && policyRaw) {
    const conflicts = branchConflictKeys(configRaw, policyRaw);
    if (conflicts.length) {
      throw new Error(
        `Instance config.json and branch-policy disagree on ${conflicts.join(", ")} (${instanceFile.path} vs ${found.path}). An instance cannot be both single-branch and two-branch.`,
      );
    }
  }
  const raw = { ...(policyRaw || {}), ...(configRaw || {}) };
  const branches = normalizeBranches(raw);
  const errors = validateBranches(branches);
  if (errors.length) {
    const shown = instanceFile?.path || found?.path || "defaults";
    throw new Error(`Invalid branch-policy at ${shown}: ${errors.join("; ")}`);
  }
  return {
    branches,
    path: found?.path || null,
    configPath: configRaw ? instanceFile.path : null,
    source: branchSourceName(configRaw, found),
    root,
    instance:
      found?.instance ||
      instanceFile?.instance ||
      findInstanceFile(root, "autodevelop", "config.json")?.instance ||
      null,
    confirm: {
      staging: STAGING_CONFIRM_PHRASE,
      production: PRODUCTION_CONFIRM_PHRASE,
    },
    ...describeBranchMode(branches),
  };
};

export const normalizeBranches = (doc = {}) => {
  const raw = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
  const protectedList = asProtectedList(raw.protected);
  let askStaging = asBool(raw.askStaging, DEFAULT_BRANCHES.askStaging);
  let askProduction = asBool(raw.askProduction, DEFAULT_BRANCHES.askProduction);
  if (protectedList) {
    if (protectedList.includes("staging")) askStaging = true;
    if (protectedList.includes("production")) askProduction = true;
  }
  const staging = asBranch(raw.staging, DEFAULT_BRANCHES.staging);
  const singleBranchFlag = asBool(raw.singleBranch, false);
  let production = productionSpecified(raw)
    ? asBranch(raw.production, DEFAULT_BRANCHES.production)
    : DEFAULT_BRANCHES.production;
  let singleBranch = singleBranchFlag || staging === production;
  if (singleBranch) {
    production = staging;
    askProduction = false;
  }
  return {
    staging,
    production,
    askStaging,
    askProduction,
    singleBranch,
    protected: [askStaging && "staging", askProduction && "production"].filter(Boolean),
  };
};

export const validateBranches = (branches) => {
  const errors = [];
  if (!branches || typeof branches !== "object") return ["branches must be an object"];
  if (!BRANCH_NAME.test(String(branches.staging || ""))) {
    errors.push("staging must be a git branch name");
  }
  if (typeof branches.askStaging !== "boolean") errors.push("askStaging must be a boolean");
  if (typeof branches.askProduction !== "boolean") errors.push("askProduction must be a boolean");
  if (isSingleBranch(branches)) {
    if (branches.production && branches.production !== branches.staging) {
      errors.push("singleBranch requires production to match staging or be omitted");
    }
    if (branches.askProduction === true) {
      errors.push("singleBranch cannot set askProduction");
    }
    return errors;
  }
  if (!BRANCH_NAME.test(String(branches.production || ""))) {
    errors.push("production must be a git branch name");
  }
  if (branches.staging && branches.production && branches.staging === branches.production) {
    errors.push("staging and production must be different branches");
  }
  return errors;
};

export const roleForBranch = (name, branches) => {
  const head = String(name || "").trim();
  if (!head || !branches) return null;
  if (head === branches.staging) return "staging";
  if (isSingleBranch(branches)) return null;
  if (head === branches.production) return "production";
  return null;
};

export const isAskRequired = (role, branches) => {
  if (isSingleBranch(branches) && role === "production") return false;
  if (role === "staging") return Boolean(branches?.askStaging);
  if (role === "production") return Boolean(branches?.askProduction);
  return false;
};

/** True when agents must not commit, push, or merge onto this branch until the confirm phrase. */
export const isReadOnlyBranch = (name, branches) => {
  const role = roleForBranch(name, branches);
  return role ? isAskRequired(role, branches) : false;
};

export const BRANCH_POLICY_REL = [".policies", "branch-policy.yaml"];
export const BRANCH_POLICY_LEGACY_REL = ["branches.yaml"];

export const findBranchPolicyFile = (root) => {
  const current = findInstanceFile(root, "autodevelop", ...BRANCH_POLICY_REL);
  if (current) return { ...current, source: "instance" };
  const legacy = findInstanceFile(root, "autodevelop", ...BRANCH_POLICY_LEGACY_REL);
  if (legacy) return { ...legacy, source: "legacy" };
  return null;
};

export const branchesPaths = (root) => {
  const found = findBranchPolicyFile(root);
  return {
    instance:
      found?.path ||
      join(root, ".cursor", "skills", "<instance>", "autodevelop", ".policies", "branch-policy.yaml"),
    legacy: join(root, ".cursor", "skills", "<instance>", "autodevelop", "branches.yaml"),
    instanceName: found?.instance || null,
  };
};

export const loadBranches = (options = {}) => {
  const root = options.root || findRepoRoot();
  return resolveInstanceBranches(root);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const loaded = loadBranches();
  process.stdout.write(
    `${JSON.stringify(
      {
        path: loaded.path,
        configPath: loaded.configPath,
        source: loaded.source,
        instance: loaded.instance,
        mode: loaded.mode,
        note: loaded.note,
        branches: loaded.branches,
        confirm: loaded.confirm,
      },
      null,
      2,
    )}\n`,
  );
}
