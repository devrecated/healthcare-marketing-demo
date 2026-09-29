#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  SKILL_DIR,
  ensureSqliteFlag,
  git,
  isoNow,
  openDb,
  parseArgs,
  printHelp,
  sha256,
} from "./lib.mjs";

const loadRuleConventions = () => {
  const p = path.join(SKILL_DIR, "repo-conventions.json");
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, "utf8"));
};

const RULE_FILES = (() => {
  const conv = loadRuleConventions();
  if (Array.isArray(conv.rulesFiles) && conv.rulesFiles.length) return conv.rulesFiles;
  const staging = conv.firebase?.staging || "staging";
  const production = conv.firebase?.production || "production";
  return [
    { environment: "staging", rules_type: "firestore", rel: `firebase/${staging}/firestore.rules` },
    { environment: "production", rules_type: "firestore", rel: `firebase/${production}/firestore.rules` },
    { environment: "staging", rules_type: "storage", rel: `firebase/${staging}/storage.rules` },
    { environment: "production", rules_type: "storage", rel: `firebase/${production}/storage.rules` },
  ];
})();

function insertSnapshot(db, row) {
  db.prepare(
    `
    INSERT OR IGNORE INTO rules_snapshots
      (environment, rules_type, source, sha, captured_at, content_hash, content, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    row.environment,
    row.rules_type,
    row.source,
    row.sha || "",
    row.captured_at,
    row.content_hash,
    row.content,
    row.notes || null,
  );
}

function ingestGitHistory(db) {
  let n = 0;
  for (const spec of RULE_FILES) {
    let shas = [];
    try {
      const out = git(["log", "--follow", "--format=%H%x1f%aI", "--", spec.rel]);
      shas = out
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [sha, at] = line.split("\x1f");
          return { sha, at };
        });
    } catch {
      shas = [];
    }
    if (shas.length === 0) {
      if (spec.rules_type === "storage") {
        insertSnapshot(db, {
          environment: spec.environment,
          rules_type: spec.rules_type,
          source: "git",
          sha: "",
          captured_at: isoNow(),
          content_hash: sha256(""),
          content: "",
          notes: `${spec.rel} has no git history (storage.rules is gitignored)`,
        });
      }
      continue;
    }
    for (const { sha, at } of shas) {
      let content = "";
      try {
        content = git(["show", `${sha}:${spec.rel}`]);
      } catch {
        continue;
      }
      insertSnapshot(db, {
        environment: spec.environment,
        rules_type: spec.rules_type,
        source: "git",
        sha,
        captured_at: at || isoNow(),
        content_hash: sha256(content),
        content,
        notes: null,
      });
      n++;
    }
  }
  return n;
}

function ingestOnDisk(db) {
  let n = 0;
  for (const spec of RULE_FILES) {
    const abs = path.join(REPO_ROOT, spec.rel);
    if (!fs.existsSync(abs)) continue;
    const content = fs.readFileSync(abs, "utf8");
    insertSnapshot(db, {
      environment: spec.environment,
      rules_type: spec.rules_type,
      source: "pull",
      sha: "",
      captured_at: isoNow(),
      content_hash: sha256(content),
      content,
      notes: "on-disk file",
    });
    n++;
  }
  return n;
}

function pullCurrent(env) {
  const script = env === "staging" ? "rules:stg" : "rules:prod";
  console.error(`Pulling current ${env} rules via pnpm ${script}`);
  execFileSync("pnpm", ["run", script], { cwd: REPO_ROOT, stdio: "inherit" });
}

async function ingestApiHistory(db, env) {
  const conv = loadRuleConventions();
  const project =
    env === "staging"
      ? conv.firebase?.staging || "staging"
      : conv.firebase?.production || "production";
  const saRel = `firebase/${project}/firebase-admin.json`;
  const saPath = path.join(REPO_ROOT, saRel);
  if (!fs.existsSync(saPath)) {
    insertSnapshot(db, {
      environment: env,
      rules_type: "storage",
      source: "api",
      sha: "",
      captured_at: isoNow(),
      content_hash: sha256("missing-sa"),
      content: "",
      notes: `No service account at ${saRel}; cannot list historical rulesets`,
    });
    return 0;
  }
  try {
    const { GoogleAuth } = await import("google-auth-library");
    const auth = new GoogleAuth({
      keyFile: saPath,
      scopes: ["https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/cloud-platform"],
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    const res = await fetch(
      `https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,
      { headers: { Authorization: `Bearer ${token.token}` } },
    );
    if (!res.ok) {
      const text = await res.text();
      insertSnapshot(db, {
        environment: env,
        rules_type: "storage",
        source: "api",
        sha: "",
        captured_at: isoNow(),
        content_hash: sha256(text.slice(0, 200)),
        content: "",
        notes: `rulesets.list failed: ${res.status} ${text.slice(0, 300)}`,
      });
      return 0;
    }
    const data = await res.json();
    let n = 0;
    for (const rs of data.rulesets || []) {
      const name = rs.name;
      const detail = await fetch(`https://firebaserules.googleapis.com/v1/${name}`, {
        headers: { Authorization: `Bearer ${token.token}` },
      });
      if (!detail.ok) continue;
      const body = await detail.json();
      const source = (body.source?.files || []).map((f) => f.content || "").join("\n");
      const kind = /storage/i.test(JSON.stringify(body.source?.files?.[0]?.name || ""))
        ? "storage"
        : "firestore";
      insertSnapshot(db, {
        environment: env,
        rules_type: kind,
        source: "api",
        sha: "",
        captured_at: rs.createTime || isoNow(),
        content_hash: sha256(source),
        content: source,
        notes: name,
      });
      n++;
    }
    return n;
  } catch (err) {
    insertSnapshot(db, {
      environment: env,
      rules_type: "storage",
      source: "api",
      sha: "",
      captured_at: isoNow(),
      content_hash: sha256(String(err.message)),
      content: "",
      notes: `API gap: ${err.message}`,
    });
    return 0;
  }
}

async function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("rules-sync.mjs", [
      "[--pull] [--stg|--prod]  Git history + on-disk; optional pnpm rules pull + API list",
    ]);
    return;
  }
  const db = openDb();
  const gitN = ingestGitHistory(db);
  if (args.pull) {
    if (args.stg || (!args.stg && !args.prod)) pullCurrent("staging");
    if (args.prod || (!args.stg && !args.prod)) pullCurrent("production");
  }
  const diskN = ingestOnDisk(db);
  let apiN = 0;
  if (args.stg || (!args.stg && !args.prod && args.pull)) {
    apiN += await ingestApiHistory(db, "staging");
  }
  if (args.prod || (!args.stg && !args.prod && args.pull)) {
    apiN += await ingestApiHistory(db, "production");
  }
  const total = db.prepare("SELECT COUNT(*) AS n FROM rules_snapshots").get().n;
  db.close();
  console.log(`Rules sync: ${gitN} git snapshots, ${diskN} on-disk, ${apiN} api; ${total} rows total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
