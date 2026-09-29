#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Load instance .policies/*.yaml (not leftover *.example.yaml), merged over
 * POLICY_DEFAULTS. branch-policy uses resolveInstanceBranches (config.json
 * authoritative; must agree with the yaml). CLI prints policy names and
 * sources only — no allowlists, tokens, or message bodies.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimpleYaml } from "../../../hooks/autodevelop/lib.mjs";
import { resolveInstanceBranches } from "./branches-load.mjs";
import { findInstanceFile, findKitRoot, findRepoRoot } from "./config-load.mjs";
import { clonePolicyDefault, POLICY_DEFAULTS } from "./policy-defaults.mjs";

export const KIT_POLICIES_REL = [".cursor", "skills", "autodevelop", ".policies"];
export const INSTANCE_POLICIES_REL = [".policies"];

const isYaml = (name) => name.endsWith(".yaml");
const isExample = (name) => name.endsWith(".example.yaml");

export const policyNameFromFile = (filename) => {
  const name = String(filename || "");
  if (isExample(name)) return name.slice(0, -".example.yaml".length);
  if (name.endsWith(".yaml")) return name.slice(0, -".yaml".length);
  return name;
};

export const kitPoliciesDir = (kitRoot = findKitRoot()) => join(kitRoot, ...KIT_POLICIES_REL);

export const findInstancePoliciesDir = (root) =>
  findInstanceFile(root, "autodevelop", ...INSTANCE_POLICIES_REL);

export const deepMerge = (base, override) => {
  if (override === undefined) return base;
  if (Array.isArray(override) || override === null || typeof override !== "object") {
    return override;
  }
  if (base === undefined || base === null || typeof base !== "object" || Array.isArray(base)) {
    return { ...override };
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = deepMerge(base[key], value);
  }
  return out;
};

const readYamlIfPresent = (path) => {
  if (!path || !existsSync(path) || path.includes("<instance>")) return null;
  return parseSimpleYaml(readFileSync(path, "utf8")) || {};
};

const listYamlNames = (dir) => {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => isYaml(name) && !isExample(name))
    .map(policyNameFromFile)
    .filter(Boolean);
};

const instancePolicyPath = (instanceDir, name) => join(instanceDir, `${name}.yaml`);

export const loadPolicies = (options = {}) => {
  const root = options.root || findRepoRoot();
  const kitDir = options.kitPoliciesDir || kitPoliciesDir(options.kitRoot || findKitRoot());
  const foundDir = findInstancePoliciesDir(root);
  const instanceDir = foundDir?.path || null;
  const names = [...new Set([...Object.keys(POLICY_DEFAULTS), ...listYamlNames(instanceDir)])].sort();
  const policies = {};
  const sources = {};

  for (const name of names) {
    if (name === "branch-policy") {
      const resolved = resolveInstanceBranches(root);
      policies[name] = resolved.branches;
      sources[name] = resolved.source;
      continue;
    }
    const defaultDoc = clonePolicyDefault(name);
    let overrideDoc = null;
    let source = "default";
    if (instanceDir) {
      const instancePath = instancePolicyPath(instanceDir, name);
      if (existsSync(instancePath)) {
        overrideDoc = readYamlIfPresent(instancePath);
        source = "instance";
      }
    }
    policies[name] = deepMerge(defaultDoc, overrideDoc || {});
    sources[name] = source;
  }

  if (!names.includes("branch-policy")) {
    const resolved = resolveInstanceBranches(root);
    policies["branch-policy"] = resolved.branches;
    sources["branch-policy"] = resolved.source;
    names.push("branch-policy");
    names.sort();
  }

  return {
    root,
    instance: foundDir?.instance || findInstanceFile(root, "autodevelop", "config.json")?.instance || null,
    path: instanceDir,
    kitPath: kitDir,
    names,
    sources,
    policies,
  };
};

export const summarizePolicies = (loaded) => ({
  instance: loaded.instance,
  path: loaded.path,
  policies: loaded.names,
  sources: loaded.sources,
});

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const loaded = loadPolicies();
  process.stdout.write(`${JSON.stringify(summarizePolicies(loaded), null, 2)}\n`);
}
