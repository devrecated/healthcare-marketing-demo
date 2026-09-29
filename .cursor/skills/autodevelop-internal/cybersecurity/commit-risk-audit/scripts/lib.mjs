/**
 * Copyright (c) 2026 Devrecated
 */
import { createRequire } from "node:module";
import { execFileSync, execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(SCRIPT_DIR, "..");
export const ALIASES_PATH = path.join(SKILL_DIR, "aliases.json");

export const SEVERITY_WEIGHT = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
};

export const CATEGORY_SEVERITY_WEIGHT = {
  models: { critical: 22, high: 16, medium: 10, low: 4 },
  breaking: { critical: 22, high: 16, medium: 10, low: 4 },
  firestore_rules: { critical: 32, high: 20, medium: 12, low: 5 },
  security: { critical: 36, high: 24, medium: 12, low: 6 },
  secrets: { critical: 40, high: 22, medium: 10, low: 5 },
  api_auth: { critical: 36, high: 26, medium: 14, low: 6 },
  react: { critical: 28, high: 18, medium: 10, low: 4 },
  lint: { critical: 18, high: 12, medium: 8, low: 3 },
  slop: { critical: 20, high: 14, medium: 8, low: 3 },
  ui: { critical: 16, high: 12, medium: 8, low: 3 },
  quality: { critical: 16, high: 12, medium: 8, low: 4 },
  cross_feature: { critical: 14, high: 10, medium: 6, low: 3 },
};

export function weightForRisk(risk) {
  const byCat = CATEGORY_SEVERITY_WEIGHT[risk.category];
  if (byCat && byCat[risk.severity] != null) return byCat[risk.severity];
  return SEVERITY_WEIGHT[risk.severity] || 0;
}

export const EMBED_DIM = 384;
export const RISKY_THRESHOLD = 15;

const LOCAL_PACKAGES = ["sqlite-vec", "@xenova/transformers"];

export function findRepoRoot(start = SCRIPT_DIR) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error("Could not find repo root (.git)");
}

export const REPO_ROOT = findRepoRoot();
export const DATA_DIR = path.join(REPO_ROOT, ".cursor", "local", "commit-risk-audit");
export const DB_PATH = path.join(DATA_DIR, "audit.sqlite");
export const REPORTS_DIR = path.join(DATA_DIR, "reports");
export const MODELS_DIR = path.join(DATA_DIR, "models");

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

export function slugify(name) {
  return String(name || "user")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "user";
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

export function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

export function detectDefaultRev(override) {
  if (override && override !== true) return override;
  try {
    const ref = git(["symbolic-ref", "refs/remotes/origin/HEAD"]).trim();
    const short = ref.replace(/^refs\/remotes\//, "");
    if (short) return short;
  } catch {
    // fall through
  }
  for (const candidate of ["origin/master", "master", "origin/release", "release", "origin/main", "main"]) {
    try {
      git(["rev-parse", "--verify", candidate], { stdio: ["ignore", "pipe", "ignore"] });
      return candidate;
    } catch {
      // try next
    }
  }
  return "HEAD";
}

export function loadAliases() {
  return JSON.parse(fs.readFileSync(ALIASES_PATH, "utf8"));
}

export function isBotAuthor(name, email, aliases) {
  const n = name || "";
  const e = (email || "").toLowerCase();
  if ((aliases.bots?.emails || []).some((x) => x.toLowerCase() === e)) return true;
  if (e.includes("[bot]@") || e.endsWith("@users.noreply.github.com") && n.includes("[bot]")) {
    return true;
  }
  for (const pat of aliases.bots?.name_patterns || []) {
    if (new RegExp(pat, "i").test(n)) return true;
  }
  return false;
}

export function resolveIdentity(name, email, aliases) {
  const e = (email || "").toLowerCase();
  const n = (name || "").trim();
  for (const user of aliases.users || []) {
    if ((user.emails || []).some((x) => x.toLowerCase() === e)) {
      return { canonical_name: user.canonical_name, github_login: user.github_login || null };
    }
  }
  const nameHits = (aliases.users || []).filter((user) =>
    (user.names || []).some((x) => x.toLowerCase() === n.toLowerCase()),
  );
  if (nameHits.length === 1) {
    return { canonical_name: nameHits[0].canonical_name, github_login: nameHits[0].github_login || null };
  }
  return { canonical_name: n || e || "unknown", github_login: null };
}

export function ensureSqliteFlag() {
  if (process.execArgv.includes("--experimental-sqlite")) return;
  const script = process.argv[1];
  const result = spawnSync(
    process.execPath,
    ["--experimental-sqlite", script, ...process.argv.slice(2)],
    { stdio: "inherit", cwd: process.cwd() },
  );
  process.exit(result.status ?? 1);
}

export function withTx(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  }
}

export function ensureLocalDeps(packages = LOCAL_PACKAGES) {
  ensureDataDir();
  const pkgPath = path.join(DATA_DIR, "package.json");
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        { name: "commit-risk-audit-local", private: true, type: "module" },
        null,
        2,
      ),
    );
  }
  const missing = packages.filter((pkg) => {
    const base = pkg.startsWith("@") ? pkg.split("/").slice(0, 2).join("/") : pkg.split("@")[0];
    return !fs.existsSync(path.join(DATA_DIR, "node_modules", base));
  });
  if (missing.length === 0) return;
  console.error(`Installing local deps in ${DATA_DIR}: ${missing.join(", ")}`);
  execSync(`npm install --no-fund --no-audit ${missing.join(" ")}`, {
    cwd: DATA_DIR,
    stdio: "inherit",
  });
}

function localRequire() {
  ensureLocalDeps();
  return createRequire(path.join(DATA_DIR, "package.json"));
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  github_login TEXT,
  risk_score REAL NOT NULL DEFAULT 0,
  commit_count INTEGER NOT NULL DEFAULT 0,
  first_commit_at TEXT,
  last_commit_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS user_aliases (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  author_name TEXT,
  author_email TEXT,
  UNIQUE (author_name, author_email)
);

CREATE TABLE IF NOT EXISTS commits (
  sha TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  author_name TEXT,
  author_email TEXT,
  authored_at TEXT NOT NULL,
  committed_at TEXT,
  subject TEXT,
  body TEXT,
  files_changed INTEGER,
  insertions INTEGER,
  deletions INTEGER,
  quality_score REAL,
  risk_score REAL,
  is_bot INTEGER DEFAULT 0,
  parent_shas TEXT,
  indexed_at TEXT
);

CREATE TABLE IF NOT EXISTS commit_files (
  sha TEXT NOT NULL REFERENCES commits(sha),
  path TEXT NOT NULL,
  status TEXT,
  PRIMARY KEY (sha, path)
);

CREATE TABLE IF NOT EXISTS commit_risks (
  id INTEGER PRIMARY KEY,
  sha TEXT NOT NULL REFERENCES commits(sha),
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT,
  detail TEXT,
  remediated INTEGER DEFAULT 0,
  remediated_by_sha TEXT,
  remediated_at TEXT
);

CREATE TABLE IF NOT EXISTS user_risky_commits (
  user_id INTEGER NOT NULL REFERENCES users(id),
  sha TEXT NOT NULL REFERENCES commits(sha),
  PRIMARY KEY (user_id, sha)
);

CREATE TABLE IF NOT EXISTS commit_embedding_blobs (
  sha TEXT PRIMARY KEY REFERENCES commits(sha),
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS rules_snapshots (
  id INTEGER PRIMARY KEY,
  environment TEXT NOT NULL,
  rules_type TEXT NOT NULL,
  source TEXT NOT NULL,
  sha TEXT,
  captured_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  notes TEXT,
  UNIQUE (environment, rules_type, source, content_hash, sha)
);

CREATE INDEX IF NOT EXISTS idx_commits_user_date ON commits(user_id, authored_at);
CREATE INDEX IF NOT EXISTS idx_commits_authored ON commits(authored_at);
CREATE INDEX IF NOT EXISTS idx_risks_sha ON commit_risks(sha);
CREATE INDEX IF NOT EXISTS idx_risks_open ON commit_risks(remediated, category, severity);
CREATE INDEX IF NOT EXISTS idx_files_path ON commit_files(path);

CREATE TABLE IF NOT EXISTS commit_features (
  sha TEXT NOT NULL REFERENCES commits(sha),
  feature TEXT NOT NULL,
  PRIMARY KEY (sha, feature)
);

CREATE TABLE IF NOT EXISTS commit_impacts (
  id INTEGER PRIMARY KEY,
  sha TEXT NOT NULL REFERENCES commits(sha),
  kind TEXT NOT NULL,
  title TEXT,
  detail TEXT,
  features TEXT
);

CREATE TABLE IF NOT EXISTS commit_exposures (
  id INTEGER PRIMARY KEY,
  sha TEXT NOT NULL REFERENCES commits(sha),
  environment TEXT,
  collection TEXT,
  operations TEXT,
  condition_text TEXT,
  data_exposed TEXT,
  severity TEXT,
  introduced INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_monthly_scores (
  user_id INTEGER NOT NULL REFERENCES users(id),
  month TEXT NOT NULL,
  commit_count INTEGER,
  quality_score REAL,
  contribution_score REAL,
  contribution_raw REAL,
  skill_score REAL,
  ai_slop_score REAL,
  risk_score REAL,
  PRIMARY KEY (user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_features_sha ON commit_features(sha);
CREATE INDEX IF NOT EXISTS idx_impacts_sha ON commit_impacts(sha);
CREATE INDEX IF NOT EXISTS idx_exposures_sha ON commit_exposures(sha);

CREATE TABLE IF NOT EXISTS commit_credits (
  sha TEXT PRIMARY KEY REFERENCES commits(sha),
  loc_inserted INTEGER NOT NULL DEFAULT 0,
  loc_credited REAL NOT NULL DEFAULT 0,
  feature_importance REAL,
  excluded_reason TEXT,
  counts INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_feature_stats (
  user_id INTEGER NOT NULL REFERENCES users(id),
  feature TEXT NOT NULL,
  importance REAL,
  credited_loc REAL NOT NULL DEFAULT 0,
  excluded_loc REAL NOT NULL DEFAULT 0,
  commit_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature)
);

CREATE TABLE IF NOT EXISTS commit_env_rules (
  sha TEXT NOT NULL REFERENCES commits(sha),
  environment TEXT NOT NULL,
  snapshot_at TEXT,
  collections TEXT,
  open_allows INTEGER DEFAULT 0,
  missing_match INTEGER DEFAULT 0,
  tested INTEGER DEFAULT 0,
  PRIMARY KEY (sha, environment)
);

CREATE TABLE IF NOT EXISTS llm_reviews (
  id INTEGER PRIMARY KEY,
  sha TEXT NOT NULL REFERENCES commits(sha),
  path TEXT,
  start_line INTEGER,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  kind TEXT NOT NULL,
  confirm INTEGER,
  severity TEXT,
  categories TEXT,
  review_needed INTEGER,
  comment TEXT,
  rationale TEXT,
  created_at TEXT,
  UNIQUE (sha, path, start_line, model_id, prompt_version, kind)
);

CREATE INDEX IF NOT EXISTS idx_llm_reviews_sha ON llm_reviews(sha, kind);
`;

export function openDb() {
  ensureSqliteFlag();
  ensureDataDir();
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const db = new DatabaseSync(DB_PATH, { allowExtension: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  migrateColumns(db);
  let vecLoaded = false;
  if (typeof db.loadExtension === "function") {
    try {
      ensureLocalDeps(["sqlite-vec"]);
      const sqliteVec = localRequire()("sqlite-vec");
      db.loadExtension(sqliteVec.getLoadablePath());
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS commit_embeddings USING vec0(
          sha TEXT PRIMARY KEY,
          embedding float[${EMBED_DIM}]
        )
      `);
      vecLoaded = true;
    } catch (err) {
      console.error(`sqlite-vec unavailable (${err.message}); using blob cosine search`);
    }
  }
  db.vecLoaded = vecLoaded;
  return db;
}

function migrateColumns(db) {
  const add = (table, col, type) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  };
  add("commits", "ai_slop_score", "REAL");
  add("users", "quality_score", "REAL");
  add("users", "contribution_score", "REAL");
  add("users", "contribution_raw", "REAL");
  add("users", "contribution_rank", "INTEGER");
  add("users", "contribution_of", "INTEGER");
  add("users", "skill_score", "REAL");
  add("users", "ai_slop_score", "REAL");
  add("users", "credited_loc", "REAL");
  add("users", "excluded_loc", "REAL");
  add("users", "quality_models", "REAL");
  add("users", "quality_converters", "REAL");
  add("users", "quality_rules", "REAL");
  add("users", "quality_bugs", "REAL");
  add("users", "quality_slop", "REAL");
  add("users", "quality_findings", "REAL");
  add("users", "quality_remediation", "REAL");
  add("users", "quality_issues", "REAL");
  add("commits", "on_master", "INTEGER");
  add("commits", "on_release", "INTEGER");
  add("commits", "prod_landed_at", "TEXT");
  add("users", "issues_master", "INTEGER");
  add("users", "issues_release", "INTEGER");
  add("users", "rules_stg_gaps", "INTEGER");
  add("users", "rules_prod_gaps", "INTEGER");
  add("users", "untested_stg", "INTEGER");
  add("users", "quality_lint", "REAL");
  add("users", "quality_api", "REAL");
  add("users", "quality_ui", "REAL");
  add("user_monthly_scores", "contribution_raw", "REAL");
  add("commit_risks", "path", "TEXT");
  add("commit_risks", "start_line", "INTEGER");
  add("commit_risks", "end_line", "INTEGER");
  add("commit_risks", "evidence", "TEXT");
  add("commit_risks", "rule_id", "TEXT");
  add("commit_risks", "github_url", "TEXT");
  add("commit_risks", "via", "TEXT");
  add("commit_risks", "confirmed", "INTEGER");
  add("commit_risks", "llm_model", "TEXT");
  add("users", "quality_trend", "REAL");
  add("users", "quality_model", "REAL");
  add("users", "hazard_stg", "REAL");
  add("users", "hazard_prod", "REAL");
}

let cachedGithubWeb = undefined;

export function githubRepoWebUrl() {
  if (cachedGithubWeb !== undefined) return cachedGithubWeb;
  try {
    const raw = git(["remote", "get-url", "origin"]).trim();
    const m = raw.match(/github\.com[:/](.+?)(?:\.git)?$/i);
    cachedGithubWeb = m ? `https://github.com/${m[1].replace(/\.git$/, "")}` : "";
  } catch {
    cachedGithubWeb = "";
  }
  return cachedGithubWeb;
}

export function githubBlobUrl(sha, filePath, start, end) {
  const base = githubRepoWebUrl();
  if (!base || !sha || !filePath) return "";
  const enc = String(filePath)
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  let url = `${base}/blob/${sha}/${enc}`;
  if (start) {
    url += `#L${start}`;
    if (end && end !== start) url += `-L${end}`;
  }
  return url;
}

export function getOrCreateUser(db, { canonical_name, github_login, author_name, author_email }) {
  let row = db.prepare("SELECT * FROM users WHERE canonical_name = ?").get(canonical_name);
  if (!row) {
    const info = db
      .prepare("INSERT INTO users (canonical_name, github_login) VALUES (?, ?)")
      .run(canonical_name, github_login);
    row = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  } else if (github_login && !row.github_login) {
    db.prepare("UPDATE users SET github_login = ? WHERE id = ?").run(github_login, row.id);
    row.github_login = github_login;
  }
  db.prepare(
    `INSERT OR IGNORE INTO user_aliases (user_id, author_name, author_email) VALUES (?, ?, ?)`,
  ).run(row.id, author_name || null, author_email || null);
  return row;
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function isoNow() {
  return new Date().toISOString();
}

export function inDateRange(iso, from, to) {
  if (from && iso < from) return false;
  if (to) {
    const end = to.length <= 10 ? `${to}T23:59:59.999Z` : to;
    if (iso > end) return false;
  }
  return true;
}

export const DOMAINS = [
  { id: "inventory", re: /inventory|vehicle|auction|stock.?number/i },
  { id: "application", re: /application|loan/i },
  { id: "offers", re: /offers?/i },
  { id: "graybook", re: /graybook/i },
  { id: "expenses", re: /expense/i },
  { id: "freelo", re: /freelo/i },
  { id: "transporter", re: /transporter|logistics|shipment/i },
  { id: "payroll", re: /payroll|timesheet/i },
  { id: "leads", re: /leads?|prospect|contact/i },
  { id: "photos", re: /photos?|uploader/i },
  { id: "checkbook", re: /checkbook/i },
  { id: "repair", re: /repair/i },
  { id: "tasks", re: /tasks?/i },
  { id: "parts", re: /parts/i },
  { id: "banks", re: /banks?/i },
  { id: "invoices", re: /invoice/i },
  { id: "dashboard", re: /dashboard/i },
  { id: "performance", re: /performance|quota/i },
];

export function domainsForPaths(paths) {
  const hits = new Set();
  for (const p of paths) {
    for (const d of DOMAINS) {
      if (d.re.test(p)) hits.add(d.id);
    }
  }
  return [...hits];
}

export function isFeaturePath(p) {
  return (
    p.startsWith("web/app/") ||
    p.startsWith("services/api/") ||
    p.startsWith("services/functions/") ||
    p.startsWith("src/app/") ||
    p.startsWith("src/functions/") ||
    p.startsWith("src/views/") ||
    p.startsWith("src/hooks/") ||
    p.startsWith("src/core/") ||
    p.startsWith("src/components/") ||
    p.startsWith("src/contexts/") ||
    p.startsWith("frontend/") ||
    p.startsWith("functions/") ||
    p.startsWith("backend/")
  );
}

export function isModelsPath(p) {
  if (!(p.startsWith("packages/models/") || p.startsWith("models/"))) return false;
  return /\.(ts|tsx|js|jsx|mjs)$/.test(p);
}

export function isConverterPath(p) {
  return /converters\//.test(p) && isModelsPath(p);
}

export function isRulesPath(p) {
  return /firestore\.rules$|storage\.rules$/.test(p);
}

export function isSecretPath(p) {
  const base = path.basename(p).toLowerCase();
  if (base === ".env" || base.startsWith(".env.") || base.endsWith(".pem")) return true;
  if (base === "serviceaccount.json" || base === "firebase-admin.json") return true;
  if (base === "service.json" || base.includes("credentials")) return true;
  if (base.startsWith("cryptkey")) return true;
  return false;
}

export function isNoiseCommit(paths, subject) {
  const s = (subject || "").toLowerCase();
  if (/^merge\b/.test(s)) return true;
  if (/^(chore|style|docs|ci)(\(.+\))?:/.test(s)) return true;
  if (paths.length === 0) return true;
  const meaningful = paths.filter((p) => {
    const b = path.basename(p);
    if (b === "pnpm-lock.yaml" || b === "package-lock.json" || b === "yarn.lock") return false;
    if (b.endsWith(".md") && !p.includes("packages/models")) return false;
    if (b === ".DS_Store") return false;
    return true;
  });
  return meaningful.length === 0;
}

/** Style/theme/hook-only app edits are not shipped-security or missing-model holes. */
export function isStyleOrHookOnly(paths) {
  const feat = (paths || []).filter(isFeaturePath);
  if (!feat.length) return false;
  return feat.every(
    (p) =>
      /\.(scss|css|less|sass)$/.test(p) ||
      /\/(hooks|theme|themes|styles)\//.test(p) ||
      /\.stories\.[tj]sx?$/.test(p),
  );
}

export function featureSubject(subject) {
  return /\b(feat|feature|add|added|new|implement|introduce)\b/i.test(subject || "");
}

const TOKEN_STOP = new Set([
  "from", "with", "this", "that", "test", "spec", "index", "page", "view", "hook",
  "list", "item", "form", "data", "user", "users", "type", "types", "util", "utils",
  "component", "components", "context", "hooks", "src", "app", "api", "function",
  "functions", "package", "packages", "model", "models", "converter", "converters",
  "shared", "common", "helper", "helpers", "const", "constants", "enum", "enums",
]);

export function tokenizePath(p) {
  const base = path.basename(p, path.extname(p));
  return base
    .replace(/Converter$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 5 && !TOKEN_STOP.has(t));
}

export function float32Blob(arr) {
  return Buffer.from(Float32Array.from(arr).buffer);
}

export function blobToFloat32(buf) {
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function scoreFromRisks(risks, slop = 0) {
  const weight = risks.reduce((sum, r) => sum + weightForRisk(r), 0);
  const risk_score = Math.min(100, weight);
  const quality_score = Math.max(0, 100 - weight - 0.35 * (slop || 0));
  return { risk_score, quality_score };
}

function revListShas(rev) {
  try {
    return new Set(
      git(["rev-list", rev])
        .trim()
        .split("\n")
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function refreshBranchFlags(db) {
  const master = revListShas("origin/master");
  const release = revListShas("origin/release");
  const upd = db.prepare("UPDATE commits SET on_master = ?, on_release = ? WHERE sha = ?");
  const shas = db.prepare("SELECT sha FROM commits").all();
  withTx(db, () => {
    for (const { sha } of shas) {
      upd.run(master.has(sha) ? 1 : 0, release.has(sha) ? 1 : 0, sha);
    }
  });
}

export function refreshProdLanded(db) {
  let lines = [];
  try {
    lines = git(["log", "origin/release", "--first-parent", "--reverse", "--format=%H%x1f%cI"])
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch {
    return;
  }
  const upd = db.prepare(
    "UPDATE commits SET prod_landed_at = ? WHERE sha = ? AND (prod_landed_at IS NULL OR prod_landed_at > ?)",
  );
  let prev = null;
  withTx(db, () => {
    for (const line of lines) {
      const [sha, at] = line.split("\x1f");
      if (!sha || !at) continue;
      let arrived = [];
      try {
        arrived = git(["rev-list", sha, ...(prev ? [`^${prev}`] : [])])
          .trim()
          .split("\n")
          .filter(Boolean);
      } catch {
        arrived = [];
      }
      for (const s of arrived) upd.run(at, s, at);
      prev = sha;
    }
  });
}

export function recomputeUserScores(db) {
  const users = db.prepare("SELECT id FROM users").all();
  const commitStats = db.prepare(`
    SELECT
      COUNT(*) AS commit_count,
      MIN(authored_at) AS first_commit_at,
      MAX(authored_at) AS last_commit_at,
      AVG(COALESCE(risk_score, 0)) AS mean_risk
    FROM commits
    WHERE user_id = ? AND is_bot = 0
  `);
  const openSevere = db.prepare(`
    SELECT COUNT(*) AS n
    FROM commit_risks r
    JOIN commits c ON c.sha = r.sha
    WHERE c.user_id = ? AND c.is_bot = 0
      AND r.remediated = 0 AND r.severity IN ('high', 'critical')
  `);
  const update = db.prepare(`
    UPDATE users SET
      commit_count = ?,
      first_commit_at = ?,
      last_commit_at = ?,
      risk_score = ?
    WHERE id = ?
  `);
  withTx(db, () => {
    for (const { id } of users) {
      const s = commitStats.get(id);
      const severe = openSevere.get(id).n;
      const mean = s.mean_risk || 0;
      const risk = Math.min(100, mean * (1 + 0.15 * severe));
      update.run(s.commit_count, s.first_commit_at, s.last_commit_at, s.commit_count ? risk : 0, id);
    }
  });
}

export function refreshRiskyCommits(db) {
  db.exec("DELETE FROM user_risky_commits");
  db.exec(`
    INSERT INTO user_risky_commits (user_id, sha)
    SELECT DISTINCT c.user_id, c.sha
    FROM commits c
    WHERE c.is_bot = 0 AND c.user_id IS NOT NULL AND (
      COALESCE(c.risk_score, 0) >= ${RISKY_THRESHOLD}
      OR EXISTS (
        SELECT 1 FROM commit_risks r
        WHERE r.sha = c.sha AND r.severity IN ('high', 'critical')
      )
    )
  `);
}

export function printHelp(name, lines) {
  console.log(`Usage: node .cursor/skills/autodevelop-internal/cybersecurity/commit-risk-audit/scripts/${name} ${lines.join("\n       ")}`);
}
