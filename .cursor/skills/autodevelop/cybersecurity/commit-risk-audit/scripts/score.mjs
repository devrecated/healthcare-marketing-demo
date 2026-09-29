#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { converterExistsForModel, loadConventions, scanCommit } from "./lint-scan.mjs";
import {
  domainsForPaths,
  featureSubject,
  isConverterPath,
  isFeaturePath,
  isModelsPath,
  isNoiseCommit,
  isRulesPath,
  isSecretPath,
  isStyleOrHookOnly,
  ensureSqliteFlag,
  openDb,
  parseArgs,
  printHelp,
  recomputeUserScores,
  refreshRiskyCommits,
  scoreFromRisks,
  withTx,
} from "./lib.mjs";

function heuristicRisks(commit, files) {
  const paths = files.map((f) => f.path);
  const subject = commit.subject || "";
  const body = `${subject}\n${commit.body || ""}`;
  const risks = [];

  if (paths.some(isSecretPath)) {
    risks.push({
      category: "secrets",
      severity: "critical",
      title: "Possible secrets file in commit",
      detail: paths.filter(isSecretPath).join(", "),
    });
  }

  const rulesFiles = files.filter((f) => isRulesPath(f.path));
  for (const f of rulesFiles) {
    // Content is not stored; flag large rules commits and || true only via subject/body hints.
    if (/\|\|\s*true|allow (read|write).*if true/i.test(body)) {
      risks.push({
        category: "security",
        severity: "critical",
        title: "Rules commit mentions open allow / || true",
        detail: f.path,
      });
    }
  }

  if (!isNoiseCommit(paths, subject) && !isStyleOrHookOnly(paths)) {
    const feature = paths.some(isFeaturePath);
    const models = paths.some(isModelsPath);
    const convertersTouched = paths.some(isConverterPath);
    const conv = loadConventions();
    const localTypes = paths.some((p) => /web\/app\/.*\/(types|interfaces|models)\.[tj]sx?$/.test(p));
    const addedFeature = files.filter((f) => f.status === "A" && isFeaturePath(f.path)).length;
    const substantial = (commit.insertions || 0) >= 80 || addedFeature >= 3 || featureSubject(subject);

    if (feature && !models && substantial) {
      risks.push({
        category: "models",
        severity: localTypes ? "critical" : "high",
        title: localTypes
          ? "Local types/interfaces instead of the shared models package"
          : "Feature code without packages/models change",
        detail: `files: ${paths.filter(isFeaturePath).slice(0, 12).join(", ")}`,
      });
    }
    if (feature && !convertersTouched && substantial) {
      risks.push({
        category: "breaking",
        severity: "high",
        title: "Feature change without converter update",
        detail: "packages/models/converters/ not touched",
      });
    }
    if (models && !convertersTouched && paths.some((p) => isModelsPath(p) && !isConverterPath(p))) {
      const modelOnly = paths.filter((p) => isModelsPath(p) && !isConverterPath(p));
      const missing = modelOnly.filter((p) => !converterExistsForModel(commit.sha, p, conv));
      if (missing.length) {
        const addedModel = files.some((f) => f.status === "A" && missing.includes(f.path));
        risks.push({
          category: "breaking",
          severity: addedModel ? "critical" : "high",
          title: addedModel ? "New model file without converter" : "Model change without converter update",
          detail: missing.slice(0, 12).join(", "),
        });
      }
    }

    const domains = domainsForPaths(paths);
    if (domains.length >= 3 && !models) {
      risks.push({
        category: "cross_feature",
        severity: "medium",
        title: "Commit couples unrelated domains without shared models",
        detail: domains.join(", "),
      });
    }

    const looksLikeCollection = /\b(collection|collectionGroup|doc\()\b/.test(body);
    if (feature && !paths.some(isRulesPath) && (looksLikeCollection || (featureSubject(subject) && addedFeature >= 2))) {
      risks.push({
        category: "firestore_rules",
        severity: looksLikeCollection ? "high" : "medium",
        title: "Feature commit did not update Firestore/Storage rules",
        detail: "No firestore.rules or storage.rules in this commit",
      });
    }
  }

  if ((commit.files_changed || 0) > 100 || (commit.insertions || 0) > 2000) {
    risks.push({
      category: "quality",
      severity: "medium",
      title: "Unusually large commit",
      detail: `${commit.files_changed} files, +${commit.insertions}/-${commit.deletions}`,
    });
  }
  if (/\b(it\.skip|describe\.skip|\.only|--no-verify)\b/i.test(body)) {
    risks.push({
      category: "quality",
      severity: "low",
      title: "Skipped tests or --no-verify mentioned",
      detail: subject,
    });
  }

  return risks;
}

function attachLint(sha, files, risks) {
  const lint = scanCommit(sha, files);
  for (const f of lint) risks.push(f);
  return risks;
}

function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("score.mjs", ["[--rescore]  Heuristic-score commits missing scores (or all with --rescore)"]);
    return;
  }
  const db = openDb();
  const sql = args.rescore
    ? "SELECT * FROM commits ORDER BY authored_at ASC"
    : "SELECT * FROM commits WHERE risk_score IS NULL ORDER BY authored_at ASC";
  let commits = db.prepare(sql).all();
  if (args.sha) {
    const prefix = String(args.sha);
    commits = commits.filter((c) => c.sha.startsWith(prefix));
  }
  if (args.breaking) {
    const shas = new Set(
      db
        .prepare(
          "SELECT DISTINCT sha FROM commit_risks WHERE title LIKE '%without converter%'",
        )
        .all()
        .map((r) => r.sha),
    );
    commits = commits.filter((c) => shas.has(c.sha));
  }
  const filesFor = db.prepare("SELECT path, status FROM commit_files WHERE sha = ?");
  const delRisks = db.prepare("DELETE FROM commit_risks WHERE sha = ?");
  const insRisk = db.prepare(`
    INSERT INTO commit_risks
      (sha, category, severity, title, detail, remediated, path, start_line, end_line, evidence, rule_id, github_url, via)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upd = db.prepare("UPDATE commits SET quality_score = ?, risk_score = ? WHERE sha = ?");

  let n = 0;
  withTx(db, () => {
    for (const c of commits) {
      const files = filesFor.all(c.sha);
      const risks = attachLint(c.sha, files, heuristicRisks(c, files));
      if (args.rescore) delRisks.run(c.sha);
      for (const r of risks) {
        insRisk.run(
          c.sha,
          r.category,
          r.severity,
          r.title,
          r.detail,
          r.path || null,
          r.start_line || null,
          r.end_line || null,
          r.evidence || null,
          r.rule_id || null,
          r.github_url || null,
          r.via || null,
        );
      }
      const { risk_score, quality_score } = scoreFromRisks(risks);
      upd.run(quality_score, risk_score, c.sha);
      n++;
      if (n % 200 === 0) console.error(`Scored ${n}/${commits.length}`);
    }
  });
  recomputeUserScores(db);
  refreshRiskyCommits(db);
  db.close();
  console.log(`Scored ${n} commits`);
}

main();
