#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import {
  isConverterPath,
  isModelsPath,
  isRulesPath,
  ensureSqliteFlag,
  isoNow,
  openDb,
  parseArgs,
  printHelp,
  recomputeUserScores,
  refreshRiskyCommits,
  tokenizePath,
  withTx,
} from "./lib.mjs";

function tokensFor(paths) {
  const set = new Set();
  for (const p of paths) {
    for (const t of tokenizePath(p)) set.add(t);
  }
  return set;
}

function overlap(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("remediations.mjs", [
      "[--reset]  Mark later model/converter/rules commits as remediations",
    ]);
    return;
  }
  const db = openDb();
  if (args.reset) {
    db.prepare(
      `UPDATE commit_risks SET remediated = 0, remediated_by_sha = NULL, remediated_at = NULL
       WHERE category IN ('models', 'breaking', 'firestore_rules', 'storage_rules')`,
    ).run();
  }
  const open = db
    .prepare(
      `
      SELECT r.id, r.sha, r.category, c.user_id, c.authored_at
      FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE r.remediated = 0 AND r.category IN ('models', 'breaking', 'firestore_rules', 'storage_rules')
      ORDER BY c.authored_at ASC
    `,
    )
    .all();
  const filesFor = db.prepare("SELECT path FROM commit_files WHERE sha = ?");
  const later = db.prepare(`
    SELECT sha, user_id, authored_at, subject
    FROM commits
    WHERE authored_at > ? AND is_bot = 0
    ORDER BY authored_at ASC
  `);
  const mark = db.prepare(`
    UPDATE commit_risks
    SET remediated = 1, remediated_by_sha = ?, remediated_at = ?
    WHERE id = ?
  `);

  let fixed = 0;
  withTx(db, () => {
    for (const risk of open) {
      const srcTokens = tokensFor(filesFor.all(risk.sha).map((f) => f.path));
      const candidates = later.all(risk.authored_at);
      const sameUser = [];
      const others = [];
      for (const cand of candidates) {
        const paths = filesFor.all(cand.sha).map((f) => f.path);
        const relevant =
          (risk.category === "models" && paths.some(isModelsPath)) ||
          (risk.category === "breaking" && (paths.some(isConverterPath) || paths.some(isModelsPath))) ||
          ((risk.category === "firestore_rules" || risk.category === "storage_rules") &&
            paths.some(isRulesPath));
        if (!relevant) continue;
        const hit = overlap(srcTokens, tokensFor(paths));
        const msgHit = /\b(add(ed)?|fix(ed)?).{0,40}\b(model|converter|schema|rules?)\b/i.test(
          cand.subject || "",
        );
        const enough = hit >= 2 || (hit >= 1 && cand.user_id === risk.user_id && msgHit);
        if (!enough && !msgHit) continue;
        const scored = { ...cand, hit };
        if (cand.user_id === risk.user_id) sameUser.push(scored);
        else others.push(scored);
      }
      const pick = (sameUser[0] || others[0]) ?? null;
      if (!pick) continue;
      mark.run(pick.sha, isoNow(), risk.id);
      fixed++;
    }
  });
  recomputeUserScores(db);
  refreshRiskyCommits(db);
  db.close();
  console.log(`Marked ${fixed} remediations (${open.length} open remediable risks scanned)`);
}

main();
