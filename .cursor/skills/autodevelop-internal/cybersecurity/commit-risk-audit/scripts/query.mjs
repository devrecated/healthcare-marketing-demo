#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import {
  computeUserQuality,
  enrichUser,
  loadOpenIssues,
  qualityWhy,
  relativizeContributions,
  scoreUsersForRange,
} from "./analyze.mjs";
import { writeStakeholderPdf, writeTeamPdf } from "./report-pdf.mjs";
import { printVerify, verifySample } from "./verify-sample.mjs";
import {
  DATA_DIR,
  REPORTS_DIR,
  blobToFloat32,
  cosine,
  ensureLocalDeps,
  ensureReportsDir,
  ensureSqliteFlag,
  openDb,
  parseArgs,
  printHelp,
  slugify,
} from "./lib.mjs";

function dateClause(from, to, alias = "c") {
  const parts = [];
  const params = [];
  if (from) {
    parts.push(`${alias}.authored_at >= ?`);
    params.push(from);
  }
  if (to) {
    const end = String(to).length <= 10 ? `${to}T23:59:59.999Z` : to;
    parts.push(`${alias}.authored_at <= ?`);
    params.push(end);
  }
  return { sql: parts.length ? `AND ${parts.join(" AND ")}` : "", params };
}

function findUser(db, name) {
  if (!name) return null;
  const q = `%${name}%`;
  return (
    db
      .prepare(
        `
      SELECT * FROM users
      WHERE canonical_name LIKE ? OR IFNULL(github_login,'') LIKE ?
      ORDER BY commit_count DESC
      LIMIT 1
    `,
      )
      .get(q, q) ||
    db
      .prepare(
        `
      SELECT u.* FROM users u
      JOIN user_aliases a ON a.user_id = u.id
      WHERE a.author_name LIKE ? OR IFNULL(a.author_email,'') LIKE ?
      LIMIT 1
    `,
      )
      .get(q, q)
  );
}

function fmtScore(n) {
  return Number(n || 0).toFixed(1);
}

function printReport(db, args) {
  const { sql, params } = dateClause(args.from, args.to);
  const range = `${args.from || "beginning"} → ${args.to || "now"}`;
  const users = db
    .prepare(
      `SELECT * FROM users WHERE commit_count > 0 ORDER BY risk_score DESC, commit_count DESC`,
    )
    .all();
  const commits = db
    .prepare(`SELECT COUNT(*) AS n FROM commits c WHERE 1=1 ${sql}`)
    .get(...params).n;
  const openN = db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE r.remediated = 0 AND r.severity IN ('high','critical') ${sql}
    `,
    )
    .get(...params).n;

  console.log("# Commit risk audit");
  console.log(`Range: ${range}`);
  console.log(`Users: ${users.length}  Commits: ${commits}  Unremediated high/critical: ${openN}`);
  console.log("");
  console.log("## User risk");
  for (const u of users) {
    const open = db
      .prepare(
        `
        SELECT COUNT(*) AS n FROM commit_risks r
        JOIN commits c ON c.sha = r.sha
        WHERE c.user_id = ? AND r.remediated = 0 ${sql}
      `,
      )
      .get(u.id, ...params).n;
    console.log(
      `- ${u.canonical_name}${u.github_login ? ` (@${u.github_login})` : ""}: risk ${fmtScore(u.risk_score)}, ${u.commit_count} commits, ${u.first_commit_at || "?"} / ${u.last_commit_at || "?"}, ${open} open risks`,
    );
  }
}

function loadUserAnalysis(db, args) {
  const user = findUser(db, args.name);
  if (!user) {
    console.error(`No user matching ${args.name}`);
    process.exit(1);
  }
  const { sql, params } = dateClause(args.from, args.to);
  const commits = db
    .prepare(`SELECT COUNT(*) AS n FROM commits c WHERE c.user_id = ? ${sql}`)
    .get(user.id, ...params).n;
  const open = db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE c.user_id = ? AND r.remediated = 0 ${sql}
    `,
    )
    .get(user.id, ...params).n;
  const openSevere = db
    .prepare(
      `
      SELECT COUNT(*) AS n FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE c.user_id = ? AND r.remediated = 0 AND r.severity IN ('high','critical') ${sql}
    `,
    )
    .get(user.id, ...params).n;
  const rows = db
    .prepare(
      `
      SELECT c.sha, c.authored_at, c.subject, c.risk_score, c.quality_score, c.ai_slop_score,
             r.category, r.severity, r.title, r.detail, r.remediated, r.remediated_by_sha,
             r.path, r.start_line, r.end_line, r.evidence, r.rule_id, r.github_url, r.via
      FROM user_risky_commits urc
      JOIN commits c ON c.sha = urc.sha
      JOIN commit_risks r ON r.sha = c.sha
      WHERE urc.user_id = ? ${sql}
      ORDER BY c.authored_at ASC, r.id ASC
    `,
    )
    .all(user.id, ...params);
  const featRows = db
    .prepare(
      `SELECT cf.sha, cf.feature FROM commit_features cf
       JOIN commits c ON c.sha = cf.sha
       WHERE c.user_id = ? ${sql}`,
    )
    .all(user.id, ...params);
  const featMap = new Map();
  for (const f of featRows) {
    const list = featMap.get(f.sha) || [];
    list.push(f.feature);
    featMap.set(f.sha, list);
  }
  for (const r of rows) r.features = (featMap.get(r.sha) || []).join(", ");
  const impacts = db
    .prepare(
      `SELECT i.*, c.authored_at FROM commit_impacts i
       JOIN commits c ON c.sha = i.sha
       WHERE c.user_id = ? ${sql}
       ORDER BY c.authored_at ASC`,
    )
    .all(user.id, ...params);
  const exposures = db
    .prepare(
      `SELECT e.*, c.authored_at FROM commit_exposures e
       JOIN commits c ON c.sha = e.sha
       WHERE c.user_id = ? ${sql}
       ORDER BY c.authored_at ASC`,
    )
    .all(user.id, ...params);
  const months = db
    .prepare(
      `SELECT * FROM user_monthly_scores WHERE user_id = ? ORDER BY month ASC`,
    )
    .all(user.id);
  const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  const q = computeUserQuality(db, user.id, { from: args.from, to: args.to });
  const scored = {
    ...fresh,
    quality_score: q.quality,
    quality_issues: q.issues,
    quality_lint: q.lint,
    quality_api: q.api,
    quality_ui: q.ui,
    quality_models: q.models,
    quality_converters: q.converters,
    quality_rules: q.rules,
    quality_bugs: q.bugs,
    quality_slop: q.slop,
    quality_findings: q.findings,
    quality_remediation: q.remediation,
    quality_model: q.quality_model ?? q.model,
    quality_trend: q.quality_trend,
    hazard_stg: q.hazard_stg,
    hazard_prod: q.hazard_prod,
    ai_slop_score: q.slopAvg,
    issues_master: q.issuesMaster,
    issues_release: q.issuesRelease,
    rules_stg_gaps: q.rulesStgGaps,
    rules_prod_gaps: q.rulesProdGaps,
    untested_stg: q.untestedStg,
  };
  return {
    user: scored,
    commits,
    open,
    openSevere,
    issues: loadOpenIssues(db, user.id, args.from, args.to, 2000),
    rows,
    impacts,
    exposures,
    months,
    why: qualityWhy(scored),
    scores: {
      quality: q.quality,
      contribution: fresh.contribution_score,
      contribution_rank: fresh.contribution_rank,
      contribution_of: fresh.contribution_of,
      skill: fresh.skill_score,
      ai_slop: q.slopAvg,
      risk: fresh.risk_score,
      credited_loc: fresh.credited_loc,
      excluded_loc: fresh.excluded_loc,
      quality_issues: q.issues,
      quality_lint: q.lint,
      quality_api: q.api,
      quality_ui: q.ui,
      quality_models: q.models,
      quality_converters: q.converters,
      quality_rules: q.rules,
      quality_bugs: q.bugs,
      quality_slop: q.slop,
      quality_findings: q.findings,
      quality_remediation: q.remediation,
      quality_model: q.quality_model ?? q.model,
      quality_trend: q.quality_trend,
      hazard_stg: q.hazard_stg,
      hazard_prod: q.hazard_prod,
    },
    featureStats: db
      .prepare(
        `SELECT * FROM user_feature_stats WHERE user_id = ? ORDER BY importance DESC, credited_loc DESC`,
      )
      .all(user.id),
    creditReasons: db
      .prepare(
        `SELECT cc.excluded_reason AS reason, COUNT(*) AS n, SUM(cc.loc_inserted) AS loc
         FROM commit_credits cc
         JOIN commits c ON c.sha = cc.sha
         WHERE c.user_id = ? AND cc.excluded_reason IS NOT NULL
         GROUP BY cc.excluded_reason
         ORDER BY loc DESC`,
      )
      .all(user.id),
    range: `${args.from || "beginning"} → ${args.to || "now"}`,
    from: args.from || "",
    to: args.to || "",
  };
}

function riskStatus(r) {
  return r.remediated && r.remediated_by_sha
    ? `remediated in ${r.remediated_by_sha.slice(0, 8)}`
    : "OPEN";
}

function userMarkdown(a) {
  const handle = a.user.github_login ? ` (@${a.user.github_login})` : "";
  const lines = [
    "# Commit risk audit",
    `Range: ${a.range}`,
    `Users: 1  Commits: ${a.commits}  Unremediated high/critical: ${a.openSevere}`,
    "",
    "## User risk",
    `- ${a.user.canonical_name}${handle}: risk ${fmtScore(a.user.risk_score)}, quality ${fmtScore(a.scores.quality)}, contribution ${fmtScore(a.scores.contribution)} (rank ${a.scores.contribution_rank || "?"} of ${a.scores.contribution_of || "?"}), skill ${fmtScore(a.scores.skill)}, AI-slop ${fmtScore(a.scores.ai_slop)}`,
    `- ${a.user.commit_count} commits (${a.commits} in range), ${a.user.first_commit_at || "?"} / ${a.user.last_commit_at || "?"}, ${a.open} open risks`,
    `- Credited LOC ${fmtScore(a.scores.credited_loc)}  ·  excluded slop/unmodeled/bug-slop LOC ${fmtScore(a.scores.excluded_loc)}`,
    `- Quality components: issues ${fmtScore(a.scores.quality_issues)}  lint ${fmtScore(a.scores.quality_lint)}  api ${fmtScore(a.scores.quality_api)}  ui ${fmtScore(a.scores.quality_ui)}  models ${fmtScore(a.scores.quality_models)}  converters ${fmtScore(a.scores.quality_converters)}  rules ${fmtScore(a.scores.quality_rules)}  slop ${fmtScore(a.scores.quality_slop)}`,
    `- Why: ${a.why || "Scores follow issue hygiene, model/converter design, and slop."}`,
    "",
    "## Features (importance × credited LOC)",
  ];
  if (!a.featureStats?.length) {
    lines.push("- (none)");
  } else {
    for (const f of a.featureStats) {
      lines.push(
        `- ${f.feature} (importance ${f.importance}): credited ${Number(f.credited_loc).toFixed(0)}  excluded ${Number(f.excluded_loc).toFixed(0)}  commits ${f.commit_count}`,
      );
    }
  }
  if (a.creditReasons?.length) {
    lines.push("", "## Excluded LOC");
    for (const r of a.creditReasons) {
      lines.push(`- ${r.reason}: ${r.n} commits / ${Number(r.loc).toFixed(0)} LOC`);
    }
  }
  lines.push("", "## Monthly scores");
  if (!a.months?.length) {
    lines.push("- (run enrich.mjs first)");
  } else {
    for (const m of a.months) {
      lines.push(
        `- ${m.month}: commits ${m.commit_count}  quality ${fmtScore(m.quality_score)}  contrib ${fmtScore(m.contribution_score)}  skill ${fmtScore(m.skill_score)}  slop ${fmtScore(m.ai_slop_score)}  risk ${fmtScore(m.risk_score)}`,
      );
    }
  }
  lines.push("", "## Security exposures (Firestore rules)");
  if (!a.exposures?.length) {
    lines.push("- (none on this user's rules commits)");
  } else {
    for (const e of a.exposures) {
      lines.push(
        `- ${e.sha.slice(0, 8)} ${e.environment} ${e.collection} [${e.severity}] ${e.operations} — ${e.data_exposed}`,
      );
    }
  }
  lines.push("", "## Downstream impact");
  if (!a.impacts?.length) {
    lines.push("- (none)");
  } else {
    for (const i of a.impacts.slice(0, 40)) {
      lines.push(`- ${i.sha.slice(0, 8)} [${i.kind}] ${i.title} (${i.features || ""})`);
    }
  }
  lines.push("", "## Open high/critical issues");
  if (!a.issues?.length) {
    lines.push("- (none in range)");
  } else {
    for (const r of a.issues) {
      lines.push(
        `- \`${r.sha.slice(0, 8)}\` ${(r.authored_at || "").slice(0, 10)} [${r.severity}/${r.category}] ${r.title}${r.path ? ` \`${r.path}${r.start_line ? `:${r.start_line}` : ""}\`` : ""}${r.github_url ? `  [line](${r.github_url})` : ""}`,
      );
      if (r.why) lines.push(`  Why it is wrong: ${r.why}`);
      if (r.should) lines.push(`  How it should be: ${r.should}`);
    }
  }
  lines.push("", "## Risky commits (user)");
  if (a.rows.length === 0) {
    lines.push("- (none in range)");
  } else {
    for (const r of a.rows) {
      lines.push(
        `- ${r.sha.slice(0, 8)} ${r.authored_at.slice(0, 10)}  [${r.category}/${r.severity}] ${r.title}  → ${riskStatus(r)}${r.path ? `  \`${r.path}${r.start_line ? `:${r.start_line}` : ""}\`` : ""}${r.via ? `  via \`${r.via}\`` : ""}${r.github_url ? `  [line](${r.github_url})` : ""}${r.features ? `  features: ${r.features}` : ""}`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function csvCell(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function userCsv(a) {
  const header = [
    "sha",
    "date",
    "subject",
    "risk_score",
    "quality_score",
    "ai_slop_score",
    "features",
    "category",
    "severity",
    "title",
    "detail",
    "path",
    "start_line",
    "end_line",
    "rule_id",
    "github_url",
    "via",
    "evidence",
    "remediated",
    "remediated_by_sha",
    "status",
    "user",
    "github_login",
  ];
  const lines = [header.join(",")];
  for (const r of a.rows) {
    lines.push(
      [
        r.sha,
        r.authored_at,
        r.subject,
        fmtScore(r.risk_score),
        fmtScore(r.quality_score),
        fmtScore(r.ai_slop_score),
        r.features || "",
        r.category,
        r.severity,
        r.title,
        r.detail,
        r.path || "",
        r.start_line || "",
        r.end_line || "",
        r.rule_id || "",
        r.github_url || "",
        r.via || "",
        r.evidence || "",
        r.remediated ? "1" : "0",
        r.remediated_by_sha || "",
        riskStatus(r),
        a.user.canonical_name,
        a.user.github_login || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

function exportUserReports(a) {
  ensureReportsDir();
  const slug = slugify(a.user.canonical_name);
  const mdPath = path.join(REPORTS_DIR, `${slug}.md`);
  const csvPath = path.join(REPORTS_DIR, `${slug}.csv`);
  fs.writeFileSync(mdPath, userMarkdown(a));
  fs.writeFileSync(csvPath, userCsv(a));
  const monthPath = path.join(REPORTS_DIR, `${slug}-monthly.csv`);
  const monthLines = [
    "month,commit_count,quality_score,contribution_score,skill_score,ai_slop_score,risk_score",
    ...(a.months || []).map((m) =>
      [
        m.month,
        m.commit_count,
        fmtScore(m.quality_score),
        fmtScore(m.contribution_score),
        fmtScore(m.skill_score),
        fmtScore(m.ai_slop_score),
        fmtScore(m.risk_score),
      ].join(","),
    ),
  ];
  fs.writeFileSync(monthPath, `${monthLines.join("\n")}\n`);
  const expPath = path.join(REPORTS_DIR, `${slug}-exposures.csv`);
  const expLines = [
    "sha,date,environment,collection,operations,severity,data_exposed,condition",
    ...(a.exposures || []).map((e) =>
      [
        e.sha,
        e.authored_at,
        e.environment,
        e.collection,
        e.operations,
        e.severity,
        e.data_exposed,
        e.condition_text,
      ]
        .map(csvCell)
        .join(","),
    ),
  ];
  fs.writeFileSync(expPath, `${expLines.join("\n")}\n`);
  const featPath = path.join(REPORTS_DIR, `${slug}-features.csv`);
  const featLines = [
    "feature,importance,credited_loc,excluded_loc,commit_count",
    ...(a.featureStats || []).map((f) =>
      [f.feature, f.importance, Number(f.credited_loc).toFixed(1), Number(f.excluded_loc).toFixed(1), f.commit_count].join(
        ",",
      ),
    ),
  ];
  fs.writeFileSync(featPath, `${featLines.join("\n")}\n`);
  return { mdPath, csvPath, monthPath, expPath, featPath };
}

async function exportTeamReports(db, args = {}) {
  ensureReportsDir();
  const range = `${args.from || "beginning"} → ${args.to || "now"}`;
  const users = scoreUsersForRange(db, args.from, args.to);
  const header = [
    "quality_rank",
    "canonical_name",
    "github_login",
    "quality_score",
    "quality_issues",
    "quality_lint",
    "quality_api",
    "quality_ui",
    "quality_models",
    "quality_converters",
    "quality_rules",
    "quality_bugs",
    "quality_slop",
    "quality_findings",
    "quality_remediation",
    "quality_model",
    "quality_trend",
    "hazard_stg",
    "hazard_prod",
    "why",
    "contribution_score",
    "contribution_rank",
    "credited_loc",
    "skill_score",
    "ai_slop_score",
    "risk_score",
    "issues_master",
    "issues_release",
    "rules_stg_gaps",
    "rules_prod_gaps",
    "untested_stg",
    "commit_count",
    "first_commit_at",
    "last_commit_at",
  ];
  const csv = [
    header.join(","),
    ...users.map((u, i) =>
      [
        i + 1,
        csvCell(u.canonical_name),
        csvCell(u.github_login || ""),
        fmtScore(u.quality_score),
        fmtScore(u.quality_issues),
        fmtScore(u.quality_lint),
        fmtScore(u.quality_api),
        fmtScore(u.quality_ui),
        fmtScore(u.quality_models),
        fmtScore(u.quality_converters),
        fmtScore(u.quality_rules),
        fmtScore(u.quality_bugs),
        fmtScore(u.quality_slop),
        fmtScore(u.quality_findings),
        fmtScore(u.quality_remediation),
        fmtScore(u.quality_model),
        fmtScore(u.quality_trend),
        fmtScore(u.hazard_stg),
        fmtScore(u.hazard_prod),
        csvCell(u.why || ""),
        fmtScore(u.contribution_score),
        u.contribution_rank || "",
        fmtScore(u.credited_loc),
        fmtScore(u.skill_score),
        fmtScore(u.ai_slop_score),
        fmtScore(u.risk_score),
        u.issues_master ?? 0,
        u.issues_release ?? 0,
        u.rules_stg_gaps ?? 0,
        u.rules_prod_gaps ?? 0,
        u.untested_stg ?? 0,
        u.commit_count,
        u.first_commit_at || "",
        u.last_commit_at || "",
      ].join(","),
    ),
  ];
  const csvPath = path.join(REPORTS_DIR, "team.csv");
  const qualityPath = path.join(REPORTS_DIR, "team-quality.csv");
  const mdPath = path.join(REPORTS_DIR, "team.md");
  const issuesPath = path.join(REPORTS_DIR, "team-issues.csv");
  fs.writeFileSync(csvPath, `${csv.join("\n")}\n`);
  fs.writeFileSync(qualityPath, `${csv.join("\n")}\n`);
  const issueLines = [
    [
      "canonical_name",
      "sha",
      "authored_at",
      "severity",
      "category",
      "rule_id",
      "title",
      "path",
      "start_line",
      "end_line",
      "github_url",
      "via",
      "evidence",
      "on_master",
      "on_release",
      "subject",
      "why",
      "should",
    ].join(","),
    ...users.flatMap((u) =>
      (u.issues || []).map((r) =>
        [
          csvCell(u.canonical_name),
          r.sha,
          csvCell(r.authored_at || ""),
          r.severity,
          r.category,
          csvCell(r.rule_id || ""),
          csvCell(r.title),
          csvCell(r.path || ""),
          r.start_line || "",
          r.end_line || "",
          csvCell(r.github_url || ""),
          csvCell(r.via || ""),
          csvCell(r.evidence || ""),
          r.on_master ? 1 : 0,
          r.on_release ? 1 : 0,
          csvCell(r.subject || ""),
          csvCell(r.why || ""),
          csvCell(r.should || ""),
        ].join(","),
      ),
    ),
  ];
  fs.writeFileSync(issuesPath, `${issueLines.join("\n")}\n`);
  const md = [
    "# Commit risk audit — all engineers",
    `Range: ${range}`,
    "",
    "Quality is a balanced composite: shipped high/critical issues, ESLint-aligned lint/React, API/functions auth, slop, then optional shared-model overlay. Every listed issue links to the blob line. Use `--from YYYY-MM-DD` to start later.",
    "",
    "| Q# | Name | Quality | Issues | Lint | API | UI | Slop | Models | Contrib | Commits |",
    "|----|------|---------|--------|------|-----|-----|------|--------|---------|---------|",
    ...users.map((u, i) => {
      return `| ${i + 1} | ${u.canonical_name}${u.github_login ? ` (@${u.github_login})` : ""} | ${fmtScore(u.quality_score)} | ${fmtScore(u.quality_issues)} | ${fmtScore(u.quality_lint)} | ${fmtScore(u.quality_api)} | ${fmtScore(u.quality_ui)} | ${fmtScore(u.ai_slop_score)} | ${fmtScore(u.quality_models)} | ${fmtScore(u.contribution_score)} | ${u.commit_count} |`;
    }),
    "",
    "## Why each score",
    "",
    ...users.flatMap((u) => [
      `### ${u.canonical_name}${u.github_login ? ` (@${u.github_login})` : ""} — quality ${fmtScore(u.quality_score)}`,
      "",
      u.why || "Scores follow issue hygiene, model/converter design, and slop.",
      "",
      ...(u.issues || []).length
        ? [
            `Open high/critical (${(u.issues || []).length}):`,
            "",
            ...(u.issues || []).map(
              (r) =>
                `- \`${r.sha.slice(0, 8)}\` ${(r.authored_at || "").slice(0, 10)} [${r.severity}/${r.category}${r.rule_id ? `/${r.rule_id}` : ""}] ${r.title}${r.path ? ` \`${r.path}${r.start_line ? `:${r.start_line}` : ""}\`` : ""}${r.via ? ` via \`${r.via}\`` : ""}${r.github_url ? ` ([line](${r.github_url}))` : ""}${r.on_master ? " · stg" : ""}${r.on_release ? " · prod" : ""}${r.model_confirmed ? " · model-confirmed" : r.model_rejected ? " · model-rejected" : ""}\n  Why: ${r.why || ""}\n  Fix: ${r.should || ""}`,
            ),
            "",
          ]
        : ["No open high/critical findings in this range.", ""],
    ]),
    "Open `team.pdf` for the stakeholder pack. Issue list: `team-issues.csv`.",
    "",
  ];
  fs.writeFileSync(mdPath, md.join("\n"));
  const pdfPath = await writeTeamPdf(users, { range });
  return { csvPath, qualityPath, mdPath, issuesPath, pdfPath };
}

async function printAllUsers(db, args) {
  if (!args["skip-verify"]) {
    const verified = await verifySample(db);
    printVerify(verified);
    if (!verified.ok) {
      console.error("Sample-and-verify failed; not writing PDFs. Fix the FP class, then rescore.");
      process.exit(1);
    }
  }
  const users = db
    .prepare(
      `SELECT u.* FROM users u
       WHERE EXISTS (SELECT 1 FROM commits c WHERE c.user_id = u.id AND c.is_bot = 0)
       ORDER BY COALESCE(u.contribution_score, 0) DESC`,
    )
    .all();
  if (!args["skip-enrich"]) {
    for (const u of users) {
      console.error(`Enriching ${u.canonical_name}…`);
      enrichUser(db, u.id);
    }
    relativizeContributions(db);
  }
  for (const u of users) {
    await printUser(db, { ...args, name: u.canonical_name, report: true, "skip-enrich": true });
  }
  const team = await exportTeamReports(db, args);
  console.log(`Wrote ${team.mdPath}`);
  console.log(`Wrote ${team.csvPath}`);
  console.log(`Wrote ${team.qualityPath}`);
  console.log(`Wrote ${team.issuesPath}`);
  console.log(`Wrote ${team.pdfPath}`);
}

function printUserShort(a) {
  const handle = a.user.github_login ? ` (@${a.user.github_login})` : "";
  const rank =
    a.scores.contribution_rank && a.scores.contribution_of
      ? `rank ${a.scores.contribution_rank} of ${a.scores.contribution_of}`
      : "unranked — run enrich";
  console.log(`${a.user.canonical_name}${handle}  ·  ${a.range}`);
  console.log(`  ${a.commits} commits  ·  ${a.openSevere} unremediated high/critical`);
  console.log(
    `  Quality ${fmtScore(a.scores.quality)}  (issue-hygiene ${fmtScore(a.scores.quality_issues)}  models ${fmtScore(a.scores.quality_models)}  conv ${fmtScore(a.scores.quality_converters)}  slop ${fmtScore(a.scores.ai_slop)})`,
  );
  if (a.why) console.log(`  Why: ${a.why}`);
  console.log(
    `  Contrib ${fmtScore(a.scores.contribution)} (${rank})  Skill ${fmtScore(a.scores.skill)}  AI-slop ${fmtScore(a.scores.ai_slop)}  Risk ${fmtScore(a.scores.risk)}`,
  );
  console.log(
    `  Staging issues ${a.user.issues_master ?? 0}  ·  prod issues ${a.user.issues_release ?? 0}  ·  rules gaps stg ${a.user.rules_stg_gaps ?? 0} / prod ${a.user.rules_prod_gaps ?? 0}  ·  untested in stg ${a.user.untested_stg ?? 0}`,
  );
  console.log(
    `  Credited LOC ${fmtScore(a.scores.credited_loc)}  ·  excluded slop/unmodeled/bug-slop LOC ${fmtScore(a.scores.excluded_loc)}`,
  );
  console.log(`  Open findings: ${a.open}  ·  Rules exposures: ${(a.exposures || []).length}`);
  if (a.featureStats?.length) {
    const top = a.featureStats.slice(0, 8).map(
      (f) =>
        `${f.feature}(imp ${f.importance}): +${Number(f.credited_loc).toFixed(0)} / excl ${Number(f.excluded_loc).toFixed(0)}`,
    );
    console.log(`  Features: ${top.join("  ·  ")}`);
  }
  if (a.creditReasons?.length) {
    console.log(
      `  Excluded because: ${a.creditReasons
        .map((r) => `${r.reason} ${Number(r.n)} commits / ${Number(r.loc).toFixed(0)} LOC`)
        .join("  ·  ")}`,
    );
  }
  console.log("  Contribution counts all insertions. Models/converters are design scores, not LOC.");
  console.log("  Comprehensive PDF/CSV is not written unless you ask: make audit-commits-report USER=<name>");
}

async function printUser(db, args) {
  const preview = findUser(db, args.name);
  if (!preview) {
    console.error(`No user matching ${args.name}`);
    process.exit(1);
  }
  const wantReport = Boolean(args.report);
  if (wantReport && !args["skip-enrich"]) {
    console.error(`Enriching ${preview.canonical_name} (features, rules exposures, monthly scores)…`);
    enrichUser(db, preview.id);
  }
  const a = loadUserAnalysis(db, args);
  printUserShort(a);
  if (!wantReport) return;
  const paths = exportUserReports(a);
  const pdfPath = await writeStakeholderPdf(a);
  console.log(`Wrote ${paths.mdPath}`);
  console.log(`Wrote ${paths.csvPath}`);
  console.log(`Wrote ${paths.monthPath}`);
  console.log(`Wrote ${paths.expPath}`);
  console.log(`Wrote ${paths.featPath}`);
  console.log(`Wrote ${pdfPath}`);
}

function printUsers(db) {
  const users = db
    .prepare(
      `SELECT u.* FROM users u
       WHERE EXISTS (SELECT 1 FROM commits c WHERE c.user_id = u.id AND c.is_bot = 0)
       ORDER BY COALESCE(u.contribution_score, 0) DESC`,
    )
    .all();
  console.log("contrib rank   credited     excluded  commits  name");
  for (const u of users) {
    const rank = u.contribution_rank && u.contribution_of ? `${u.contribution_rank}/${u.contribution_of}` : "-";
    console.log(
      `${fmtScore(u.contribution_score).padStart(6)} ${String(rank).padStart(5)}  cred ${fmtScore(u.credited_loc).padStart(8)}  excl ${fmtScore(u.excluded_loc).padStart(8)}  ${String(u.commit_count).padStart(5)}  ${u.canonical_name}`,
    );
  }
}

function printRisks(db, args) {
  const { sql, params } = dateClause(args.from, args.to);
  const filters = [];
  if (args.open) filters.push("r.remediated = 0");
  if (args.category) filters.push("r.category = ?");
  const extra = filters.length ? `AND ${filters.join(" AND ")}` : "";
  const extraParams = args.category ? [args.category] : [];
  const rows = db
    .prepare(
      `
      SELECT c.sha, c.authored_at, c.risk_score, c.subject, u.canonical_name,
             r.category, r.severity, r.title, r.remediated, r.remediated_by_sha
      FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      JOIN users u ON u.id = c.user_id
      WHERE 1=1 ${sql} ${extra}
      ORDER BY c.authored_at DESC
      LIMIT ${Number(args.limit) || 100}
    `,
    )
    .all(...params, ...extraParams);
  for (const r of rows) {
    const status = r.remediated ? `remediated ${r.remediated_by_sha.slice(0, 8)}` : "OPEN";
    console.log(
      `${r.sha.slice(0, 8)} ${r.authored_at.slice(0, 10)} ${r.canonical_name} [${r.category}/${r.severity}] ${r.title} → ${status}`,
    );
    console.log(`         ${r.subject}`);
  }
}

async function printSearch(db, args) {
  const q = args.q || args.query;
  if (!q) {
    console.error("search requires --q <text>");
    process.exit(1);
  }
  const blobs = db.prepare("SELECT sha, dim, vector FROM commit_embedding_blobs").all();
  if (blobs.length === 0) {
    console.error("No embeddings yet. Run embed.mjs first.");
    process.exit(1);
  }
  ensureLocalDeps(["@xenova/transformers"]);
  process.env.TRANSFORMERS_CACHE = path.join(DATA_DIR, "models");
  const require = createRequire(path.join(DATA_DIR, "package.json"));
  const { pipeline } = require("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  const out = await extractor(String(q).slice(0, 8000), { pooling: "mean", normalize: true });
  const queryVec = Array.from(out.data);

  let ranked;
  if (db.vecLoaded) {
    try {
      ranked = db
        .prepare(
          `
          SELECT sha, distance FROM commit_embeddings
          WHERE embedding MATCH ?
          ORDER BY distance
          LIMIT ${Number(args.limit) || 10}
        `,
        )
        .all(JSON.stringify(queryVec));
      ranked = ranked.map((r) => ({ sha: r.sha, score: -r.distance }));
    } catch {
      ranked = null;
    }
  }
  if (!ranked) {
    ranked = blobs
      .map((b) => ({ sha: b.sha, score: cosine(queryVec, blobToFloat32(b.vector)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Number(args.limit) || 10);
  }
  const get = db.prepare(
    `SELECT c.sha, c.authored_at, c.subject, c.risk_score, u.canonical_name
     FROM commits c JOIN users u ON u.id = c.user_id WHERE c.sha = ?`,
  );
  for (const r of ranked) {
    const c = get.get(r.sha);
    if (!c) continue;
    console.log(
      `${c.sha.slice(0, 8)} ${c.authored_at.slice(0, 10)} ${c.canonical_name} risk ${fmtScore(c.risk_score)}  sim ${fmtScore(r.score)}  ${c.subject}`,
    );
  }
}

async function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  const cmd = args._[0] || "report";
  if (args.help || cmd === "help") {
    printHelp("query.mjs", [
      "report [--from ISO] [--to ISO]",
      "users",
      "user --name <name> [--from ISO] [--to ISO]          console summary only",
      "user --name <name> --report [--skip-enrich]         write comprehensive PDF/CSV (only when asked)",
      "user --all --report [--skip-enrich] [--skip-verify] write PDF/CSV for every engineer + team.csv",
      "risks [--open] [--category models] [--from ISO] [--to ISO] [--limit 100]",
      "search --q <text> [--limit 10]",
    ]);
    return;
  }
  const db = openDb();
  if (cmd === "report") printReport(db, args);
  else if (cmd === "users") printUsers(db);
  else if (cmd === "user" && args.all) await printAllUsers(db, args);
  else if (cmd === "user") await printUser(db, args);
  else if (cmd === "risks") printRisks(db, args);
  else if (cmd === "search") await printSearch(db, args);
  else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
