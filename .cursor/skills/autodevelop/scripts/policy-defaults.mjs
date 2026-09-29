/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Built-in policy defaults for a new org pack. Same semantics as the former
 * kit *.example.yaml files. Instance live YAML under .autodevelop/.policies/
 * (or hosted autodevelop_org_policies) overrides these.
 */
import { DEFAULT_BRANCHES } from "./branches-load.mjs";

const emptyOrigins = Object.freeze({
  host: "",
  api: "",
  tickets: "",
});

const hostedEnv = (role, configKey) =>
  Object.freeze({
    role,
    host: "vercel",
    hostname: "",
    configKey,
    whoMayDeploy: "operators",
    origins: emptyOrigins,
  });

export const POLICY_DEFAULTS = Object.freeze({
  "branch-policy": Object.freeze({
    staging: DEFAULT_BRANCHES.staging,
    production: DEFAULT_BRANCHES.production,
    askStaging: DEFAULT_BRANCHES.askStaging,
    askProduction: DEFAULT_BRANCHES.askProduction,
    singleBranch: DEFAULT_BRANCHES.singleBranch,
  }),
  "commit-policy": Object.freeze({
    conventionalCommits: "optional",
    subjectStyle: "imperative",
    clientsMayChangeConvention: true,
    allowNoVerify: false,
    allowForcePush: false,
  }),
  "docs-policy": Object.freeze({
    publicHandbook: "autodevelop-docs/",
    internalHandbook: "docs/internal/",
    internalOperatorDocs: "services/host/docs/",
    publishedPricingAllowed: false,
    noMarginOrUnitEconomicsInRepo: true,
    noProductivityMultipleClaims: true,
    professionalVoice: true,
    noChatAsidesInFiles: true,
  }),
  "email-policy": Object.freeze({
    confirmRequired: true,
    transport: "hosted",
    allowlistSource: "config.json",
    allowlistPath: "mail.allowlist",
    overridePhraseSource: "config.json",
    overridePhrasePath: "mail.allowOverridePhrase",
    overridePhraseName: "send anyway",
    hooksNeverSend: true,
    neverInventConfirmToken: true,
    logBodies: false,
  }),
  "environments-policy": Object.freeze({
    ids: Object.freeze(["local", "staging", "production", "preview"]),
    defaultStagingName: "staging",
    defaultProductionName: "production",
    promote: Object.freeze(["local", "staging", "production"]),
    environments: Object.freeze({
      local: Object.freeze({
        role: "sandbox",
        host: "none",
        hostname: "",
        whoMayDeploy: "developers",
        origins: emptyOrigins,
      }),
      staging: hostedEnv("qa", "firebase.staging"),
      production: hostedEnv("production", "firebase.production"),
      preview: hostedEnv("preview", "preview.firebaseProject"),
    }),
  }),
  "hook-policy": Object.freeze({
    hooksNeverSendMail: true,
    hooksNeverInventConfirmToken: true,
    requiredOn: Object.freeze([
      "ticket-required",
      "worktree-status",
      "guard-stakeholder-mail",
      "guard-shell",
    ]),
    mayDisable: Object.freeze([
      "ticket-progress-files",
      "session-end-nudge",
      "session-context",
      "ready-for-feedback",
      "pr-link-hint",
      "nudge-edits",
      "version-changelog-nudge",
    ]),
  }),
  "mcp-policy": Object.freeze({
    stdioReadOnly: true,
    remoteRequiresToken: true,
    lapseString: "Your billing has expired",
    remoteMustNotWriteMail: true,
    remoteMustNotCreateIssues: true,
    remoteMustNotDeploy: true,
  }),
  "prod-approval-policy": Object.freeze({
    approvalRequired: true,
    gitConfirmFollowsBranchAsk: true,
    deployConfirmRequired: true,
    requireHeadOnProduction: true,
    sequentialDeploys: true,
  }),
  "staging-approval-policy": Object.freeze({
    approvalRequired: true,
    gitConfirmFollowsBranchAsk: true,
    deployConfirmRequired: true,
    requireHeadOnStaging: true,
  }),
  "security-policy": Object.freeze({
    neverCommit: Object.freeze([".env*", "serviceAccount.json", "**/firebase-admin*.json"]),
    noSecretValuesInChat: true,
    forbiddenProjectsSource: "config.json",
    forbiddenProjectsPath: "forbiddenProjects",
    msmUploadOneService: true,
    msmPeekForbidden: true,
  }),
  "skill-use-policy": Object.freeze({
    strictness: "normal",
    invokeSource: ".cursor/skills/autodevelop/skill-invoke.yaml",
    excludeNames: Object.freeze([]),
    excludeGlobs: Object.freeze([]),
    allowNames: Object.freeze([]),
  }),
  "ticket-policy": Object.freeze({
    requiredForProductWork: true,
    kitTreesExempt: true,
    wayfinderMaxTickets: 1,
    previewBeforeCreate: true,
    childIssues: false,
    bindVia: "#N",
  }),
});

export const POLICY_NAMES = Object.freeze(Object.keys(POLICY_DEFAULTS));

const POLICY_PREAMBLE = Object.freeze({
  "branch-policy": [
    "# Two-branch default for consumer repos (staging + production).",
    "# For one shared branch, set singleBranch: true.",
    "# Confirm phrases stay YES PUSH TO MASTER / YES PUSH TO RELEASE even if you rename the branches.",
  ],
  "commit-policy": ["# Conventional subjects are preferred. --no-verify and force-push stay forbidden."],
  "docs-policy": ["# Public handbook states what the product does. Operator runbooks stay private."],
  "email-policy": ["# Recipients live in instance config.json — this file does not list addresses."],
  "environments-policy": [
    "# Example host for Autodevelop is vercel. A Firebase consumer app sets host: firebase.",
    "# Cloud project ids stay in config.json. /devops reads the merged policy.",
  ],
  "hook-policy": ["# Local kill-switch is gitignored hookignore.yaml. Missing file = every hook on."],
  "mcp-policy": ["# Stdio tools stay on-machine. Remote tools need the subscription token."],
  "prod-approval-policy": [
    "# Git: YES PUSH TO RELEASE when branch-policy.askProduction is true.",
    "# Local deploy: DEPLOYED TO PRODUCTION.",
  ],
  "staging-approval-policy": [
    "# Git: YES PUSH TO MASTER when branch-policy.askStaging is true.",
    "# Local deploy: DEPLOYED TO STAGING.",
  ],
  "security-policy": [
    "# Forbidden project ids live in instance config.json — this file does not list them.",
  ],
  "skill-use-policy": ["# Invoke flags live in skill-invoke.yaml. Do not list every skill here."],
  "ticket-policy": [
    "# Kit trees may change without a board ticket. Product and instance bindings may not.",
  ],
});

export const clonePolicyDefault = (name) => {
  const doc = POLICY_DEFAULTS[name];
  if (!doc) return {};
  return structuredClone(doc);
};

const yamlScalar = (value) => {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (text === "") return '""';
  if (/[:#\n]|^\s|\s$|^\[|^\{|^['"]/.test(text) || text === "true" || text === "false") {
    return JSON.stringify(text);
  }
  return text;
};

export const dumpSimpleYaml = (doc) => {
  const lines = [];
  const write = (value, indent) => {
    const pad = "  ".repeat(indent);
    if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`${pad}- ${yamlScalar(item)}`);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) && child.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else if (Array.isArray(child)) {
        lines.push(`${pad}${key}:`);
        write(child, indent + 1);
      } else if (child && typeof child === "object") {
        lines.push(`${pad}${key}:`);
        write(child, indent + 1);
      } else {
        lines.push(`${pad}${key}: ${yamlScalar(child)}`);
      }
    }
  };
  write(doc && typeof doc === "object" ? doc : {}, 0);
  return `${lines.join("\n")}\n`;
};

export const policyDefaultYaml = (name) => {
  const doc = clonePolicyDefault(name);
  const preamble = POLICY_PREAMBLE[name] || [];
  return [
    "# Copyright (c) 2026 Devrecated",
    `# Default ${name}. Instance copies live under .autodevelop/.policies/${name}.yaml.`,
    ...preamble,
    "",
    dumpSimpleYaml(doc).trimEnd(),
    "",
  ].join("\n");
};
