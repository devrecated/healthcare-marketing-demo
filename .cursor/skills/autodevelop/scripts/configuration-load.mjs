#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Load instance .configuration/ hyperparameters (not *.example.*), merged
 * over kit examples. CLI prints file names and sources only — not every
 * numeric value.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimpleYaml } from "../../../hooks/autodevelop/lib.mjs";
import { findInstanceFile, findKitRoot, findRepoRoot } from "./config-load.mjs";
import { deepMerge } from "./policies-load.mjs";

export const KIT_CONFIGURATION_REL = [".cursor", "skills", "autodevelop", ".configuration"];
export const INSTANCE_CONFIGURATION_REL = [".configuration"];
export const CONFIG_BASENAME = "hyperparameters";

export const HYPERPARAMETER_SCHEMA = {
  precision: {
    kind: "enum",
    values: ["low", "high"],
    default: "high",
    description: "Whether the .config is complete enough to consume directly. high = hook reads this file. low = hook reads the expanded yaml.",
  },
  temperature: {
    kind: "number",
    min: 0,
    max: 2,
    default: 0.2,
    description: "Sampling temperature for model-facing questions (creativity). Lower is more deterministic.",
  },
  risk_level: {
    kind: "integer",
    min: 0,
    max: 3,
    default: 1,
    description: "How conservative the pre-query hook is. 0 = cautious, 3 = permissive.",
  },
  tone: {
    kind: "enum",
    values: ["professional", "concise", "coaching", "formal"],
    default: "professional",
    description: "Voice for injected system text.",
  },
  top_p: {
    kind: "number",
    min: 0,
    max: 1,
    default: 1,
    description: "Nucleus sampling cap for hooked model calls.",
  },
  max_output_tokens: {
    kind: "integer",
    min: 256,
    max: 8192,
    default: 1024,
    description: "Maximum completion tokens on hooked chat calls.",
  },
  presence_penalty: {
    kind: "number",
    min: -2,
    max: 2,
    default: 0,
    description: "Presence penalty on hooked chat calls.",
  },
  frequency_penalty: {
    kind: "number",
    min: -2,
    max: 2,
    default: 0,
    description: "Frequency penalty on hooked chat calls.",
  },
  context_budget: {
    kind: "integer",
    min: 1000,
    max: 32000,
    default: 12000,
    description: "Character cap for organization context injected into an ask.",
  },
  retrieval_limit: {
    kind: "integer",
    min: 1,
    max: 50,
    default: 8,
    description: "Hits to retrieve when the caller omits limit.",
  },
  citation_required: {
    kind: "integer",
    min: 0,
    max: 1,
    default: 1,
    description: "When 1, the hook requires citations in the system prompt.",
  },
  timeout_ms: {
    kind: "integer",
    min: 1000,
    max: 120000,
    default: 30000,
    description: "Deadline for a hooked model call, in milliseconds.",
  },
  retry_count: {
    kind: "integer",
    min: 0,
    max: 5,
    default: 1,
    description: "Extra attempts after a transient model or tool failure.",
  },
  instruction_strength: {
    kind: "integer",
    min: 0,
    max: 3,
    default: 2,
    description: "How firmly the hook restates tone and risk in the system prompt.",
  },
  ticket_mode: {
    kind: "enum",
    values: ["consolidate", "split"],
    default: "consolidate",
    description: "Whether a request opens one generalized Autodevelop ticket or may split up to the cap.",
  },
  ticket_max_per_request: {
    kind: "integer",
    min: 1,
    max: 8,
    default: 1,
    description: "Maximum Autodevelop tickets one request may open. Default 1. Titles stay generalized.",
  },
};

export const SOURCE_KEYS = Object.keys(HYPERPARAMETER_SCHEMA);

export const DEFAULT_KNOBS = Object.fromEntries(
  SOURCE_KEYS.map((key) => [key, HYPERPARAMETER_SCHEMA[key].default]),
);

const TONE_INSTRUCTIONS = {
  professional: "Professional product voice. Complete sentences. No scratch-pad fragments.",
  concise: "Short answers. Lead with the fact. Skip preamble.",
  coaching: "Explain the why in plain language. Offer the next concrete step.",
  formal: "Formal register. No contractions. No colloquial asides.",
};

const RANGE_LABEL = (spec) => {
  if (spec.kind === "enum") return `Enum: ${spec.values.join(" | ")}`;
  if (spec.min != null && spec.max != null) return `Range: ${spec.min}–${spec.max}`;
  return "";
};

const isExampleName = (name) => name.includes(".example.");
const isConfigName = (name) => name.endsWith(".config") || name.endsWith(".example.config");
const isYamlName = (name) => name.endsWith(".yaml") || name.endsWith(".example.yaml");

export const kitConfigurationDir = (kitRoot = findKitRoot()) => join(kitRoot, ...KIT_CONFIGURATION_REL);

export const findInstanceConfigurationDir = (root) =>
  findInstanceFile(root, "autodevelop", ...INSTANCE_CONFIGURATION_REL);

const readDocIfPresent = (path) => {
  if (!path || !existsSync(path) || path.includes("<instance>")) return null;
  return parseSimpleYaml(readFileSync(path, "utf8")) || {};
};

const listBasenames = (dir, { examples = false } = {}) => {
  if (!dir || !existsSync(dir)) return [];
  const names = new Set();
  for (const name of readdirSync(dir)) {
    if (examples ? !isExampleName(name) : isExampleName(name)) continue;
    if (isConfigName(name)) {
      names.add(name.replace(/\.example\.config$/, "").replace(/\.config$/, ""));
    } else if (isYamlName(name)) {
      names.add(name.replace(/\.example\.yaml$/, "").replace(/\.yaml$/, ""));
    }
  }
  return [...names].filter(Boolean);
};

const kitExamplePaths = (kitDir, name) => ({
  config: join(kitDir, `${name}.example.config`),
  yaml: join(kitDir, `${name}.example.yaml`),
});

const instancePaths = (instanceDir, name) => ({
  config: join(instanceDir, `${name}.config`),
  yaml: join(instanceDir, `${name}.yaml`),
});

export const definedSourceFields = (doc) => {
  const out = {};
  if (!doc || typeof doc !== "object") return out;
  for (const key of SOURCE_KEYS) {
    if (doc[key] !== undefined && doc[key] !== null && doc[key] !== "") out[key] = doc[key];
  }
  return out;
};

export const missingSourceFields = (doc) => SOURCE_KEYS.filter((key) => !(key in definedSourceFields(doc)));

export const needsExpansion = (configDoc = {}) => {
  const precision = String(configDoc.precision || "").trim() || "high";
  return precision === "low" || missingSourceFields(configDoc).length > 0;
};

const asNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return NaN;
};

export const coerceKnob = (key, value) => {
  const spec = HYPERPARAMETER_SCHEMA[key];
  if (!spec) return value;
  if (value === undefined || value === null || value === "") return spec.default;
  if (spec.kind === "enum") {
    const text = String(value).trim();
    if (!spec.values.includes(text)) {
      throw new Error(`${key} must be one of ${spec.values.join(", ")} (got ${text})`);
    }
    return text;
  }
  const n = asNumber(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${key} must be a number in ${spec.min}–${spec.max} (got ${value})`);
  }
  if (spec.kind === "integer" && !Number.isInteger(n)) {
    throw new Error(`${key} must be an integer in ${spec.min}–${spec.max} (got ${value})`);
  }
  if (n < spec.min || n > spec.max) {
    throw new Error(`${key} must be in ${spec.min}–${spec.max} (got ${n})`);
  }
  return n;
};

export const coerceKnobs = (doc = {}) => {
  const knobs = {};
  for (const key of SOURCE_KEYS) {
    knobs[key] = coerceKnob(key, doc[key]);
  }
  return knobs;
};

export const validateKnobs = (knobs) => {
  const errors = [];
  for (const key of SOURCE_KEYS) {
    try {
      coerceKnob(key, knobs?.[key]);
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
};

const riskCap = (riskLevel) => {
  if (riskLevel <= 0) return 0.2;
  if (riskLevel === 1) return 0.4;
  if (riskLevel === 2) return 0.8;
  return 2;
};

export const expandHyperparameters = (configDoc = {}) => {
  const knobs = coerceKnobs(deepMerge(DEFAULT_KNOBS, definedSourceFields(configDoc)));
  const cap = riskCap(knobs.risk_level);
  const temperature = Math.min(knobs.temperature, cap);
  return {
    ...knobs,
    expansion: {
      generated: true,
      system_suffix: [
        `Write in a ${knobs.tone} voice. Answer only from the supplied organization context.`,
        knobs.citation_required
          ? "Cite ticket numbers, file titles, and recap dates. If a fact is missing, say so."
          : "If a fact is missing, say so.",
        "Do not invent issues.",
        knobs.risk_level <= 1 ? "Do not speculate beyond the supplied context." : "",
      ]
        .filter(Boolean)
        .join(" "),
      tone_instructions: TONE_INSTRUCTIONS[knobs.tone] || TONE_INSTRUCTIONS.professional,
      risk: {
        refuse_speculation: knobs.risk_level <= 1,
        require_citations: Boolean(knobs.citation_required),
        max_temperature: cap,
      },
      tools: {
        context_ask: { temperature, retrieval_limit: knobs.retrieval_limit },
        context_search: { retrieval_limit: knobs.retrieval_limit },
        issues_search: { retrieval_limit: knobs.retrieval_limit },
      },
    },
  };
};

const formatScalar = (value) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && !Number.isInteger(value)) {
    return Number.isInteger(value * 10) ? value.toFixed(1) : String(value);
  }
  return String(value);
};

export const formatHyperparametersYaml = (expanded) => {
  const lines = [
    "# Copyright (c) 2026 Devrecated",
    "# Expanded knobs the hosted MCP pre-query hook consumes when",
    "# hyperparameters.config is low precision. Filled by expand-hyperparameters.",
    "# Do not put secrets here.",
    "",
  ];
  for (const key of SOURCE_KEYS) {
    const spec = HYPERPARAMETER_SCHEMA[key];
    lines.push(`# ${spec.description} ${RANGE_LABEL(spec)}`.trim());
    lines.push(`${key}: ${formatScalar(expanded[key])}`);
    lines.push("");
  }
  const expansion = expanded.expansion || {};
  const risk = expansion.risk || {};
  const tools = expansion.tools || {};
  lines.push("expansion:");
  lines.push(`  generated: ${expansion.generated === false ? "false" : "true"}`);
  if (expansion.system_suffix) {
    lines.push("  system_suffix: |");
    for (const row of String(expansion.system_suffix).trim().split(/\n/)) {
      lines.push(`    ${row}`);
    }
  }
  if (expansion.tone_instructions) {
    lines.push(`  tone_instructions: ${expansion.tone_instructions}`);
  }
  lines.push("  risk:");
  lines.push(`    refuse_speculation: ${risk.refuse_speculation ? "true" : "false"}`);
  lines.push(`    require_citations: ${risk.require_citations ? "true" : "false"}`);
  if (risk.max_temperature != null) lines.push(`    max_temperature: ${formatScalar(risk.max_temperature)}`);
  lines.push("  tools:");
  for (const [tool, body] of Object.entries(tools)) {
    lines.push(`    ${tool}:`);
    for (const [field, value] of Object.entries(body || {})) {
      lines.push(`      ${field}: ${formatScalar(value)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
};

export const loadConfiguration = (options = {}) => {
  const root = options.root || findRepoRoot();
  const kitDir = options.kitConfigurationDir || kitConfigurationDir(options.kitRoot || findKitRoot());
  const foundDir = findInstanceConfigurationDir(root);
  const instanceDir = foundDir?.path || null;
  const names = [
    ...new Set([...listBasenames(kitDir, { examples: true }), ...listBasenames(instanceDir)]),
  ].sort();
  if (!names.includes(CONFIG_BASENAME)) names.push(CONFIG_BASENAME);
  names.sort();

  const files = {};
  const sources = {};
  const docs = {};

  for (const name of names) {
    const kitPaths = kitExamplePaths(kitDir, name);
    const instPaths = instanceDir ? instancePaths(instanceDir, name) : { config: null, yaml: null };
    const kitConfig = readDocIfPresent(kitPaths.config) || {};
    const kitYaml = readDocIfPresent(kitPaths.yaml) || {};
    const instanceConfig = instanceDir && existsSync(instPaths.config) ? readDocIfPresent(instPaths.config) || {} : null;
    const instanceYaml = instanceDir && existsSync(instPaths.yaml) ? readDocIfPresent(instPaths.yaml) || {} : null;
    const configSource = instanceConfig ? "instance" : existsSync(kitPaths.config) ? "default" : "builtin";
    const yamlSource = instanceYaml ? "instance" : existsSync(kitPaths.yaml) ? "default" : "builtin";
    const configDoc = deepMerge(kitConfig, instanceConfig || {});
    const yamlDoc = deepMerge(kitYaml, instanceYaml || {});
    files[`${name}.config`] = configSource === "instance" ? instPaths.config : kitPaths.config;
    files[`${name}.yaml`] = yamlSource === "instance" ? instPaths.yaml : kitPaths.yaml;
    sources[`${name}.config`] = configSource;
    sources[`${name}.yaml`] = yamlSource;
    docs[name] = {
      config: configDoc,
      yaml: yamlDoc,
      instanceConfig,
      instanceYaml,
      sourceConfig: instanceConfig || kitConfig,
    };
  }

  const hyperparameters = docs[CONFIG_BASENAME] || { config: {}, yaml: {} };
  const resolved = resolveHyperparameters(hyperparameters, {
    configOverride: definedSourceFields(hyperparameters.instanceConfig || {}),
    forceExpand: needsExpansion(hyperparameters.sourceConfig || hyperparameters.config || {}),
  });

  return {
    root,
    instance: foundDir?.instance || findInstanceFile(root, "autodevelop", "config.json")?.instance || null,
    path: instanceDir,
    kitPath: kitDir,
    names,
    files,
    sources,
    docs,
    knobs: resolved.knobs,
    precision: resolved.knobs.precision,
    needsExpand: resolved.needsExpand,
    consume: resolved.consume,
  };
};

export const resolveHyperparameters = (pair = {}, options = {}) => {
  const configDoc = pair.config || {};
  const yamlDoc = pair.yaml || {};
  const expand = options.forceExpand ?? needsExpansion(pair.sourceConfig || configDoc);
  const overlay = options.configOverride || definedSourceFields(configDoc);
  const sourceDoc = expand
    ? deepMerge(deepMerge(DEFAULT_KNOBS, definedSourceFields(yamlDoc)), overlay)
    : deepMerge(DEFAULT_KNOBS, definedSourceFields(configDoc));
  const knobs = coerceKnobs(sourceDoc);
  const errors = validateKnobs(knobs);
  if (errors.length) {
    throw new Error(`Invalid hyperparameters: ${errors.join("; ")}`);
  }
  if (yamlDoc.expansion && typeof yamlDoc.expansion === "object") {
    knobs.expansion = yamlDoc.expansion;
  } else if (expand || options.alwaysExpand) {
    knobs.expansion = expandHyperparameters(sourceDoc).expansion;
  }
  return {
    knobs,
    needsExpand: expand,
    consume: expand ? "yaml" : "config",
  };
};

export const summarizeConfiguration = (loaded) => ({
  instance: loaded.instance,
  path: loaded.path,
  files: Object.keys(loaded.sources || {}).sort(),
  sources: loaded.sources,
  precision: loaded.precision,
  needsExpand: loaded.needsExpand,
  consume: loaded.consume,
});

export const writeExpandedYaml = (options = {}) => {
  const loaded = options.loaded || loadConfiguration(options);
  const pair = loaded.docs[CONFIG_BASENAME] || { config: {}, yaml: {} };
  const expanded = expandHyperparameters(pair.sourceConfig || pair.instanceConfig || pair.config);
  const dest =
    options.dest ||
    (loaded.path
      ? instancePaths(loaded.path, CONFIG_BASENAME).yaml
      : kitExamplePaths(loaded.kitPath, CONFIG_BASENAME).yaml);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, formatHyperparametersYaml(expanded));
  return { wrote: dest, instance: loaded.instance, source: loaded.path ? "instance" : "default" };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--expand-write")) {
    const result = writeExpandedYaml();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    const loaded = loadConfiguration();
    process.stdout.write(`${JSON.stringify(summarizeConfiguration(loaded), null, 2)}\n`);
  }
}
