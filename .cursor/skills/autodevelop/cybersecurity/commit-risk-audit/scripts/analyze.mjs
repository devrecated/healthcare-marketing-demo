/**
 * Copyright (c) 2026 Devrecated
 */
import path from "node:path";
import {
  domainsForPaths,
  git,
  isConverterPath,
  isFeaturePath,
  isModelsPath,
  isNoiseCommit,
  isRulesPath,
  featureSubject,
  recomputeUserScores,
  refreshRiskyCommits,
  scoreFromRisks,
  tokenizePath,
  withTx,
} from "./lib.mjs";
import { assessModelsDesign } from "./model-logic.mjs";
import { explainFinding } from "./issue-explain.mjs";
import { isSkipLlmReview, requiresConfirmation } from "./model-runtime.mjs";
import {
  combineComponentZ,
  countHygiene,
  empiricalBayes,
  hazardIntegral,
  issueHygieneFromHazard,
  median,
  riskFromHazard,
  skillFromQuality,
  softmaxLogContribution,
  splitEnvEvents,
  trendScore,
} from "./math-model.mjs";

const FEATURE_PREFIXES = {
  dashboard: ["web/app/src/views/SuperAdmin/SuperAdminHome", "web/app/src/hooks/useDashboardDisplay", "src/views/SuperAdmin"],
  leads: ["web/app/src/views/SuperAdmin/Management/LeadManagement", "web/app/src/hooks/contacts", "HubspotDash", "hubspot"],
  inventory: ["web/app/src/views/SuperAdmin/Inventory", "web/app/src/hooks/inventory", "packages/models/inventory", "src/views/SuperAdmin/Inventory", "src/hooks/useInventory"],
  applications: ["web/app/src/views/SuperAdmin/Management/ApplicationManagement", "packages/models/application"],
  "banks-offers": ["web/app/src/views/Bank", "web/app/src/hooks/useOffers", "packages/models/offers"],
  transporter: ["web/app/src/hooks/transporter", "web/app/src/hooks/logistics"],
  expenses: ["web/app/src/hooks/useExpenses", "packages/models/expenses"],
  "gray-book": ["web/app/src/views/SuperAdmin/Tools/GrayBook", "web/app/src/hooks/graybook"],
  freelo: ["web/app/src/views/SuperAdmin/Freelo", "web/app/src/hooks/useFreelo"],
  users: ["web/app/src/views/SuperAdmin/Management/UserManagement", "packages/models/user"],
  "photo-uploader": ["web/vehicle-uploader", "web/app/src/hooks/useAccessCodes"],
  "business-submissions": ["web/app/src/views/SuperAdmin/Management/BusinessSubmissions"],
  invoices: ["web/app/src/views/SuperAdmin/Management/InvoiceManagement"],
  parts: ["web/app/src/hooks/parts"],
  "time-tracker": ["web/app/src/views/SuperAdmin/TimeTracker", "web/app/src/hooks/timesheet"],
};


export const COLLECTION_DATA = {
  master_inventory: "Vehicle inventory (VIN, asking/wholesale prices, photos, title status, dealer notes)",
  shield_inventory: "Shield inventory records (pricing, availability, dealer notes)",
  accessCodes: "Photo-uploader access codes (unauthenticated upload if world-writable)",
  users: "User profiles, roles, emails, and other PII",
  applications: "Loan applications and financing data",
  banks: "Bank configuration and agent bindings",
  messages: "Internal dealer messages",
  photolinks: "Vehicle photo URLs",
  photo_task_templates: "Photo task templates",
  form_rfi: "Website RFI lead PII",
  form_sell: "Website sell-your-truck lead PII",
  form_contact: "Website contact-form PII",
  sell_truck_submission: "Public sell-your-truck submissions (seller PII, truck details)",
  website_inventory: "Website-facing inventory documents (pricing, photos, stock)",
  inventoryLists: "Saved inventory lists",
  userInventoryLists: "Per-user inventory lists",
  clock_reminder: "Timesheet / clock reminders",
  document_history: "Document history metadata",
  column_templates: "Grid column templates",
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function monthKey(iso) {
  return String(iso || "").slice(0, 7);
}

export function featuresForPaths(paths) {
  const hits = new Set(domainsForPaths(paths));
  for (const [feature, prefixes] of Object.entries(FEATURE_PREFIXES)) {
    if ((prefixes || []).some((pre) => paths.some((p) => p.startsWith(pre) || p.includes(`/${feature}/`)))) {
      hits.add(feature);
    }
  }
  return [...hits].sort();
}

export function slopForCommit(commit, files) {
  const subject = (commit.subject || "").trim();
  if (/^merge\b/i.test(subject)) return 0;
  const body = commit.body || "";
  const paths = files.map((f) => f.path);
  const filesN = commit.files_changed || files.length || 0;
  const ins = commit.insertions || 0;
  const feature = paths.some(isFeaturePath);
  const models = paths.some(isModelsPath);
  const converters = paths.some(isConverterPath);
  const added = files.filter((f) => f.status === "A").length;
  let slop = 0;
  if (subject.length > 0 && subject.length < 8) slop += 20;
  if (
    /^(wip|temp|tmp|fix|fixed|update|updated|updates|change|changes|test|tests|smallfix|small|hotfix|patch|try|asdf|stuff|misc|ok|typo|cleanup|refactor|init|ready|chips|better|mobile|staged)$/i.test(
      subject,
    )
  ) {
    slop += 28;
  }
  const tokens = subject.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 2 && filesN > 3) slop += 26;
  else if (tokens.length <= 2) slop += 14;
  if (subject.split(/\s+/).filter(Boolean).length <= 2 && filesN > 8) slop += 18;
  if (feature && !models && (ins >= 80 || added >= 3) && !isNoiseCommit(paths, subject)) slop += 22;
  if (feature && !converters && ins >= 120 && !isNoiseCommit(paths, subject)) slop += 12;
  if (paths.some((p) => /web\/app\/.*\/(types|interfaces|models)\.[tj]sx?$/.test(p)) && !models) slop += 18;
  if ((filesN > 80 || ins > 1500) && !paths.some((p) => /test|spec/i.test(p))) slop += 20;
  if (!body.trim() && filesN > 30) slop += 12;
  if (/generated by|copilot|chatgpt|claude|gpt-|cursor ai/i.test(`${subject}\n${body}`)) slop += 25;
  if (/^[a-z0-9]+(-[a-z0-9]+){0,3}$/i.test(subject) && filesN > 20) slop += 10;
  if ((commit.risk_score || 0) >= 30 && filesN > 50) slop += 10;
  return clamp(slop, 0, 100);
}

export function parseRulesExposures(content, environment) {
  const exposures = [];
  if (!content) return exposures;
  const lines = content.split("\n");
  let currentMatch = "";
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^match\s+(\/[^{]+)/);
    if (m) currentMatch = m[1].replace(/\s+/g, " ").trim();
    const allow = line.match(/allow\s+([^:]+):\s*(?:if\s+)?(.+)?/i);
    if (!allow) continue;
    const operations = allow[1].trim();
    const cond = (allow[2] || "").replace(/;+\s*$/, "").trim();
    const open =
      /\|\|\s*true/.test(cond) ||
      /\bif\s+true\b/.test(line) ||
      /:\s*if\s+true\b/i.test(line) ||
      (/\ballow\s+(read|write|update|delete)/i.test(line) && /if\s+true\b/i.test(line));
    const unauthWrite = /write|update|delete/i.test(operations) && !/request\.auth/i.test(cond) && !/get\(\/databases/i.test(cond);
    if (!open && !unauthWrite) continue;
    const col = currentMatch.replace(/^\/+/, "").split("/")[0] || currentMatch;
    exposures.push({
      environment,
      collection: currentMatch || col,
      operations,
      condition_text: cond.slice(0, 240),
      data_exposed: COLLECTION_DATA[col] || `Documents under ${currentMatch || col}`,
      severity: open ? "critical" : "high",
      introduced: 1,
    });
  }
  return exposures;
}

function showRules(sha, rel) {
  try {
    return git(["show", `${sha}:${rel}`]);
  } catch {
    return "";
  }
}

export function exposuresForCommit(commit, files) {
  const rules = files.filter((f) => isRulesPath(f.path));
  if (rules.length === 0) return [];
  const out = [];
  const parent = (commit.parent_shas || "").split(/\s+/)[0] || "";
  for (const f of rules) {
    const env = /stg|staging/.test(f.path) ? "staging" : /prod|production/.test(f.path) ? "production" : "unknown";
    const now = parseRulesExposures(showRules(commit.sha, f.path), env);
    const before = parent ? parseRulesExposures(showRules(parent, f.path), env) : [];
    const beforeKeys = new Set(before.map((e) => `${e.collection}|${e.operations}|${e.condition_text}`));
    for (const e of now) {
      e.introduced = beforeKeys.has(`${e.collection}|${e.operations}|${e.condition_text}`) ? 0 : 1;
      if (e.introduced || e.severity === "critical") out.push(e);
    }
  }
  return out;
}

export function impactsForCommit(commit, files, features, knownModelBases) {
  const paths = files.map((f) => f.path);
  const impacts = [];
  const featureList = features.join(", ") || "unscoped";

  if (paths.some(isFeaturePath) && !paths.some(isModelsPath)) {
    impacts.push({
      kind: "missing_models",
      title: "Feature shipped without shared models package",
      detail: `Affects ${featureList}. Long-term: ad-hoc types in app/API/functions, duplicate Firestore shapes, and converters that cannot stay in sync.`,
      features: featureList,
    });
  }
  if (
    (paths.some(isFeaturePath) || paths.some((p) => isModelsPath(p) && !isConverterPath(p))) &&
    !paths.some(isConverterPath)
  ) {
    impacts.push({
      kind: "missing_converters",
      title: "Change shipped without a converter update",
      detail: `Affects ${featureList}. Long-term: UI/API fields drift from Firestore, and later features fork another unofficial shape.`,
      features: featureList,
    });
  }

  const addedModels = files.filter(
    (f) => f.status === "A" && isModelsPath(f.path) && !isConverterPath(f.path),
  );
  for (const f of addedModels) {
    const tokens = new Set(tokenizePath(f.path));
    const overlap = (knownModelBases || []).filter((other) => {
      if (other === f.path) return false;
      const ot = tokenizePath(other);
      return ot.filter((t) => tokens.has(t)).length >= 2;
    });
    if (overlap.length) {
      impacts.push({
        kind: "redundant_models",
        title: `Possible redundant model ${path.basename(f.path)}`,
        detail: `Overlaps ${overlap.slice(0, 4).map((p) => path.basename(p)).join(", ")}. Long-term: forked types, two converters for one collection, and queries that silently read the wrong shape.`,
        features: featureList,
      });
    }
  }

  if (features.length >= 3 && !paths.some(isModelsPath)) {
    impacts.push({
      kind: "coupling",
      title: "Unrelated features changed together",
      detail: `${featureList} shipped in one commit without a shared model. Long-term: regressions travel across domains and review cannot isolate blast radius.`,
      features: featureList,
    });
  }

  if (paths.some(isRulesPath)) {
    impacts.push({
      kind: "rules",
      title: "Firebase rules changed",
      detail: `Review exposures for ${featureList}. A widened allow can persist for every later deploy until explicitly closed.`,
      features: featureList,
    });
  }

  return impacts;
}

export const FEATURE_COLLECTIONS = {
  inventory: ["master_inventory", "shield_inventory", "website_inventory", "photolinks", "inventoryLists"],
  leads: ["form_rfi", "form_sell", "form_contact", "sell_truck_submission"],
  applications: ["applications"],
  application: ["applications"],
  users: ["users"],
  photos: ["accessCodes", "photolinks"],
  "photo-uploader": ["accessCodes"],
  "banks-offers": ["banks"],
  banks: ["banks"],
  offers: ["banks"],
};

export function userSlopScore(commits) {
  const rows = (commits || []).filter((c) => !/^merge\b/i.test(c.subject || ""));
  if (!rows.length) return 0;
  const n = rows.length;
  let camel = 0;
  let short = 0;
  let dump = 0;
  let high = 0;
  let weighted = 0;
  let loc = 0;
  const subjects = new Map();
  for (const c of rows) {
    const sub = (c.subject || "").trim();
    const sl = c.ai_slop_score || 0;
    const ins = Math.max(1, c.insertions || 0);
    weighted += sl * ins;
    loc += ins;
    const tokens = sub.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ").trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= 2) camel += 1;
    if (sub.length > 0 && sub.length < 12) short += 1;
    if ((c.insertions || 0) > 400 || (c.files_changed || 0) > 40) dump += 1;
    if (sl >= 35) high += 1;
    subjects.set(sub.toLowerCase(), (subjects.get(sub.toLowerCase()) || 0) + 1);
  }
  const repeats = [...subjects.values()].filter((v) => v >= 3).reduce((a, b) => a + b, 0);
  return clamp(
    0.15 * (weighted / loc) +
      0.35 * (100 * (camel / n)) +
      0.2 * (100 * (short / n)) +
      0.15 * (100 * (high / n)) +
      0.1 * (100 * (dump / n)) +
      0.05 * Math.min(100, (100 * repeats) / n),
    0,
    100,
  );
}

function rulesSnapshotAt(db, environment, iso) {
  if (!iso) return null;
  return db
    .prepare(
      `
      SELECT * FROM rules_snapshots
      WHERE environment = ? AND rules_type = 'firestore' AND IFNULL(content,'') != ''
        AND captured_at <= ?
      ORDER BY captured_at DESC
      LIMIT 1
    `,
    )
    .get(environment, iso);
}

function collectionsForFeatures(features) {
  const cols = new Set();
  for (const f of features || []) {
    for (const c of FEATURE_COLLECTIONS[f] || []) cols.add(c);
  }
  return [...cols];
}

export function evaluateCommitEnvRules(db, commit, features) {
  const cols = collectionsForFeatures(features);
  const rows = [];
  const stgAt = commit.authored_at;
  const prodAt = commit.prod_landed_at || (commit.on_release ? commit.authored_at : null);
  const specs = [
    { environment: "staging", at: stgAt, on: commit.on_master },
    { environment: "production", at: prodAt, on: commit.on_release },
  ];
  for (const spec of specs) {
    if (!spec.on || !spec.at) continue;
    const snap = rulesSnapshotAt(db, spec.environment, spec.at);
    const exposures = parseRulesExposures(snap?.content || "", spec.environment);
    let open = 0;
    let missing = 0;
    for (const col of cols) {
      const hits = exposures.filter((e) => (e.collection || "").includes(col) || col.includes((e.collection || "").replace(/^\//, "").split("/")[0]));
      if (hits.length === 0 && cols.length) {
        const hasMatch = (snap?.content || "").includes(col);
        if (!hasMatch) missing += 1;
      }
      open += hits.filter((h) => h.severity === "critical" || h.severity === "high").length;
    }
    if (cols.length === 0 && exposures.some((e) => e.introduced !== 0 && e.severity === "critical")) {
      open += 1;
    }
    const tested = spec.environment === "staging" && missing === 0 && open === 0 && Boolean(snap?.content);
    rows.push({
      sha: commit.sha,
      environment: spec.environment,
      snapshot_at: snap?.captured_at || null,
      collections: cols.join(","),
      open_allows: open,
      missing_match: missing,
      tested: tested ? 1 : 0,
    });
  }
  return rows;
}

export const FEATURE_IMPORTANCE = {
  inventory: 5,
  applications: 5,
  application: 5,
  "gray-book": 5,
  graybook: 5,
  "banks-offers": 5,
  banks: 5,
  offers: 5,
  leads: 4,
  transporter: 4,
  checkbook: 4,
  logistics: 4,
  expenses: 3,
  payroll: 3,
  invoices: 3,
  "photo-uploader": 3,
  photos: 3,
  repair: 3,
  parts: 3,
  users: 3,
  dashboard: 2,
  freelo: 2,
  tasks: 2,
  performance: 2,
  "time-tracker": 2,
  "business-submissions": 2,
};

export function featureImportance(features) {
  if (!features?.length) return 2;
  return Math.max(...features.map((f) => FEATURE_IMPORTANCE[f] || 2));
}

export function contributionRaw({ commitCount, filesChanged, featureCount }) {
  return (
    18 * Math.log10((commitCount || 0) + 1) +
    10 * Math.log10((filesChanged || 0) + 1) +
    Math.min(25, (featureCount || 0) * 3)
  );
}

export function creditForCommit({ commit, files, features, impacts, slop, causedFix }) {
  const loc = Math.max(0, Number(commit.insertions) || 0);
  const importance = featureImportance(features);
  const paths = files.map((f) => f.path);
  const noise = isNoiseCommit(paths, commit.subject);
  const missingModels =
    !noise &&
    ((impacts || []).some((i) => i.kind === "missing_models") ||
      (paths.some(isFeaturePath) && !paths.some(isModelsPath)));
  const slopN = slop || 0;
  const added = files.filter((f) => f.status === "A").length;
  const newFeature = featureSubject(commit.subject) || added >= 4 || loc >= 250;

  let reason = null;
  if (missingModels && slopN >= 25) reason = "slop_feature_no_models";
  else if (missingModels && newFeature && loc >= 200 && slopN >= 15) reason = "slop_feature_no_models";
  else if (missingModels && newFeature && loc >= 400) reason = "feature_no_models";
  else if (causedFix && slopN >= 25) reason = "slop_caused_fix";
  else if (slopN >= 50 && loc >= 400) reason = "slop_dump";
  else if ((impacts || []).some((i) => i.kind === "rules") && slopN >= 30) reason = "slop_rules";

  const credited = loc * (importance / 5);
  return { loc, credited, reason, importance };
}

function causedLaterFix(commit, fileSet, fixes) {
  const t = Date.parse(commit.authored_at);
  if (!t || fileSet.size === 0) return false;
  const windowMs = 14 * 24 * 60 * 60 * 1000;
  for (const f of fixes) {
    const ft = Date.parse(f.at);
    if (!ft || ft <= t || ft > t + windowMs) continue;
    let overlap = 0;
    for (const p of fileSet) {
      if (f.files.has(p)) {
        overlap += 1;
        if (overlap >= 2) return true;
      }
    }
  }
  return false;
}

export function recomputeCredits(db, onlyUserId = null) {
  const commits = db
    .prepare(
      onlyUserId
        ? "SELECT * FROM commits WHERE is_bot = 0 AND user_id = ? ORDER BY authored_at ASC"
        : "SELECT * FROM commits WHERE is_bot = 0 ORDER BY authored_at ASC",
    )
    .all(...(onlyUserId ? [onlyUserId] : []));
  const filesFor = db.prepare("SELECT path, status FROM commit_files WHERE sha = ?");
  const featsFor = db.prepare("SELECT feature FROM commit_features WHERE sha = ?");
  const impsFor = db.prepare("SELECT kind FROM commit_impacts WHERE sha = ?");
  const filesBySha = new Map();
  for (const c of commits) {
    filesBySha.set(c.sha, filesFor.all(c.sha));
  }
  const fixes = commits
    .filter((c) => /\b(fix|fixed|fixes|revert|hotfix|bug)\b/i.test(c.subject || ""))
    .map((c) => ({
      at: c.authored_at,
      files: new Set((filesBySha.get(c.sha) || []).map((f) => f.path)),
    }));

  const upsert = db.prepare(
    `INSERT OR REPLACE INTO commit_credits (sha, loc_inserted, loc_credited, feature_importance, excluded_reason, counts)
     VALUES (?, ?, ?, ?, ?, 1)`,
  );
  db.prepare(
    onlyUserId
      ? `DELETE FROM user_feature_stats WHERE user_id = ?`
      : `DELETE FROM user_feature_stats`,
  ).run(...(onlyUserId ? [onlyUserId] : []));
  const featAcc = new Map();

  withTx(db, () => {
    for (const c of commits) {
      const files = filesBySha.get(c.sha) || [];
      let features = featsFor.all(c.sha).map((r) => r.feature);
      if (features.length === 0) features = featuresForPaths(files.map((f) => f.path));
      const impacts = impsFor.all(c.sha);
      const slop = c.ai_slop_score ?? slopForCommit(c, files);
      const fileSet = new Set(files.map((f) => f.path));
      const causedFix = slop >= 25 && causedLaterFix(c, fileSet, fixes);
      const credit = creditForCommit({ commit: c, files, features, impacts, slop, causedFix });
      upsert.run(c.sha, credit.loc, credit.credited, credit.importance, credit.reason);
      for (const f of features.length ? features : ["unscoped"]) {
        const key = `${c.user_id}|${f}`;
        const row = featAcc.get(key) || {
          user_id: c.user_id,
          feature: f,
          importance: FEATURE_IMPORTANCE[f] || 2,
          credited_loc: 0,
          excluded_loc: 0,
          commit_count: 0,
        };
        row.commit_count += 1;
        row.credited_loc += credit.credited / Math.max(features.length, 1);
        featAcc.set(key, row);
      }
    }
  });

  const insFeat = db.prepare(
    `INSERT OR REPLACE INTO user_feature_stats
      (user_id, feature, importance, credited_loc, excluded_loc, commit_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const row of featAcc.values()) {
    insFeat.run(row.user_id, row.feature, row.importance, row.credited_loc, row.excluded_loc, row.commit_count);
  }

  const totals = db
    .prepare(
      `
      SELECT c.user_id,
        COALESCE(SUM(cc.loc_credited), 0) AS credited,
        COALESCE(SUM(CASE WHEN cc.loc_credited = 0 THEN cc.loc_inserted ELSE 0 END), 0) AS excluded
      FROM commits c
      JOIN commit_credits cc ON cc.sha = c.sha
      WHERE c.is_bot = 0 ${onlyUserId ? "AND c.user_id = ?" : ""}
      GROUP BY c.user_id
    `,
    )
    .all(...(onlyUserId ? [onlyUserId] : []));
  const updUser = db.prepare("UPDATE users SET credited_loc = ?, excluded_loc = ? WHERE id = ?");
  for (const t of totals) updUser.run(t.credited, t.excluded, t.user_id);
}

export function relativizeContributions(db) {
  recomputeCredits(db);
  const users = db
    .prepare(
      `
      SELECT u.id, COALESCE(u.credited_loc, 0) AS raw
      FROM users u
      WHERE EXISTS (SELECT 1 FROM commits c WHERE c.user_id = u.id AND c.is_bot = 0)
    `,
    )
    .all();
  const maxRaw = Math.max(...users.map((u) => u.raw), 1e-9);
  const sorted = [...users].sort((a, b) => b.raw - a.raw);
  const upd = db.prepare(
    `UPDATE users SET contribution_raw = ?, contribution_score = ?, contribution_rank = ?, contribution_of = ? WHERE id = ?`,
  );
  for (const u of users) {
    const rank = sorted.findIndex((x) => x.id === u.id) + 1;
    upd.run(u.raw, (100 * u.raw) / maxRaw, rank, users.length, u.id);
  }

  const monthRows = db
    .prepare(
      `
      SELECT c.user_id, substr(c.authored_at, 1, 7) AS month, SUM(cc.loc_credited) AS raw
      FROM commits c
      JOIN commit_credits cc ON cc.sha = c.sha
      WHERE c.is_bot = 0
      GROUP BY c.user_id, substr(c.authored_at, 1, 7)
    `,
    )
    .all();
  const byMonth = new Map();
  for (const r of monthRows) {
    const list = byMonth.get(r.month) || [];
    list.push(r);
    byMonth.set(r.month, list);
  }
  const updMonth = db.prepare(
    `UPDATE user_monthly_scores SET contribution_raw = ?, contribution_score = ? WHERE user_id = ? AND month = ?`,
  );
  for (const [month, rows] of byMonth) {
    const max = Math.max(...rows.map((r) => r.raw || 0), 1e-9);
    for (const r of rows) {
      updMonth.run(r.raw || 0, (100 * (r.raw || 0)) / max, r.user_id, month);
    }
  }
}

export function skillScore({ qualityAvg, remediations, openSevere, slopAvg, secretCount, openHazard }) {
  if (openHazard != null) return skillFromQuality(qualityAvg, openHazard, remediations);
  let s = qualityAvg ?? 70;
  s += Math.min(12, (remediations || 0) * 0.4);
  s -= Math.min(28, (openSevere || 0) * 2.5);
  s -= (slopAvg || 0) * 0.35;
  s -= Math.min(20, (secretCount || 0) * 4);
  return clamp(s, 0, 100);
}

export const QUALITY_WEIGHTS = {
  issues: 0.18,
  lint: 0.11,
  api: 0.11,
  slop: 0.13,
  models: 0.08,
  model: 0.1,
  converters: 0.05,
  rules: 0.08,
  ui: 0.06,
  bugs: 0.05,
  findings: 0.03,
  remediation: 0.02,
};

export function authoredRange(from, to, alias = "") {
  const col = alias ? `${alias}.authored_at` : "authored_at";
  const parts = [];
  const params = [];
  if (from) {
    parts.push(`${col} >= ?`);
    params.push(from);
  }
  if (to) {
    parts.push(`${col} <= ?`);
    params.push(String(to).length <= 10 ? `${to}T23:59:59.999Z` : to);
  }
  return { sql: parts.length ? `AND ${parts.join(" AND ")}` : "", params };
}

export function issueHygiene(issuesMaster, issuesRelease) {
  const m = Number(issuesMaster) || 0;
  const r = Number(issuesRelease) || 0;
  return clamp(100 - 1.4 * Math.sqrt(m) - 1.2 * Math.sqrt(r), 0, 100);
}

const SHIPPED_ISSUE_CATS = "('api_auth','security','secrets','firestore_rules','react')";

function countsTowardScore(r) {
  if (!requiresConfirmation(r)) return true;
  return Number(r.confirmed) === 1;
}

function loadShippedRows(db, userId, arc) {
  return db
    .prepare(
      `SELECT r.category, r.severity, r.rule_id, r.confirmed, c.authored_at, c.on_master, c.on_release
       FROM commit_risks r JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND c.is_bot = 0 AND r.remediated = 0
         AND r.severity IN ('high','critical')
         AND r.category IN ${SHIPPED_ISSUE_CATS} ${arc.sql}`,
    )
    .all(userId, ...arc.params)
    .filter(countsTowardScore);
}

export function qualityWhy(u) {
  const parts = [];
  const stg = Number(u.issues_master) || 0;
  const prod = Number(u.issues_release) || 0;
  if (stg + prod >= 10) {
    parts.push(
      `Quality is pulled down by ${stg} open high/critical findings on staging (master) and ${prod} on production (release). Those shipped defects outweigh similar model/converter design.`,
    );
  } else if (stg + prod === 0) {
    const listed = (u.issues || []).length;
    if (listed > 0) {
      parts.push(
        `No model-confirmed shipped high/critical yet (${listed} heuristic findings still listed; auth/XSS/secrets count after CodeAstra).`,
      );
    } else {
      parts.push("No open high/critical findings on staging or production in this range.");
    }
  }
  if ((u.ai_slop_score || 0) >= 35) {
    parts.push(`AI-slop ${Number(u.ai_slop_score).toFixed(0)} from short/generic subjects and dumps.`);
  }
  if ((u.quality_models || 0) < 20) {
    parts.push(
      `Model design ${Number(u.quality_models).toFixed(0)} — feature work without shared types that connect domains.`,
    );
  }
  if ((u.untested_stg || 0) > 40) {
    parts.push(`${u.untested_stg} feature commits lacked a clean staging Firestore rules snapshot.`);
  }
  if ((u.quality_issues || 0) <= 20 && stg + prod >= 10) {
    parts.push(`Issue hygiene ${Number(u.quality_issues).toFixed(0)}/100 (100 minus shipped high/critical volume).`);
  }
  if ((u.quality_api || 100) < 50) {
    parts.push(`API/functions hygiene ${Number(u.quality_api).toFixed(0)} — unprotected or unvalidated routes.`);
  }
  if ((u.quality_lint || 100) < 50) {
    parts.push(`Lint/React hygiene ${Number(u.quality_lint).toFixed(0)} — ESLint-aligned defects on added lines.`);
  }
  if ((u.quality_ui || 100) < 55) {
    parts.push(`UI hygiene ${Number(u.quality_ui).toFixed(0)} — oversized or style-cluttered views.`);
  }
  if (u.quality_trend != null && u.quality_trend < -15) {
    parts.push(`Trend ${Number(u.quality_trend).toFixed(0)} — defect intensity rose in the last 30 days.`);
  }
  if (u.quality_model != null && u.quality_model < 45) {
    parts.push(`Model review ${Number(u.quality_model).toFixed(0)} — CodeReviewer marked many feature hunks as needing comments.`);
  }
  return parts.join(" ");
}

export function loadOpenIssues(db, userId, from, to, limit = 2000) {
  const { sql, params } = authoredRange(from, to, "c");
  return db
    .prepare(
      `
      SELECT c.sha, c.authored_at, c.subject, c.on_master, c.on_release,
             r.category, r.severity, r.title, r.detail, r.path, r.start_line, r.end_line,
             r.evidence, r.rule_id, r.github_url, r.via, r.confirmed, r.llm_model
      FROM commit_risks r
      JOIN commits c ON c.sha = r.sha
      WHERE c.user_id = ? AND c.is_bot = 0 AND r.remediated = 0
        AND r.severity IN ('high','critical') ${sql}
      ORDER BY CASE r.severity WHEN 'critical' THEN 0 ELSE 1 END, c.authored_at DESC
      LIMIT ${Number(limit) || 2000}
    `,
    )
    .all(userId, ...params)
    .map((r) => {
      const exp = explainFinding(r);
      const review = db
        .prepare(
          `SELECT rationale, comment, confirm, model_id FROM llm_reviews
           WHERE sha = ? AND IFNULL(path,'') = ? AND IFNULL(start_line,0) = ?
             AND IFNULL(model_id,'') != 'context/none'
           ORDER BY CASE kind WHEN 'confirm' THEN 0 ELSE 1 END,
                    created_at DESC
           LIMIT 1`,
        )
        .get(r.sha, r.path || "", r.start_line || 0);
      if (review?.rationale && !isSkipLlmReview(review)) exp.why = review.rationale;
      return {
        ...r,
        ...exp,
        model_confirmed: r.confirmed === 1,
        model_rejected: r.confirmed === 0,
      };
    });
}

export function gatherUserComponents(db, userId, range = {}) {
  const { from, to } = range;
  const ar = authoredRange(from, to);
  const arc = authoredRange(from, to, "c");
  const commits = db
    .prepare(`SELECT * FROM commits WHERE user_id = ? AND is_bot = 0 ${ar.sql}`)
    .all(userId, ...ar.params);
  const design = assessModelsDesign(db, userId);
  const models = design.models;
  const converters = design.converters;

  const env = db
    .prepare(
      `
      SELECT e.environment,
        SUM(e.open_allows) AS open_allows,
        SUM(e.missing_match) AS missing_match,
        SUM(CASE WHEN e.environment = 'staging' AND e.tested = 0 THEN 1 ELSE 0 END) AS untested
      FROM commit_env_rules e
      JOIN commits c ON c.sha = e.sha
      WHERE c.user_id = ? ${arc.sql}
      GROUP BY e.environment
    `,
    )
    .all(userId, ...arc.params);
  const stg = env.find((r) => r.environment === "staging") || { open_allows: 0, missing_match: 0, untested: 0 };
  const prod = env.find((r) => r.environment === "production") || { open_allows: 0, missing_match: 0, untested: 0 };
  const lg = (n) => Math.log10(1 + (Number(n) || 0));
  const rules = clamp(100 - 14 * lg(stg.open_allows) - 12 * lg(stg.missing_match) - 16 * lg(prod.open_allows) - 14 * lg(prod.missing_match), 0, 100);

  const loc = db
    .prepare(
      `SELECT
         COALESCE(SUM(cc.loc_inserted), 0) AS tot,
         COALESCE(SUM(CASE WHEN cc.excluded_reason = 'slop_caused_fix' THEN cc.loc_inserted ELSE 0 END), 0) AS fixes
       FROM commit_credits cc
       JOIN commits c ON c.sha = cc.sha
       WHERE c.user_id = ? AND c.is_bot = 0 ${arc.sql}`,
    )
    .get(userId, ...arc.params);
  const tot = Number(loc.tot) || 0;
  const bugs = clamp(100 - 90 * ((Number(loc.fixes) || 0) / Math.max(tot, 1)), 0, 100);

  const slopAvg = userSlopScore(commits);
  const findings = commits.length
    ? commits.reduce((s, c) => s + (c.quality_score || 0), 0) / commits.length
    : 65;

  const remediations = db
    .prepare(
      `SELECT COUNT(*) AS n FROM commit_risks r
       JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND r.remediated = 1 ${arc.sql}`,
    )
    .get(userId, ...arc.params).n;
  const openSevereRows = db
    .prepare(
      `SELECT r.category, r.severity, r.rule_id, r.confirmed
       FROM commit_risks r JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND r.remediated = 0 AND r.severity IN ('high','critical') ${arc.sql}`,
    )
    .all(userId, ...arc.params);
  const openSevere = openSevereRows.filter(countsTowardScore).length;
  const remediation = (100 * remediations) / Math.max(1, remediations + openSevere);

  const shipped = loadShippedRows(db, userId, arc);
  const issuesMaster = shipped.filter((r) => r.on_master).length;
  const issuesRelease = shipped.filter((r) => r.on_release).length;
  const { stg: stgEv, prod: prodEv, origin } = splitEnvEvents(shipped);
  const nowIso = to || new Date().toISOString();
  const T = origin ? Math.max(0, (Date.parse(nowIso) - Date.parse(origin)) / 86_400_000) : 0;
  const hazard_stg = hazardIntegral(stgEv, T);
  const hazard_prod = hazardIntegral(prodEv, T);
  const issues = issueHygieneFromHazard(hazard_stg, hazard_prod);
  const allEv = [...stgEv, ...prodEv];
  const quality_trend = trendScore(allEv, T);

  const catRows = db
    .prepare(
      `SELECT r.category, r.severity, r.rule_id, r.confirmed
       FROM commit_risks r JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND r.remediated = 0 ${arc.sql}`,
    )
    .all(userId, ...arc.params)
    .filter(countsTowardScore);
  const catN = {};
  for (const r of catRows) catN[r.category] = (catN[r.category] || 0) + 1;
  const lint = countHygiene((catN.lint || 0) + (catN.react || 0));
  const api = countHygiene((catN.api_auth || 0) + (catN.security || 0));
  const ui = countHygiene(catN.ui || 0);
  const slopFindings = catN.slop || 0;
  const slopMix = clamp(
    0.65 * slopAvg + 0.35 * Math.min(100, (slopFindings / Math.max(commits.length, 1)) * 80),
    0,
    100,
  );
  const slopHygieneFinal = clamp(100 - slopMix, 0, 100);

  const review = db
    .prepare(
      `SELECT AVG(CAST(lr.review_needed AS REAL)) AS rate, COUNT(*) AS n
       FROM llm_reviews lr JOIN commits c ON c.sha = lr.sha
       WHERE c.user_id = ? AND lr.kind = 'review' ${arc.sql}`,
    )
    .get(userId, ...arc.params);
  const model = review.n
    ? clamp(100 * (1 - (Number(review.rate) || 0)), 0, 100)
    : 55;

  const openHazard = hazard_stg + 1.15 * hazard_prod;

  return {
    userId,
    issues,
    lint,
    api,
    ui,
    models,
    converters,
    rules,
    bugs,
    slop: slopHygieneFinal,
    findings,
    remediation,
    model,
    slopAvg: slopMix,
    issuesMaster,
    issuesRelease,
    rulesStgGaps: Number(stg.open_allows || 0) + Number(stg.missing_match || 0),
    rulesProdGaps: Number(prod.open_allows || 0) + Number(prod.missing_match || 0),
    untestedStg: Number(stg.untested || 0),
    commitCount: commits.length,
    remediations,
    openSevere,
    hazard_stg,
    hazard_prod,
    quality_trend,
    openHazard,
  };
}

export function finalizeUserQualities(raws) {
  if (!raws.length) return [];
  const keys = Object.keys(QUALITY_WEIGHTS);
  const peerByKey = {};
  for (const k of keys) peerByKey[k] = raws.map((r) => r[k] ?? 0);
  const rawQuality = raws.map((r) => combineComponentZ(r, QUALITY_WEIGHTS, peerByKey));
  const mu = median(rawQuality);
  return raws.map((r, i) => {
    const quality = clamp(empiricalBayes(rawQuality[i], mu, r.commitCount), 0, 100);
    const skill = skillFromQuality(quality, r.openHazard, r.remediations);
    const risk = riskFromHazard(r.openHazard);
    return {
      ...r,
      quality,
      quality_model: r.model,
      skill,
      risk,
    };
  });
}

export function computeAllUserMath(db, range = {}) {
  const users = db
    .prepare(
      `SELECT u.id FROM users u
       WHERE EXISTS (SELECT 1 FROM commits c WHERE c.user_id = u.id AND c.is_bot = 0)`,
    )
    .all();
  const raws = users.map((u) => gatherUserComponents(db, u.id, range));
  return finalizeUserQualities(raws);
}

export function computeUserQuality(db, userId, range = {}) {
  const all = computeAllUserMath(db, range);
  const hit = all.find((r) => r.userId === userId);
  if (!hit) {
    return {
      quality: 45,
      issues: 100,
      lint: 100,
      api: 100,
      ui: 100,
      models: 8,
      converters: 8,
      rules: 100,
      bugs: 100,
      slop: 100,
      findings: 65,
      remediation: 0,
      slopAvg: 0,
      issuesMaster: 0,
      issuesRelease: 0,
      rulesStgGaps: 0,
      rulesProdGaps: 0,
      untestedStg: 0,
      commitCount: 0,
      quality_model: 55,
      quality_trend: 0,
      hazard_stg: 0,
      hazard_prod: 0,
    };
  }
  return hit;
}

export function scoreUsersForRange(db, from, to) {
  const users = db
    .prepare(
      `SELECT u.* FROM users u
       WHERE EXISTS (SELECT 1 FROM commits c WHERE c.user_id = u.id AND c.is_bot = 0)`,
    )
    .all();
  const math = computeAllUserMath(db, { from, to });
  const byId = new Map(math.map((m) => [m.userId, m]));
  const rows = [];
  for (const u of users) {
    const q = byId.get(u.id) || computeUserQuality(db, u.id, { from, to });
    const { sql, params } = authoredRange(from, to, "c");
    const loc = db
      .prepare(
        `SELECT COALESCE(SUM(cc.loc_credited), 0) AS credited,
                COALESCE(SUM(c.insertions), 0) AS insertions
         FROM commits c
         LEFT JOIN commit_credits cc ON cc.sha = c.sha
         WHERE c.user_id = ? AND c.is_bot = 0 ${sql}`,
      )
      .get(u.id, ...params);
    const row = {
      ...u,
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
      skill_score: q.skill,
      risk_score: q.risk,
      issues_master: q.issuesMaster,
      issues_release: q.issuesRelease,
      rules_stg_gaps: q.rulesStgGaps,
      rules_prod_gaps: q.rulesProdGaps,
      untested_stg: q.untestedStg,
      credited_loc: Number(loc.credited) || 0,
      commit_count: q.commitCount,
      issues: loadOpenIssues(db, u.id, from, to, 2000),
    };
    row.why = qualityWhy(row);
    rows.push(row);
  }
  const contribs = softmaxLogContribution(rows.map((r) => r.credited_loc));
  const byLoc = [...rows].sort((a, b) => b.credited_loc - a.credited_loc);
  rows.forEach((r, i) => {
    r.contribution_score = contribs[i];
    r.contribution_rank = byLoc.findIndex((x) => x.id === r.id) + 1;
    r.contribution_of = rows.length;
  });
  return rows.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
}

export function enrichUser(db, userId) {
  const commits = db
    .prepare("SELECT * FROM commits WHERE user_id = ? AND is_bot = 0 ORDER BY authored_at ASC")
    .all(userId);
  const filesFor = db.prepare("SELECT path, status FROM commit_files WHERE sha = ?");
  const delFeat = db.prepare("DELETE FROM commit_features WHERE sha = ?");
  const insFeat = db.prepare("INSERT OR IGNORE INTO commit_features (sha, feature) VALUES (?, ?)");
  const delImp = db.prepare("DELETE FROM commit_impacts WHERE sha = ?");
  const insImp = db.prepare(
    "INSERT INTO commit_impacts (sha, kind, title, detail, features) VALUES (?, ?, ?, ?, ?)",
  );
  const delExp = db.prepare("DELETE FROM commit_exposures WHERE sha = ?");
  const insExp = db.prepare(
    `INSERT INTO commit_exposures
      (sha, environment, collection, operations, condition_text, data_exposed, severity, introduced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updSlop = db.prepare("UPDATE commits SET ai_slop_score = ? WHERE sha = ?");

  const knownModels = db
    .prepare(
      `SELECT DISTINCT path FROM commit_files
       WHERE path LIKE 'packages/models/%' AND path NOT LIKE '%/converters/%'`,
    )
    .all()
    .map((r) => r.path);

  const featureSet = new Set();
  let filesChanged = 0;
  withTx(db, () => {
    for (const c of commits) {
      const files = filesFor.all(c.sha);
      const features = featuresForPaths(files.map((f) => f.path));
      features.forEach((f) => featureSet.add(f));
      filesChanged += c.files_changed || files.length || 0;
      delFeat.run(c.sha);
      for (const f of features) insFeat.run(c.sha, f);
      const impacts = impactsForCommit(c, files, features, knownModels);
      delImp.run(c.sha);
      for (const i of impacts) insImp.run(c.sha, i.kind, i.title, i.detail, i.features);
      db.prepare("DELETE FROM commit_env_rules WHERE sha = ?").run(c.sha);
      const envRows = evaluateCommitEnvRules(db, c, features);
      const insEnv = db.prepare(
        `INSERT OR REPLACE INTO commit_env_rules
          (sha, environment, snapshot_at, collections, open_allows, missing_match, tested)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const e of envRows) {
        insEnv.run(e.sha, e.environment, e.snapshot_at, e.collections, e.open_allows, e.missing_match, e.tested);
      }
      const exposures = exposuresForCommit(c, files);
      delExp.run(c.sha);
      for (const e of exposures) {
        insExp.run(
          c.sha,
          e.environment,
          e.collection,
          e.operations,
          e.condition_text,
          e.data_exposed,
          e.severity,
          e.introduced,
        );
      }
      const slop = slopForCommit(c, files);
      updSlop.run(slop, c.sha);
      const insSec = db.prepare(
        `INSERT INTO commit_risks (sha, category, severity, title, detail, remediated)
         VALUES (?, 'security', ?, ?, ?, 0)`,
      );
      const hasSec = db.prepare(
        `SELECT 1 AS n FROM commit_risks WHERE sha = ? AND category = 'security' AND title = ?`,
      );
      for (const e of exposures.filter((x) => x.introduced)) {
        const title = `Firestore allow ${e.operations} on ${e.collection}`;
        if (!hasSec.get(c.sha, title)) {
          insSec.run(
            c.sha,
            e.severity,
            title,
            `${e.data_exposed} via ${e.condition_text || "open condition"} (${e.environment})`,
          );
        }
      }
      const existing = db.prepare("SELECT category, severity FROM commit_risks WHERE sha = ?").all(c.sha);
      const scoredCommit = scoreFromRisks(existing, slop);
      db.prepare("UPDATE commits SET quality_score = ?, risk_score = ?, ai_slop_score = ? WHERE sha = ?").run(
        scoredCommit.quality_score,
        scoredCommit.risk_score,
        slop,
        c.sha,
      );
    }
  });
  recomputeUserScores(db);
  refreshRiskyCommits(db);

  const scored = db
    .prepare("SELECT * FROM commits WHERE user_id = ? AND is_bot = 0 ORDER BY authored_at ASC")
    .all(userId);
  const monthly = new Map();
  for (const c of scored) {
    const m = monthKey(c.authored_at);
    if (!m) continue;
    const row = monthly.get(m) || {
      commit_count: 0,
      quality: 0,
      risk: 0,
      slop: 0,
      files: 0,
    };
    row.commit_count += 1;
    row.quality += c.quality_score || 0;
    row.risk += c.risk_score || 0;
    row.slop += c.ai_slop_score || 0;
    row.files += c.files_changed || 0;
    monthly.set(m, row);
  }

  const remediations = db
    .prepare(
      `SELECT COUNT(*) AS n FROM commit_risks r
       JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND r.remediated = 1`,
    )
    .get(userId).n;
  const openSevere = db
    .prepare(
      `SELECT COUNT(*) AS n FROM commit_risks r
       JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND r.remediated = 0 AND r.severity IN ('high','critical')`,
    )
    .get(userId).n;
  const secretCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM commit_risks r
       JOIN commits c ON c.sha = r.sha
       WHERE c.user_id = ? AND r.category = 'secrets'`,
    )
    .get(userId).n;

  const n = scored.length || 1;
  recomputeCredits(db, userId);
  const q = computeUserQuality(db, userId);
  const qualityAvg = q.quality;
  const slopAvg = q.slopAvg;
  const raw = contributionRaw({
    commitCount: scored.length,
    filesChanged,
    featureCount: featureSet.size,
  });
  const skill = skillScore({ qualityAvg, remediations, openSevere, slopAvg, secretCount, openHazard: q.openHazard });

  db.prepare(
    `DELETE FROM user_monthly_scores WHERE user_id = ?`,
  ).run(userId);
  const insMonth = db.prepare(
    `INSERT INTO user_monthly_scores
      (user_id, month, commit_count, quality_score, contribution_score, contribution_raw, skill_score, ai_slop_score, risk_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const months = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [month, row] of months) {
    const monthQ = row.quality / row.commit_count;
    const sl = row.slop / row.commit_count;
    const rk = row.risk / row.commit_count;
    const monthRaw = contributionRaw({
      commitCount: row.commit_count,
      filesChanged: row.files,
      featureCount: featureSet.size,
    });
    const sk = skillScore({
      qualityAvg: monthQ,
      remediations: remediations / Math.max(1, months.length),
      openSevere: openSevere / Math.max(1, months.length),
      slopAvg: sl,
      secretCount: secretCount / Math.max(1, months.length),
    });
    insMonth.run(userId, month, row.commit_count, monthQ, 0, monthRaw, sk, sl, rk);
  }

  db.prepare(
    `UPDATE users SET
      quality_score = ?, contribution_raw = ?, skill_score = ?, ai_slop_score = ?,
      quality_models = ?, quality_converters = ?, quality_rules = ?, quality_bugs = ?,
      quality_slop = ?, quality_findings = ?, quality_remediation = ?, quality_issues = ?,
      quality_lint = ?, quality_api = ?, quality_ui = ?, quality_model = ?, quality_trend = ?,
      hazard_stg = ?, hazard_prod = ?, risk_score = ?,
      issues_master = ?, issues_release = ?, rules_stg_gaps = ?, rules_prod_gaps = ?, untested_stg = ?
     WHERE id = ?`,
  ).run(
    qualityAvg,
    raw,
    skill,
    slopAvg,
    q.models,
    q.converters,
    q.rules,
    q.bugs,
    q.slop,
    q.findings,
    q.remediation,
    q.issues,
    q.lint,
    q.api,
    q.ui,
    q.quality_model ?? q.model ?? 55,
    q.quality_trend || 0,
    q.hazard_stg || 0,
    q.hazard_prod || 0,
    q.risk ?? skillScore({ qualityAvg, remediations, openSevere, slopAvg, secretCount, openHazard: q.openHazard }),
    q.issuesMaster,
    q.issuesRelease,
    q.rulesStgGaps,
    q.rulesProdGaps,
    q.untestedStg,
    userId,
  );

  relativizeContributions(db);
  const ranked = db.prepare("SELECT contribution_score, contribution_rank, contribution_of FROM users WHERE id = ?").get(userId);
  return {
    qualityAvg,
    contrib: ranked.contribution_score,
    skill,
    slopAvg,
    months: months.length,
    rank: ranked.contribution_rank,
    of: ranked.contribution_of,
  };
}
