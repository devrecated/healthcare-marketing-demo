#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * skill-catalog.yaml is the one machine source for buckets, loops, and slash
 * wrappers. This fails when the prose, the command files, or the catalog drift
 * apart. Read-only: no writes, no network.
 *
 * Flows: docs/internal/flows/
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "../scripts/config-load.mjs";
import { asList, loadCatalog } from "./router.mjs";

export const FLOWS_DIR = join("docs", "internal", "flows");

export const FLOW_PAGES = {
  routing: join(FLOWS_DIR, "routing.md"),
  buckets: join(FLOWS_DIR, "buckets.md"),
  loops: join(FLOWS_DIR, "loops.md"),
};

const read = (root, relative) => {
  const path = join(root, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

/** Buckets must be complete and must only point at loops that exist. */
const checkBuckets = (doc, problems) => {
  const buckets = doc.mcp_buckets || {};
  const loops = doc.loops || {};
  const gates = doc.gate_classes || {};
  const ids = Object.keys(buckets);

  if (ids.length !== 8) {
    problems.push({ kind: "bucket-count", detail: `${ids.length} buckets, expected 8` });
  }

  for (const id of ids) {
    const bucket = buckets[id] || {};
    for (const field of ["title", "tool"]) {
      if (!bucket[field]) problems.push({ kind: "bucket-field", detail: `${id} has no ${field}` });
    }
    for (const field of ["when", "may_invoke", "must_never"]) {
      if (!asList(bucket[field]).length) {
        problems.push({ kind: "bucket-field", detail: `${id} has an empty ${field}` });
      }
    }
    const gate = bucket.gate_class ? String(bucket.gate_class) : "none";
    if (gate !== "none" && !gates[gate]) {
      problems.push({ kind: "bucket-gate", detail: `${id} names unknown gate class ${gate}` });
    }
    for (const name of asList(bucket.loops)) {
      if (!loops[name]) {
        problems.push({ kind: "bucket-loop", detail: `${id} names unknown loop ${name}` });
      }
    }
  }

  const fallback = String(doc.router?.fallback_bucket || "");
  if (!buckets[fallback]) {
    problems.push({ kind: "router-fallback", detail: `fallback_bucket ${fallback} is not a bucket` });
  }
};

/** Loops must resolve to a bucket, and optional / resume_from must be steps. */
const checkLoops = (doc, problems) => {
  const buckets = doc.mcp_buckets || {};
  const gates = doc.gate_classes || {};
  for (const [name, loop] of Object.entries(doc.loops || {})) {
    const steps = asList(loop.steps);
    if (!steps.length) {
      problems.push({ kind: "loop-steps", detail: `${name} has no steps` });
      continue;
    }
    const bucket = String(loop.bucket || "");
    if (!buckets[bucket]) {
      problems.push({ kind: "loop-bucket", detail: `${name} names unknown bucket ${bucket}` });
    } else if (!asList(buckets[bucket].loops).includes(name)) {
      problems.push({ kind: "loop-backref", detail: `${bucket} does not list loop ${name}` });
    }
    const gate = String(loop.gate_class || "none");
    if (gate !== "none" && !gates[gate]) {
      problems.push({ kind: "loop-gate", detail: `${name} names unknown gate class ${gate}` });
    }
    const resume = String(loop.resume_from || "");
    if (!steps.includes(resume)) {
      problems.push({ kind: "loop-resume", detail: `${name} resume_from ${resume} is not a step` });
    }
    for (const step of asList(loop.optional)) {
      if (!steps.includes(step)) {
        problems.push({ kind: "loop-optional", detail: `${name} optional ${step} is not a step` });
      }
    }
  }
};

/** Every wrapper needs a real bucket, a loop that belongs to it, and a file. */
const checkWrappers = (root, doc, problems) => {
  const buckets = doc.mcp_buckets || {};
  const loops = doc.loops || {};
  for (const [name, wrapper] of Object.entries(doc.wrappers || {})) {
    const bucket = String(wrapper.bucket || "");
    if (!buckets[bucket]) {
      problems.push({ kind: "wrapper-bucket", detail: `${name} names unknown bucket ${bucket}` });
    }
    if (wrapper.loop) {
      const loop = String(wrapper.loop);
      if (!loops[loop]) {
        problems.push({ kind: "wrapper-loop", detail: `${name} names unknown loop ${loop}` });
      } else if (String(loops[loop].bucket) !== bucket) {
        problems.push({
          kind: "wrapper-loop",
          detail: `${name} pairs ${loop} with ${bucket}, but that loop belongs to ${loops[loop].bucket}`,
        });
      }
    }
    const command = String(wrapper.command || "");
    if (!command) {
      problems.push({ kind: "wrapper-command", detail: `${name} has no command path` });
    } else if (!existsSync(join(root, command))) {
      problems.push({ kind: "wrapper-command", detail: `${name} points at missing ${command}` });
    }
    if (String(wrapper.slash || "") !== `/${name}`) {
      problems.push({ kind: "wrapper-slash", detail: `${name} slash should be /${name}` });
    }
  }
};

/** The prose has to name every bucket and loop the catalog defines. */
const checkPages = (root, doc, problems) => {
  const pages = {};
  for (const [key, relative] of Object.entries(FLOW_PAGES)) {
    const body = read(root, relative);
    if (body == null) {
      problems.push({ kind: "page-missing", detail: relative });
      continue;
    }
    pages[key] = body;
  }

  if (pages.buckets) {
    for (const bucket of Object.values(doc.mcp_buckets || {})) {
      const tool = String(bucket.tool || "");
      if (tool && !pages.buckets.includes(tool)) {
        problems.push({ kind: "page-bucket", detail: `buckets.md does not mention ${tool}` });
      }
    }
  }

  if (pages.loops) {
    for (const name of Object.keys(doc.loops || {})) {
      if (!pages.loops.includes(name)) {
        problems.push({ kind: "page-loop", detail: `loops.md does not mention ${name}` });
      }
    }
  }

  const index = read(root, join("docs", "internal", "index.md"));
  if (index == null) {
    problems.push({ kind: "page-missing", detail: "docs/internal/index.md" });
    return;
  }
  for (const relative of Object.values(FLOW_PAGES)) {
    const link = relative.split(/[\\/]/).slice(2).join("/");
    if (!index.includes(link)) {
      problems.push({ kind: "page-unlinked", detail: `internal index does not link ${link}` });
    }
  }
};

export const checkFlows = (root = findRepoRoot(), catalog) => {
  const doc = catalog || loadCatalog(root);
  const problems = [];
  checkBuckets(doc, problems);
  checkLoops(doc, problems);
  checkWrappers(root, doc, problems);
  checkPages(root, doc, problems);
  return {
    buckets: Object.keys(doc.mcp_buckets || {}).length,
    loops: Object.keys(doc.loops || {}).length,
    wrappers: Object.keys(doc.wrappers || {}).length,
    problems,
  };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { buckets, loops, wrappers, problems } = checkFlows(findRepoRoot());
  if (problems.length) {
    process.stderr.write(
      `Flow check failed (${problems.length}):\n${problems
        .map((item) => `  ${item.kind}: ${item.detail}`)
        .join("\n")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `ok  ${buckets} buckets, ${loops} loops, ${wrappers} wrappers agree with the flow pages\n`,
  );
}
