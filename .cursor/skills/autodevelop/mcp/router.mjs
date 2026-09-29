/**
 * Copyright (c) 2026 Devrecated
 * SPDX-License-Identifier: MIT
 *
 * Deterministic bucket selection for the remote MCP surface. Pure scoring over
 * skill-catalog.yaml — no I/O beyond reading that catalog, no MCP tool, no
 * side effects. The router picks a playbook and says why. It never satisfies a
 * gate, writes mail, creates an issue, or deploys.
 *
 * Decision: docs/internal/adr/mcp-skill-buckets.md
 * Flows: docs/internal/flows/routing.md
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSimpleYaml } from "../../../hooks/autodevelop/lib.mjs";
import { findRepoRoot } from "../scripts/config-load.mjs";

export const KEYWORD_WEIGHT = 2;
export const PATH_WEIGHT = 3;
export const BRANCH_WEIGHT = 3;

export const DEFAULT_TIE_MARGIN = 2;
export const DEFAULT_FALLBACK = "search";

export const catalogPath = (root) =>
  join(root, ".cursor", "skills", "autodevelop", "skill-catalog.yaml");

/** parseSimpleYaml gives [] for an empty flow list and a string for a lone scalar. */
export const asList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value == null || value === "") return [];
  const text = String(value).trim();
  if (!text || text === "[]") return [];
  return [text];
};

export const loadCatalog = (root = findRepoRoot()) =>
  parseSimpleYaml(readFileSync(catalogPath(root), "utf8")) || {};

export const tokenize = (utterance) =>
  new Set(
    String(utterance || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );

/**
 * mail | deploy | destructive | none — read off the utterance, never off the
 * bucket. A gated verb always forces a question even when one bucket wins
 * outright.
 */
export const gateClass = (utterance, catalog) => {
  const tokens = tokenize(utterance);
  const classes = catalog?.gate_classes || {};
  for (const name of ["mail", "deploy", "destructive"]) {
    const hits = asList(classes[name]?.keywords).filter((word) => tokens.has(word));
    if (hits.length) return { gate: name, matched: hits, requires: classes[name]?.requires || "" };
  }
  return { gate: "none", matched: [], requires: "" };
};

const pathScore = (bucket, paths) => {
  const fragments = asList(bucket.paths);
  if (!fragments.length || !paths.length) return { score: 0, matched: [] };
  const matched = fragments.filter((fragment) =>
    paths.some((path) => String(path).toLowerCase().includes(fragment.toLowerCase())),
  );
  return { score: matched.length * PATH_WEIGHT, matched };
};

const branchScore = (bucket, branchRole) => {
  if (!branchRole) return { score: 0, matched: [] };
  const roles = asList(bucket.branch_roles);
  if (!roles.includes(branchRole)) return { score: 0, matched: [] };
  return { score: BRANCH_WEIGHT, matched: [`branch:${branchRole}`] };
};

/**
 * Ranked buckets, highest first. signals are facts the caller already has:
 * { paths: string[], branchRole: 'staging'|'production'|null, ticket, previousBucket }
 */
export const scoreBuckets = (utterance, signals = {}, catalog) => {
  const doc = catalog || loadCatalog();
  const buckets = doc.mcp_buckets || {};
  const tokens = tokenize(utterance);
  const paths = Array.isArray(signals.paths) ? signals.paths : [];
  return Object.entries(buckets)
    .map(([id, bucket]) => {
      const words = asList(bucket.when).filter((word) => tokens.has(word));
      const byPath = pathScore(bucket, paths);
      const byBranch = branchScore(bucket, signals.branchRole);
      return {
        bucket: id,
        score: words.length * KEYWORD_WEIGHT + byPath.score + byBranch.score,
        matched: [...words, ...byPath.matched, ...byBranch.matched],
      };
    })
    .toSorted((a, b) => b.score - a.score || a.bucket.localeCompare(b.bucket));
};

/** One loop is the bucket default. Two or more must be named, or we return none. */
const loopForBucket = (doc, bucketId, utterance) => {
  const names = asList(doc.mcp_buckets?.[bucketId]?.loops);
  if (!names.length) return null;
  const tokens = tokenize(utterance);
  const named = names.find((name) => name.split("_").every((part) => tokens.has(part)));
  if (named) return named;
  return names.length === 1 ? names[0] : null;
};

/**
 * { bucket, loop, ask, gate, reason, candidates }. ask means stop and put one
 * question to the human before running anything.
 */
export const decideRoute = (utterance, signals = {}, catalog) => {
  const doc = catalog || loadCatalog();
  const tieMargin = Number(doc.router?.tie_margin ?? DEFAULT_TIE_MARGIN);
  const fallback = String(doc.router?.fallback_bucket || DEFAULT_FALLBACK);
  const { gate, matched: gateWords, requires } = gateClass(utterance, doc);
  const candidates = scoreBuckets(utterance, signals, doc);

  // 1. An explicit wrapper or a pinned bucket skips scoring.
  const pin = signals.pinBucket ? String(signals.pinBucket) : "";
  if (pin && doc.mcp_buckets?.[pin]) {
    const always = doc.mcp_buckets[pin].always_ask === true;
    return {
      bucket: pin,
      loop: signals.loop ? String(signals.loop) : loopForBucket(doc, pin, utterance),
      ask: gate !== "none" || always,
      gate,
      reason:
        gate !== "none"
          ? `Pinned ${pin}. ${gate} gate on ${gateWords.join(", ")} — ${requires}.`
          : `Pinned ${pin}.`,
      candidates,
    };
  }
  const wrapper = signals.wrapper
    ? doc.wrappers?.[String(signals.wrapper).replace(/^\//, "")]
    : null;
  if (wrapper) {
    const bucket = String(wrapper.bucket);
    const always = doc.mcp_buckets?.[bucket]?.always_ask === true;
    return {
      bucket,
      loop: wrapper.loop ? String(wrapper.loop) : loopForBucket(doc, bucket, utterance),
      ask: gate !== "none" || always,
      gate,
      reason:
        gate !== "none"
          ? `Wrapper ${wrapper.slash} pins ${bucket}. ${gate} gate on ${gateWords.join(", ")} — ${requires}.`
          : `Wrapper ${wrapper.slash} pins ${bucket}.`,
      candidates,
    };
  }

  const [top, second] = candidates;

  // 2. Nothing scored. Route to Search rather than guess.
  if (!top || top.score === 0) {
    return {
      bucket: fallback,
      loop: loopForBucket(doc, fallback, utterance),
      ask: gate !== "none",
      gate,
      reason: "No bucket matched the utterance or the signals. Falling back to Search.",
      candidates,
    };
  }

  const margin = top.score - (second?.score ?? 0);
  const always = doc.mcp_buckets?.[top.bucket]?.always_ask === true;

  // 3. Session stickiness breaks an exact tie only, and only with no gate.
  if (margin === 0 && gate === "none" && signals.previousBucket) {
    const sticky = candidates.find(
      (item) => item.bucket === signals.previousBucket && item.score === top.score,
    );
    if (sticky) {
      return {
        bucket: sticky.bucket,
        loop: loopForBucket(doc, sticky.bucket, utterance),
        ask: doc.mcp_buckets?.[sticky.bucket]?.always_ask === true,
        gate,
        reason: `Tie at ${top.score} between ${top.bucket} and ${second.bucket}. Staying in ${sticky.bucket} from earlier in this session.`,
        candidates,
      };
    }
  }

  // 4. A gated verb, an always-ask bucket, or a close call stops for a question.
  const close = Boolean(second) && margin < tieMargin;
  const reason = [];
  if (gate !== "none") reason.push(`${gate} gate on ${gateWords.join(", ")} — ${requires}`);
  if (always) reason.push(`${top.bucket} always confirms before it acts`);
  if (close) {
    reason.push(`${top.bucket} ${top.score} vs ${second.bucket} ${second.score} is within ${tieMargin}`);
  }
  if (!reason.length) reason.push(`${top.bucket} matched ${top.matched.join(", ")}`);

  return {
    bucket: top.bucket,
    loop: loopForBucket(doc, top.bucket, utterance),
    ask: gate !== "none" || always || close,
    gate,
    reason: `${reason.join(". ")}.`,
    candidates,
  };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const decision = decideRoute(process.argv.slice(2).join(" "), {}, loadCatalog());
  process.stdout.write(
    `${JSON.stringify(
      {
        bucket: decision.bucket,
        loop: decision.loop,
        ask: decision.ask,
        gate: decision.gate,
        reason: decision.reason,
        candidates: decision.candidates.filter((item) => item.score > 0),
      },
      null,
      2,
    )}\n`,
  );
}
