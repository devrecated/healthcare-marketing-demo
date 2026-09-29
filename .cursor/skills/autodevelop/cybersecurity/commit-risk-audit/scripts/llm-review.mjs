#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
/**
 * Confirm complex heuristic findings (CodeAstra) and score feature hunks
 * (CodeReviewer). Writes llm_reviews. Temperature 0 + JSON grammar.
 */
import {
  confirmFinding,
  isSkipLlmReview,
  modelsPresent,
  PROMPT_VERSION,
  requiresConfirmation,
  reviewDiff,
  SKIP_MODEL_ID,
} from "./model-runtime.mjs";
import {
  ensureSqliteFlag,
  git,
  isFeaturePath,
  isNoiseCommit,
  openDb,
  parseArgs,
  printHelp,
  withTx,
} from "./lib.mjs";

function cachePut(db, row) {
  db.prepare(
    `INSERT OR REPLACE INTO llm_reviews
      (sha, path, start_line, model_id, prompt_version, kind, confirm, severity,
       categories, review_needed, comment, rationale, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.sha,
    row.path || "",
    row.start_line || 0,
    row.model_id,
    PROMPT_VERSION,
    row.kind,
    row.confirm == null ? null : row.confirm ? 1 : 0,
    row.severity || null,
    row.categories ? JSON.stringify(row.categories) : null,
    row.review_needed == null ? null : row.review_needed ? 1 : 0,
    row.comment || null,
    row.rationale || null,
    new Date().toISOString(),
  );
  if (row.model_id && row.model_id !== SKIP_MODEL_ID) {
    db.prepare(
      `DELETE FROM llm_reviews
       WHERE sha = ? AND IFNULL(path,'') = ? AND IFNULL(start_line,0) = ?
         AND kind = ? AND model_id = ?`,
    ).run(row.sha, row.path || "", row.start_line || 0, row.kind, SKIP_MODEL_ID);
  }
}

function dropStaleSkipReviews(db) {
  db.exec(
    `DELETE FROM llm_reviews
     WHERE model_id = '${SKIP_MODEL_ID}'
       AND EXISTS (
         SELECT 1 FROM llm_reviews r2
         WHERE r2.sha = llm_reviews.sha
           AND IFNULL(r2.path,'') = IFNULL(llm_reviews.path,'')
           AND IFNULL(r2.start_line,0) = IFNULL(llm_reviews.start_line,0)
           AND r2.kind = llm_reviews.kind
           AND r2.model_id != '${SKIP_MODEL_ID}'
       )`,
  );
}

function loadComplexFindings(db, limit) {
  return db
    .prepare(
      `SELECT r.id, r.sha, r.category, r.severity, r.title, r.detail, r.path,
              r.start_line, r.evidence, r.rule_id, r.via, r.confirmed
       FROM commit_risks r
       JOIN commits c ON c.sha = r.sha
       WHERE r.remediated = 0 AND r.severity IN ('high','critical')
       ORDER BY CASE r.severity WHEN 'critical' THEN 0 ELSE 1 END, c.authored_at DESC
       LIMIT ?`,
    )
    .all(limit);
}

function loadFeatureCommits(db, limit) {
  return db
    .prepare(
      `SELECT c.sha, c.subject, c.insertions, c.files_changed
       FROM commits c
       WHERE c.is_bot = 0 AND IFNULL(c.insertions, 0) >= 40
         AND c.subject NOT LIKE 'Merge%'
       ORDER BY c.authored_at DESC
       LIMIT ?`,
    )
    .all(limit);
}

function fileDiff(sha, filePath) {
  try {
    return git(["show", "-U8", "--format=", sha, "--", filePath]);
  } catch {
    return "";
  }
}

async function confirmBatch(db, args) {
  dropStaleSkipReviews(db);
  const limit = Number(args.limit) || 200;
  const rows = loadComplexFindings(db, Math.max(limit * 4, 400)).filter(requiresConfirmation);
  const slice = rows.slice(0, limit);
  let n = 0;
  let cached = 0;
  const upd = db.prepare("UPDATE commit_risks SET confirmed = ?, llm_model = ? WHERE id = ?");
  for (const r of slice) {
    const existing = db
      .prepare(
        `SELECT * FROM llm_reviews
         WHERE sha = ? AND IFNULL(path,'') = ? AND IFNULL(start_line,0) = ?
           AND prompt_version = ? AND kind = 'confirm'
           AND IFNULL(model_id,'') != ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(r.sha, r.path || "", r.start_line || 0, PROMPT_VERSION, SKIP_MODEL_ID);
    let verdict;
    if (existing && !isSkipLlmReview(existing) && !args.force) {
      verdict = {
        confirm: existing.confirm === 1,
        severity: existing.severity,
        categories: existing.categories ? JSON.parse(existing.categories) : [r.category],
        rationale: existing.rationale,
        model_id: existing.model_id,
      };
      cached++;
    } else {
      verdict = await confirmFinding(r, { contextOnly: Boolean(args["context-only"]) });
      cachePut(db, {
        sha: r.sha,
        path: r.path || "",
        start_line: r.start_line || 0,
        model_id: verdict.model_id,
        kind: "confirm",
        confirm: verdict.confirm,
        severity: verdict.severity,
        categories: verdict.categories,
        rationale: verdict.rationale,
      });
      n++;
    }
    if (verdict.skipped || verdict.confirm == null) {
      upd.run(null, verdict.model_id, r.id);
    } else {
      upd.run(verdict.confirm ? 1 : 0, verdict.model_id, r.id);
    }
    if ((n + cached) % 25 === 0) {
      console.error(`Confirmed ${n + cached}/${slice.length} (${cached} cache)`);
    }
  }
  return { reviewed: n, cached, total: slice.length };
}

async function reviewBatch(db, args) {
  if (args["context-only"]) return { reviewed: 0, cached: 0, total: 0 };
  const limit = Number(args["hunk-limit"] || args.limit) || 40;
  const commits = loadFeatureCommits(db, limit);
  const filesFor = db.prepare("SELECT path, status FROM commit_files WHERE sha = ?");
  let n = 0;
  let cached = 0;
  for (const c of commits) {
    const files = filesFor.all(c.sha).filter((f) => isFeaturePath(f.path) && /\.(ts|tsx|js|jsx)$/.test(f.path));
    if (isNoiseCommit(files.map((f) => f.path), c.subject)) continue;
    for (const f of files.slice(0, 2)) {
      const hit = db
        .prepare(
          `SELECT * FROM llm_reviews
           WHERE sha = ? AND path = ? AND prompt_version = ? AND kind = 'review'`,
        )
        .get(c.sha, f.path, PROMPT_VERSION);
      if (hit && !args.force) {
        cached++;
        continue;
      }
      const diff = fileDiff(c.sha, f.path);
      if (!diff.trim()) continue;
      let result;
      try {
        result = await reviewDiff(diff);
      } catch (err) {
        console.error(`CodeReviewer failed ${c.sha.slice(0, 8)} ${f.path}: ${err.message}`);
        continue;
      }
      cachePut(db, {
        sha: c.sha,
        path: f.path,
        start_line: 0,
        model_id: result.model_id,
        kind: "review",
        review_needed: result.review_needed,
        comment: result.comment,
      });
      n++;
    }
  }
  return { reviewed: n, cached, total: commits.length };
}

async function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("llm-review.mjs", [
      "[--limit N]          Max complex findings to confirm (default 200)",
      "[--hunk-limit N]     Feature commits to send to CodeReviewer",
      "[--context-only]     Inherited-auth / sanitizer rejects only (no 7B)",
      "[--skip-hunks]       Skip CodeReviewer",
      "[--force]            Ignore llm_reviews cache",
    ]);
    return;
  }
  const db = openDb();
  const present = modelsPresent();
  if (!args["context-only"] && !present.codeastra) {
    console.error("CodeAstra GGUF not found; confirming with context rules only. Run pnpm audit:commits:models");
    args["context-only"] = true;
  }
  const confirm = await confirmBatch(db, args);
  console.log(`Confirm: ${confirm.reviewed} new, ${confirm.cached} cached, ${confirm.total} candidates`);
  let hunks = { reviewed: 0, cached: 0, total: 0 };
  if (!args["skip-hunks"] && !args["context-only"]) {
    hunks = await reviewBatch(db, args);
    console.log(`CodeReviewer: ${hunks.reviewed} new hunks, ${hunks.cached} cached, ${hunks.total} commits`);
  }
  db.close();
}

const invoked = process.argv[1] && /llm-review\.mjs$/.test(process.argv[1]);
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { confirmBatch, dropStaleSkipReviews, reviewBatch };
