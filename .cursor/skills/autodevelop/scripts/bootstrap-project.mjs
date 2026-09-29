#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Create or bind a GitHub Projects v2 board and write field ids into the
 * consumer instance config. Dry-run unless --apply.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findInstanceFile,
  findKitRoot,
  findRepoRoot,
  isBranchBindingConfig,
  loadConfig,
} from "./config-load.mjs";
import { argValue, fail, hasFlag, parseArgs, printJson, runCommand } from "./lib.mjs";
import { sessionDir } from "./session.mjs";

export const STATUS_OPTIONS = [
  { name: "Backlog", color: "GRAY", description: "" },
  { name: "Ready", color: "BLUE", description: "" },
  { name: "In progress", color: "YELLOW", description: "" },
  { name: "In review", color: "PURPLE", description: "" },
  { name: "Blocked", color: "RED", description: "" },
  { name: "Done", color: "GREEN", description: "" },
];

export const PRIORITY_OPTIONS = [
  { name: "P0", color: "RED", description: "" },
  { name: "P1", color: "ORANGE", description: "" },
  { name: "P2", color: "YELLOW", description: "" },
  { name: "P3", color: "GRAY", description: "" },
];

const STATUS_ALIASES = {
  todo: "Backlog",
  "to do": "Backlog",
  "in progress": "In progress",
  done: "Done",
};

export const isBoundProjectId = (id) =>
  typeof id === "string" && /^PVT_/.test(id) && !id.includes("xxxxxxxx");

export const bootstrapMarkerPath = (root) => join(sessionDir(root), "bootstrap.json");

export const readBootstrapMarker = (root) => {
  const path = bootstrapMarkerPath(root);
  if (!existsSync(path)) return { path, marker: null };
  try {
    return { path, marker: JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return { path, marker: null };
  }
};

export const writeBootstrapMarker = (root, marker) => {
  const path = bootstrapMarkerPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`);
  return path;
};

export const parseProjectCreate = (raw) => {
  const json = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!json?.id || json.number == null) throw new Error("gh project create JSON missing id or number");
  return { id: json.id, number: Number(json.number), title: json.title || "", url: json.url || "" };
};

export const parseFieldList = (raw) => {
  const json = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(json?.fields) ? json.fields : Array.isArray(json) ? json : [];
};

export const pickField = (fields, name) => {
  const needle = String(name || "").toLowerCase();
  return (fields || []).find((field) => String(field.name || "").toLowerCase() === needle) || null;
};

export const canonicalStatusName = (name) => {
  const key = String(name || "").trim().toLowerCase();
  return STATUS_ALIASES[key] || STATUS_OPTIONS.find((opt) => opt.name.toLowerCase() === key)?.name || name;
};

export const statusOptionsWithPreservedIds = (existingOptions = []) => {
  const byCanonical = new Map();
  for (const opt of existingOptions) {
    const canonical = canonicalStatusName(opt.name);
    if (opt.id && !byCanonical.has(canonical)) byCanonical.set(canonical, opt.id);
  }
  return STATUS_OPTIONS.map((opt) => {
    const id = byCanonical.get(opt.name);
    return id ? { ...opt, id } : { ...opt };
  });
};

export const optionsMap = (options = []) => {
  const map = {};
  for (const opt of options) {
    if (opt?.name && opt.id) map[opt.name] = opt.id;
  }
  return map;
};

export const fieldIdsFromList = (fields) => {
  const status = pickField(fields, "Status");
  const priority = pickField(fields, "Priority");
  const target =
    pickField(fields, "targetDate") || pickField(fields, "Target date") || pickField(fields, "Target Date");
  const start = pickField(fields, "startDate") || pickField(fields, "Start date") || pickField(fields, "Start Date");
  return {
    statusId: status?.id || "",
    statusOptions: optionsMap(status?.options),
    priorityId: priority?.id || "",
    priorityOptions: optionsMap(priority?.options),
    targetDateId: target?.id || "",
    startDateId: start?.id || "",
  };
};

export const planBootstrapProject = ({ config, owner, title } = {}) => {
  const projectId = config?.github?.projectId;
  const bound = isBoundProjectId(projectId);
  return {
    action: bound ? "bind" : "create",
    owner: owner || config?.github?.owner || "",
    repo: config?.github?.repo || "",
    title: title || config?.productName || "Autodevelop",
    projectId: bound ? projectId : null,
    projectNumber: bound ? Number(config?.github?.projectNumber) || null : null,
  };
};

export const mergeInstanceConfig = (base, { owner, repo, project, fields }) => {
  const next = structuredClone(base || {});
  next.github = {
    ...(next.github || {}),
    owner: owner || next.github?.owner,
    repo: repo || next.github?.repo,
    projectNumber: project.number,
    projectId: project.id,
  };
  next.fields = {
    ...(next.fields || {}),
    status: {
      id: fields.statusId,
      options: fields.statusOptions || {},
    },
    priority: {
      id: fields.priorityId,
      options: fields.priorityOptions || {},
    },
    targetDate: { id: fields.targetDateId || next.fields?.targetDate?.id || "" },
    startDate: { id: fields.startDateId || next.fields?.startDate?.id || "" },
  };
  if (!Array.isArray(next.stakeholders)) next.stakeholders = [];
  next.board = { provider: next.board?.provider || "github" };
  return next;
};

export const exampleConfigPath = (kitRoot = findKitRoot()) =>
  join(kitRoot, ".cursor", "skills", "autodevelop", "config.example.json");

export const loadBaseConfig = (root, kitRoot = findKitRoot()) => {
  const hit = findInstanceFile(root, "autodevelop", "config.json");
  const example = exampleConfigPath(kitRoot);
  const exampleConfig = existsSync(example) ? JSON.parse(readFileSync(example, "utf8")) : {};
  if (hit && existsSync(hit.path)) {
    const config = JSON.parse(readFileSync(hit.path, "utf8"));
    if (isBranchBindingConfig(config)) {
      return { config: { ...exampleConfig, ...config }, path: hit.path, instance: hit.instance };
    }
    return { config, path: hit.path, instance: hit.instance };
  }
  return { config: exampleConfig, path: null, instance: null };
};

export const instanceConfigPath = (root, instance) =>
  join(root, ".cursor", "skills", instance, "autodevelop", "config.json");

export const writeInstanceConfig = (root, instance, config) => {
  if (!instance || instance.includes("/") || instance === "autodevelop" || instance === "third-party") {
    throw new Error("Pass a consumer instance folder name (not autodevelop or third-party).");
  }
  const path = instanceConfigPath(root, instance);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
};

const ghJson = (runGh, args) => {
  const result = runGh(args);
  if (result.dryRun) return { dryRun: true, preview: result.preview, data: null };
  if (!result.ok) throw new Error(result.stderr || `gh ${args.join(" ")} failed`);
  return { dryRun: false, data: JSON.parse(result.stdout || "{}") };
};

export const updateStatusFieldQuery = (fieldId, options) => ({
  query: `mutation($f:ID!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ updateProjectV2Field(input:{fieldId:$f, singleSelectOptions:$o}){ projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }`,
  variables: { f: fieldId, o: options },
});

export const createSelectFieldQuery = (projectId, name, options) => ({
  query: `mutation($p:ID!,$n:String!,$o:[ProjectV2SingleSelectFieldOptionInput!]!){ createProjectV2Field(input:{projectId:$p, dataType:SINGLE_SELECT, name:$n, singleSelectOptions:$o}){ projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }`,
  variables: { p: projectId, n: name, o: options },
});

export const applyBootstrapProject = ({
  root,
  owner,
  repo,
  title,
  instance,
  dryRun = true,
  runGh = (args) => runCommand("gh", args, { dryRun }),
  kitRoot = findKitRoot(),
} = {}) => {
  const workspace = root || findRepoRoot();
  const loaded = loadBaseConfig(workspace, kitRoot);
  const instanceName = instance || loaded.instance;
  if (!instanceName) throw new Error("Pass --instance <name> for the consumer folder.");
  const plan = planBootstrapProject({
    config: { github: { ...loaded.config.github, owner: owner || loaded.config.github?.owner, repo: repo || loaded.config.github?.repo } },
    owner: owner || loaded.config.github?.owner,
    title,
  });
  if (!plan.owner) throw new Error("github.owner (or --owner) is required.");
  const commands = [];
  let project = plan.projectId
    ? { id: plan.projectId, number: plan.projectNumber, title: plan.title }
    : null;

  if (plan.action === "create") {
    const args = ["project", "create", "--owner", plan.owner, "--title", plan.title, "--format", "json"];
    commands.push(["gh", ...args].join(" "));
    const created = ghJson(runGh, args);
    if (!created.dryRun) project = parseProjectCreate(created.data);
    else project = { id: "PVT_dry_run", number: 0, title: plan.title };
  } else {
    const args = ["project", "view", String(plan.projectNumber), "--owner", plan.owner, "--format", "json"];
    commands.push(["gh", ...args].join(" "));
    const viewed = ghJson(runGh, args);
    if (!viewed.dryRun) project = parseProjectCreate(viewed.data);
  }

  const listArgs = ["project", "field-list", String(project.number || plan.projectNumber || 0), "--owner", plan.owner, "--format", "json", "--limit", "50"];
  commands.push(["gh", ...listArgs].join(" "));
  const listed = ghJson(runGh, listArgs);
  let fields = listed.dryRun ? [] : parseFieldList(listed.data);
  let ids = fieldIdsFromList(fields);
  const statusField = pickField(fields, "Status");
  if (statusField?.id) {
    const options = statusOptionsWithPreservedIds(statusField.options || []);
    const body = updateStatusFieldQuery(statusField.id, options);
    commands.push("gh api graphql — updateProjectV2Field Status");
    if (!dryRun && !listed.dryRun) {
      const result = runGh(["api", "graphql", "--input", "-"], { input: JSON.stringify(body) });
      if (!result.ok && !result.dryRun) throw new Error(result.stderr || "updateProjectV2Field failed");
    }
  }
  if (!ids.priorityId && project.id && !String(project.id).includes("dry_run")) {
    const body = createSelectFieldQuery(project.id, "Priority", PRIORITY_OPTIONS);
    commands.push("gh api graphql — createProjectV2Field Priority");
    if (!dryRun) {
      const result = runGh(["api", "graphql", "--input", "-"], { input: JSON.stringify(body) });
      if (!result.ok && !result.dryRun) throw new Error(result.stderr || "createProjectV2Field Priority failed");
    }
  }

  if (!listed.dryRun && !dryRun) {
    const refresh = ghJson(runGh, listArgs);
    fields = parseFieldList(refresh.data);
    ids = fieldIdsFromList(fields);
  } else if (listed.dryRun) {
    ids = {
      statusId: ids.statusId || "PVTSSF_dry_run_status",
      statusOptions: Object.fromEntries(STATUS_OPTIONS.map((opt) => [opt.name, ""])),
      priorityId: ids.priorityId || "PVTSSF_dry_run_priority",
      priorityOptions: Object.fromEntries(PRIORITY_OPTIONS.map((opt) => [opt.name, ""])),
      targetDateId: ids.targetDateId,
      startDateId: ids.startDateId,
    };
  }

  const next = mergeInstanceConfig(loaded.config, {
    owner: plan.owner,
    repo: repo || loaded.config.github?.repo,
    project,
    fields: ids,
  });
  let configPath = loaded.path;
  if (!dryRun) {
    configPath = writeInstanceConfig(workspace, instanceName, next);
    writeBootstrapMarker(workspace, {
      completedAt: new Date().toISOString(),
      projectId: project.id,
      invited: [],
    });
  }

  return {
    ok: true,
    dryRun,
    action: plan.action,
    instance: instanceName,
    project,
    fields: ids,
    commands,
    configPath: configPath || instanceConfigPath(workspace, instanceName),
  };
};

const defaultRunGh = (args, extra = {}) => {
  const spawn = extra.input
    ? { input: extra.input, encoding: "utf8" }
    : undefined;
  return runCommand("gh", args, { dryRun: extra.dryRun, spawn });
};

const main = () => {
  const args = parseArgs();
  const apply = hasFlag(args, "apply");
  const dryRun = !apply;
  try {
    const root = argValue(args, "workspace") || findRepoRoot();
    let config = {};
    try {
      config = loadConfig({ allowExample: true, root }).config;
    } catch {
      config = {};
    }
    const result = applyBootstrapProject({
      root,
      owner: argValue(args, "owner") || config.github?.owner,
      repo: argValue(args, "repo") || config.github?.repo,
      title: argValue(args, "title") || config.productName || "Autodevelop",
      instance: argValue(args, "instance"),
      dryRun,
      runGh: (ghArgs, extra = {}) => defaultRunGh(ghArgs, { ...extra, dryRun }),
    });
    printJson(result);
  } catch (error) {
    fail(error.message);
  }
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
