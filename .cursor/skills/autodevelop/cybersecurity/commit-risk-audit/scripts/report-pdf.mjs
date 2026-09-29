#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { envLabel, explainFinding, severityLabel } from "./issue-explain.mjs";
import {
  DATA_DIR,
  REPORTS_DIR,
  ensureLocalDeps,
  ensureReportsDir,
  slugify,
} from "./lib.mjs";

const C = {
  navy: "#1B2A4A",
  ink: "#1A1F2E",
  muted: "#5C6570",
  line: "#D5DCE3",
  paper: "#F4F6F8",
  white: "#FFFFFF",
  crit: "#B42318",
  high: "#B54708",
  ok: "#067647",
  mid: "#B54708",
  link: "#1849A9",
  wash: "#EEF2F6",
};

function fmt(n) {
  return Number(n || 0).toFixed(1);
}

function safe(s, max = 400) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function scoreColor(n, mode) {
  const v = Number(n) || 0;
  if (mode === "trend") {
    if (v >= 0) return C.ok;
    if (v >= -15) return C.mid;
    return C.crit;
  }
  if (v >= 70) return C.ok;
  if (v >= 40) return C.mid;
  return C.crit;
}

function severityColor(sev) {
  if (sev === "critical") return C.crit;
  if (sev === "high") return C.high;
  return C.muted;
}

function withPdf(pdfPath, title, fn) {
  ensureLocalDeps(["pdfkit"]);
  ensureReportsDir();
  const require = createRequire(path.join(DATA_DIR, "package.json"));
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 48,
    bufferPages: true,
    info: { Title: title, Author: "Devrecated commit-risk-audit" },
  });
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  return { doc, stream, done: () => new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  }) };
}

function paintHeaderFooter(doc, { title, subtitle }) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const first = i === 0;
    const w = doc.page.width;
    const h = first ? 76 : 34;
    doc.save();
    doc.rect(0, 0, w, h).fill(C.navy);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(first ? 17 : 9);
    doc.text(title, 48, first ? 20 : 11, { width: w - 96, lineBreak: false });
    if (first && subtitle) {
      doc.font("Helvetica").fontSize(9).fillColor("#C5CDD8").text(subtitle, 48, 46, { width: w - 96 });
    }
    const fy = doc.page.height - 28;
    doc.font("Helvetica").fontSize(8).fillColor(C.muted);
    doc.text("Confidential · Git-history quality review · not an HR rating · not proof of AI authorship", 48, fy, {
      width: w - 130,
    });
    doc.text(`${i + 1} / ${range.count}`, w - 78, fy, { width: 30, align: "right" });
    doc.restore();
  }
}

function startBody(doc) {
  doc.y = 92;
  doc.x = 48;
  doc.fillColor(C.ink).font("Helvetica").fontSize(10);
}

function ensureSpace(doc, need) {
  if (doc.y + need > doc.page.height - 52) {
    doc.addPage();
    doc.y = 50;
    doc.x = 48;
  }
}

function heading(doc, t) {
  ensureSpace(doc, 36);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(C.navy).text(t);
  doc.moveDown(0.15);
  const y = doc.y;
  doc.strokeColor(C.line).lineWidth(0.6).moveTo(48, y).lineTo(doc.page.width - 48, y).stroke();
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9).fillColor(C.ink);
}

function paragraph(doc, t, opts = {}) {
  doc.font("Helvetica").fontSize(opts.size || 9).fillColor(opts.color || C.ink).text(t, {
    width: doc.page.width - 96,
    align: opts.align || "left",
  });
}

function metricRow(doc, items) {
  ensureSpace(doc, 72);
  const gap = 8;
  const n = items.length;
  const w = (doc.page.width - 96 - gap * (n - 1)) / n;
  const y = doc.y;
  const x0 = 48;
  items.forEach((it, i) => {
    const x = x0 + i * (w + gap);
    doc.save();
    doc.roundedRect(x, y, w, 62, 4).fill(C.paper);
    doc.font("Helvetica").fontSize(7).fillColor(C.muted).text(it.label.toUpperCase(), x + 8, y + 8, { width: w - 16 });
    doc.font("Helvetica-Bold").fontSize(18).fillColor(scoreColor(it.value, it.mode)).text(it.display ?? fmt(it.value), x + 8, y + 22, {
      width: w - 16,
    });
    doc.font("Helvetica").fontSize(7).fillColor(C.muted).text(it.hint, x + 8, y + 44, { width: w - 16 });
    doc.restore();
  });
  doc.y = y + 72;
}

function componentBars(doc, pairs) {
  ensureSpace(doc, pairs.length * 16 + 8);
  const labelW = 88;
  const barW = doc.page.width - 96 - labelW - 36;
  for (const [label, value] of pairs) {
    const y = doc.y;
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(label, 48, y + 1, { width: labelW });
    doc.save();
    doc.roundedRect(48 + labelW, y + 3, barW, 8, 2).fill(C.wash);
    const fill = Math.max(0, Math.min(1, (Number(value) || 0) / 100)) * barW;
    if (fill > 0) doc.roundedRect(48 + labelW, y + 3, fill, 8, 2).fill(scoreColor(value));
    doc.restore();
    doc.font("Helvetica").fontSize(8).fillColor(C.ink).text(fmt(value), 48 + labelW + barW + 6, y + 1, { width: 28 });
    doc.y = y + 16;
  }
}

function issueBlock(doc, r) {
  const exp = r.why && r.should ? r : { ...r, ...explainFinding(r) };
  ensureSpace(doc, 118);
  const x = 48;
  const w = doc.page.width - 96;
  const y0 = doc.y;
  doc.save();
  doc.roundedRect(x, y0, w, 8, 3).fill(C.paper);
  doc.restore();
  const sev = severityColor(r.severity);
  doc.save();
  doc.roundedRect(x, y0, 58, 14, 3).fill(sev);
  doc.font("Helvetica-Bold").fontSize(7).fillColor(C.white).text(severityLabel(r.severity).toUpperCase(), x + 4, y0 + 3, {
    width: 50,
    align: "center",
  });
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink).text(safe(r.title, 110), x + 66, y0 + 2, { width: w - 74 });
  doc.y = Math.max(doc.y, y0 + 18);
  const loc = r.path ? `${safe(r.path, 72)}${r.start_line ? `:${r.start_line}` : ""}` : "";
  const meta = [
    r.sha ? String(r.sha).slice(0, 8) : "",
    (r.authored_at || "").slice(0, 10),
    r.category,
    envLabel(r),
    loc,
  ]
    .filter(Boolean)
    .join("  ·  ");
  doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(meta, x, doc.y, { width: w });
  if (r.evidence) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(C.muted).text(`Code: ${safe(r.evidence, 180)}`, x, doc.y, { width: w });
  }
  doc.moveDown(0.15);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(C.navy).text("Why this is wrong", x, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(safe(exp.why, 420), x, doc.y, { width: w });
  doc.font("Helvetica-Bold").fontSize(8).fillColor(C.navy).text("How it should be", x, doc.y);
  doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(safe(exp.should, 420), x, doc.y, { width: w });
  if (r.github_url) {
    doc.font("Helvetica").fontSize(8).fillColor(C.link).text(safe(r.github_url, 160), x, doc.y, {
      width: w,
      link: r.github_url,
      underline: true,
    });
  }
  if (r.via) {
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(`Context checked: ${safe(r.via, 120)}`, x, doc.y, { width: w });
  }
  if (r.model_confirmed || r.model_rejected || r.llm_model) {
    const flag = r.model_confirmed ? "model-confirmed" : r.model_rejected ? "model-rejected (does not count)" : "awaiting model";
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(`${flag}${r.llm_model ? ` · ${safe(r.llm_model, 48)}` : ""}`, x, doc.y, { width: w });
  }
  doc.moveDown(0.45);
}

function howToRead(doc) {
  heading(doc, "How to read this review");
  paragraph(
    doc,
    "This pack is for technical leads and business stakeholders. Scores come from git history and Firebase rules — they are review heuristics, not an HR rating and not proof that a model wrote the code.",
  );
  doc.moveDown(0.2);
  paragraph(doc, "Quality (0–100, higher is better) is a peer-relative survival score. Complex auth/XSS/secrets findings count only after a local model confirms them. 50 is the team median after z-scores. Contribution ranks volume of credited lines. AI-slop is higher when commits look dumped or unreviewed. Trend is negative when defect intensity rose in the last 30 days.");
  doc.moveDown(0.2);
  paragraph(doc, "Every high or critical finding below includes the GitHub line, why it is a problem in business terms, and the house standard for the fix. Staging means the commit is on master. Production means it is on release.");
}

function engineerIntro(doc, u) {
  const handle = u.github_login ? ` (@${u.github_login})` : "";
  ensureSpace(doc, 40);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(C.navy).text(`${safe(u.canonical_name, 60)}${handle}`);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(
    `${u.commit_count || 0} commits  ·  ${u.issues_master ?? 0} staging issues  ·  ${u.issues_release ?? 0} production issues`,
  );
  doc.moveDown(0.2);
}

export async function writeStakeholderPdf(report) {
  const slug = slugify(report.user.canonical_name);
  const pdfPath = path.join(REPORTS_DIR, `${slug}.pdf`);
  const name = safe(report.user.canonical_name, 80);
  const { doc, done } = withPdf(pdfPath, `Engineering quality review — ${name}`);
  startBody(doc);
  howToRead(doc);

  heading(doc, "Scorecard");
  const s = report.scores || {};
  const rank =
    s.contribution_rank && s.contribution_of
      ? `${s.contribution_rank} of ${s.contribution_of}`
      : "unranked";
  metricRow(doc, [
    { label: "Quality", value: s.quality, hint: "Higher is better" },
    { label: "Contribution", value: s.contribution, hint: `Peer rank ${rank}` },
    { label: "Skill", value: s.skill, hint: "Quality minus open holes" },
    { label: "AI-slop", value: s.ai_slop, hint: "Higher = more dump risk" },
    { label: "Trend", value: s.quality_trend, hint: "30-day defect intensity", mode: "trend" },
  ]);
  if (report.why) {
    doc.moveDown(0.2);
    paragraph(doc, report.why);
  }
  doc.moveDown(0.3);
  componentBars(doc, [
    ["Issue hygiene", s.quality_issues],
    ["Lint / React", s.quality_lint],
    ["API / auth", s.quality_api],
    ["Models", s.quality_models],
    ["Converters", s.quality_converters],
    ["Rules", s.quality_rules],
    ["UI", s.quality_ui],
    ["Slop hygiene", s.quality_slop],
    ["Model review", s.quality_model],
  ]);

  heading(doc, "Volume and features");
  paragraph(
    doc,
    `${report.commits} commits in range. Credited ${fmt(s.credited_loc)} LOC (every insertion counts). ${report.openSevere} open high/critical findings. ${(report.exposures || []).length} rules exposures.`,
  );
  if (report.featureStats?.length) {
    doc.moveDown(0.2);
    for (const f of report.featureStats.slice(0, 12)) {
      doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(
        `${safe(f.feature, 36)}   importance ${fmt(f.importance)}   credited ${Number(f.credited_loc).toFixed(0)}   commits ${f.commit_count}`,
      );
    }
  }

  const issues = report.issues?.length ? report.issues : (report.rows || []).filter((r) => ["high", "critical"].includes(r.severity) && !r.remediated);
  heading(doc, `Every open high/critical issue (${issues.length})`);
  if (!issues.length) {
    paragraph(doc, "No open high or critical findings in this range.");
  } else {
    paragraph(doc, "Each item is a shipped defect or security/quality hole. Click the blue link to open the exact line on GitHub.");
    doc.moveDown(0.3);
    for (const r of issues) issueBlock(doc, r);
  }

  if (report.exposures?.length) {
    heading(doc, "Firestore / Storage exposures");
    for (const e of report.exposures.slice(0, 40)) {
      ensureSpace(doc, 28);
      doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(
        `${safe(e.sha, 8)}  ${safe(e.environment, 16)}  ${safe(e.collection, 60)}  [${safe(e.severity, 10)}] ${safe(e.operations, 40)}`,
      );
      doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(`Exposed: ${safe(e.data_exposed, 200)}`);
    }
  }

  paintHeaderFooter(doc, {
    title: "Engineering quality review",
    subtitle: `${name}${report.user.github_login ? `  ·  @${report.user.github_login}` : ""}  ·  ${safe(report.range, 60)}`,
  });
  doc.end();
  await done();
  return pdfPath;
}

export async function writeTeamPdf(users, meta = {}) {
  const pdfPath = path.join(REPORTS_DIR, "team.pdf");
  const range = meta.range || "beginning → now";
  const { doc, done } = withPdf(pdfPath, "Engineering quality review — team");
  const byQuality = [...users].sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
  startBody(doc);
  howToRead(doc);

  heading(doc, "Team scorecard");
  paragraph(doc, `${byQuality.length} engineers. Sorted by quality. Contribution is relative (100 = most credited lines).`);
  doc.moveDown(0.25);
  for (const u of byQuality) {
    ensureSpace(doc, 70);
    engineerIntro(doc, u);
    metricRow(doc, [
      { label: "Quality", value: u.quality_score, hint: "Composite" },
      { label: "Issues", value: u.quality_issues, hint: "Shipped high/critical" },
      { label: "API / auth", value: u.quality_api, hint: "Route hygiene" },
      { label: "Contribution", value: u.contribution_score, hint: u.contribution_rank ? `Rank ${u.contribution_rank}` : "Volume" },
      { label: "Trend", value: u.quality_trend, hint: "30-day intensity", mode: "trend" },
    ]);
    paragraph(doc, u.why || "Scores follow issue hygiene, API/auth, models, and slop.");
    doc.moveDown(0.25);
  }

  heading(doc, "Quality components");
  paragraph(doc, "Each bar is 0–100. Green is healthy, amber needs attention, red is a pattern of shipped defects.");
  doc.moveDown(0.2);
  for (const u of byQuality) {
    ensureSpace(doc, 150);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.navy).text(safe(u.canonical_name, 50));
    componentBars(doc, [
      ["Issue hygiene", u.quality_issues],
      ["Lint / React", u.quality_lint],
      ["API / auth", u.quality_api],
      ["Models", u.quality_models],
      ["Converters", u.quality_converters],
      ["Rules", u.quality_rules],
      ["UI", u.quality_ui],
      ["Slop hygiene", u.quality_slop],
      ["Model review", u.quality_model],
    ]);
    doc.moveDown(0.3);
  }

  heading(doc, "Every open high/critical issue");
  paragraph(
    doc,
    "The catalog below is complete for this range (not a sample). Medium/low lint noise is omitted so stakeholders can read the holes that reached staging or production.",
  );
  for (const u of byQuality) {
    const issues = u.issues || [];
    doc.addPage();
    doc.y = 50;
    engineerIntro(doc, u);
    paragraph(
      doc,
      issues.length
        ? `${issues.length} open high/critical findings. Each card explains the business risk and the required fix.`
        : "No open high or critical findings in this range.",
    );
    doc.moveDown(0.25);
    for (const r of issues) issueBlock(doc, r);
  }

  paintHeaderFooter(doc, {
    title: "Engineering quality review",
    subtitle: `All engineers  ·  ${range}  ·  human authors only`,
  });
  doc.end();
  await done();
  return pdfPath;
}
