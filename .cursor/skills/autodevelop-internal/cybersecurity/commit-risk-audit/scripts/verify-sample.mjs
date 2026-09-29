#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
/**
 * Sample-and-verify gate: re-check 10 high findings (including ≥3 api_auth)
 * with parent/sibling context before any team PDF is written.
 */
import { ancestorAuthProtects, loadConventions, lineHasSanitizer } from "./lint-scan.mjs";
import { confirmFinding } from "./model-runtime.mjs";
import { ensureSqliteFlag, git, openDb, parseArgs, printHelp } from "./lib.mjs";

const REGRESSION_PATH = "services/api/src/routes/portal/admin/index.ts";

function pickSample(db) {
  const api = db
    .prepare(
      `
      SELECT r.sha, r.category, r.severity, r.title, r.path, r.start_line, r.rule_id, r.github_url, r.via, r.evidence
      FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE r.severity IN ('high','critical') AND r.category = 'api_auth' AND r.remediated = 0
      ORDER BY CASE r.severity WHEN 'critical' THEN 0 ELSE 1 END, c.authored_at DESC
      LIMIT 6
    `,
    )
    .all();
  const rest = db
    .prepare(
      `
      SELECT r.sha, r.category, r.severity, r.title, r.path, r.start_line, r.rule_id, r.github_url, r.via, r.evidence
      FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE r.severity IN ('high','critical') AND r.remediated = 0
      ORDER BY CASE r.severity WHEN 'critical' THEN 0 ELSE 1 END, c.authored_at DESC
      LIMIT 20
    `,
    )
    .all();
  const seen = new Set();
  const out = [];
  for (const row of [...api, ...rest]) {
    const key = `${row.sha}|${row.rule_id}|${row.path}|${row.start_line}|${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= 10) break;
  }
  return out;
}

function regressionAdminMount() {
  const conv = loadConventions();
  let sha = "";
  try {
    sha = git(["rev-parse", "HEAD"]).trim();
  } catch {
    return { ok: false, reason: "HEAD missing" };
  }
  const hit = ancestorAuthProtects(sha, REGRESSION_PATH, conv);
  return {
    ok: hit.protected,
    sha,
    via: hit.via,
    reason: hit.protected ? `admin inherited auth via ${hit.via}` : "admin leaf still looks unprotected",
  };
}

export async function verifySample(db) {
  const conv = loadConventions();
  const failures = [];
  const sample = pickSample(db);
  const apiN = sample.filter((r) => r.category === "api_auth").length;
  if (sample.length && apiN < 3) {
    failures.push({
      sha: "",
      title: "sample missing api_auth",
      reason: `Need ≥3 api_auth in the 10-finding sample, got ${apiN}`,
    });
  }

  const admin = regressionAdminMount();
  if (!admin.ok) {
    failures.push({ sha: admin.sha, path: REGRESSION_PATH, title: "admin mount regression", reason: admin.reason });
  }

  const adminLlm = await confirmFinding({
    category: "api_auth",
    severity: "high",
    title: "Unprotected GET /get-auth-users",
    path: REGRESSION_PATH,
    start_line: 31,
    rule_id: "express/unprotected-route",
    via: [admin.via, "app.use('/admin', requireAdminAuth)"].filter(Boolean).join(" · "),
    evidence: "router.get('/get-auth-users', getAuthUsers)",
  });
  if (adminLlm.confirm) {
    failures.push({
      sha: admin.sha,
      path: REGRESSION_PATH,
      title: "admin CodeAstra confirm",
      reason: `model confirmed an inherited-auth admin route: ${adminLlm.rationale}`,
    });
  }

  for (const row of sample) {
    if (row.rule_id === "express/unprotected-route" && row.path) {
      const inherited = ancestorAuthProtects(row.sha, row.path, conv);
      if (inherited.protected) {
        failures.push({
          ...row,
          reason: `inherited-context FP via ${inherited.via}`,
        });
      }
    }
    if ((row.rule_id === "react/no-danger" || row.rule_id === "react/no-innerhtml") && row.evidence) {
      if (lineHasSanitizer(row.evidence, [{ line: row.start_line, text: row.evidence }], row.start_line, conv)) {
        failures.push({ ...row, reason: "sanitized HTML still flagged" });
      }
    }
  }

  return {
    ok: failures.length === 0,
    sample,
    failures,
    admin,
    adminLlm,
    apiN,
  };
}

export function printVerify(result) {
  console.log(`Sample-and-verify: ${result.sample.length} high findings (${result.apiN} api_auth)`);
  if (result.admin?.ok) console.log(`  regression: ${result.admin.reason}`);
  if (result.adminLlm) {
    console.log(`  CodeAstra admin mount: confirm=${result.adminLlm.confirm} via ${result.adminLlm.model_id}`);
  }
  for (const r of result.sample) {
    const loc = r.path ? ` ${r.path}${r.start_line ? `:${r.start_line}` : ""}` : "";
    console.log(
      `  ${String(r.sha || "").slice(0, 8)} [${r.severity}/${r.category}${r.rule_id ? `/${r.rule_id}` : ""}] ${r.title}${loc}${r.via ? ` via ${r.via}` : ""}`,
    );
    if (r.github_url) console.log(`    ${r.github_url}`);
  }
  if (!result.ok) {
    console.error("Sample-and-verify failed (inherited-context or sanitizer FP):");
    for (const f of result.failures) {
      console.error(`  FAIL ${String(f.sha || "").slice(0, 8)} ${f.title} — ${f.reason}`);
    }
  }
}

async function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("verify-sample.mjs", ["  Re-check 10 high findings (incl. ≥3 api_auth) plus the admin mount regression"]);
    return;
  }
  const db = openDb();
  const result = await verifySample(db);
  printVerify(result);
  db.close();
  if (!result.ok) process.exit(1);
}

const invoked = process.argv[1] && /verify-sample\.mjs$/.test(process.argv[1]);
if (invoked) {
  main();
}
