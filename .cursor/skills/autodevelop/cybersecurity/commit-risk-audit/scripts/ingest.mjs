#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import {
  ensureSqliteFlag,
  refreshBranchFlags,
  refreshProdLanded,
  getOrCreateUser,
  git,
  isBotAuthor,
  isoNow,
  loadAliases,
  openDb,
  parseArgs,
  printHelp,
  resolveIdentity,
  withTx,
} from "./lib.mjs";

function parseFileLine(line, files) {
  if (!line.trim()) return;
  const tab = line.indexOf("\t");
  if (tab === -1) return;
  const status = line.slice(0, tab).trim();
  const rest = line.slice(tab + 1);
  if (status.startsWith("R") || status.startsWith("C")) {
    const [from, to] = rest.split("\t");
    files.push({ path: to || from, status: status[0] });
  } else {
    files.push({ path: rest, status: status[0] || "M" });
  }
}

function parseNameStatusLog(text) {
  const commits = [];
  const chunks = text.split("---AUTODEVELOP-COMMIT---\n");
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const endAt = chunk.indexOf("---AUTODEVELOP-END-MSG---\n");
    if (endAt === -1) continue;
    const header = chunk.slice(0, endAt);
    const filesBlock = chunk.slice(endAt + "---AUTODEVELOP-END-MSG---\n".length);
    const lines = header.split("\n");
    if (lines.length < 9) continue;
    const files = [];
    for (const line of filesBlock.split("\n")) parseFileLine(line, files);
    commits.push({
      sha: lines[0],
      author_name: lines[1],
      author_email: lines[2],
      authored_at: lines[3],
      committed_at: lines[6],
      parent_shas: lines[7] || "",
      subject: lines[8] || "",
      body: lines.slice(9).join("\n").replace(/\n$/, ""),
      files,
    });
  }
  return commits;
}

function parseShortstat(text) {
  const stats = new Map();
  let sha = null;
  for (const line of text.split("\n")) {
    if (/^[0-9a-f]{40}$/.test(line.trim())) {
      sha = line.trim();
      continue;
    }
    const m = line.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/,
    );
    if (m && sha) {
      stats.set(sha, {
        files_changed: Number(m[1]),
        insertions: Number(m[2] || 0),
        deletions: Number(m[3] || 0),
      });
    }
  }
  return stats;
}

function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("ingest.mjs", [
      "[--rev <ref>]  Ingest one ref (default: origin/master then origin/release)",
    ]);
    return;
  }
  const revs = args.rev && args.rev !== true ? [args.rev] : ["origin/master", "origin/release"];
  const aliases = loadAliases();
  const db = openDb();
  let added = 0;
  let seenOnRev = 0;
  for (const rev of revs) {
    try {
      git(["rev-parse", "--verify", rev]);
    } catch {
      console.error(`skip missing ${rev}`);
      continue;
    }
    console.error(`Ingesting commits from ${rev}`);
    const n = ingestRev(db, rev, aliases);
    added += n.added;
    seenOnRev += n.seen;
  }
  refreshBranchFlags(db);
  refreshProdLanded(db);
  const total = db.prepare("SELECT COUNT(*) AS n FROM commits").get().n;
  const onM = db.prepare("SELECT COUNT(*) AS n FROM commits WHERE on_master = 1").get().n;
  const onR = db.prepare("SELECT COUNT(*) AS n FROM commits WHERE on_release = 1").get().n;
  db.close();
  console.log(`Ingested ${added} new commits (${seenOnRev} walked); ${total} in DB; on master ${onM}; on release ${onR}`);
}

function ingestRev(db, rev, aliases) {
  const format =
    "---AUTODEVELOP-COMMIT---%n%H%n%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%P%n%s%n%b%n---AUTODEVELOP-END-MSG---";
  const nameStatus = git(["log", rev, `--format=${format}`, "--name-status"]);
  const shortstat = git(["log", rev, "--format=%H", "--shortstat"]);
  const commits = parseNameStatusLog(nameStatus);
  const stats = parseShortstat(shortstat);
  const existing = new Set(db.prepare("SELECT sha FROM commits").all().map((r) => r.sha));
  const insertCommit = db.prepare(`
    INSERT INTO commits (
      sha, user_id, author_name, author_email, authored_at, committed_at,
      subject, body, files_changed, insertions, deletions, is_bot, parent_shas, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFile = db.prepare("INSERT OR REPLACE INTO commit_files (sha, path, status) VALUES (?, ?, ?)");

  let added = 0;
  withTx(db, () => {
    for (const c of commits) {
      if (existing.has(c.sha)) continue;
      const bot = isBotAuthor(c.author_name, c.author_email, aliases);
      const ident = resolveIdentity(c.author_name, c.author_email, aliases);
      const user = getOrCreateUser(db, {
        ...ident,
        author_name: c.author_name,
        author_email: c.author_email,
      });
      const st = stats.get(c.sha) || {
        files_changed: c.files.length,
        insertions: 0,
        deletions: 0,
      };
      insertCommit.run(
        c.sha,
        user.id,
        c.author_name,
        c.author_email,
        c.authored_at,
        c.committed_at,
        c.subject,
        c.body,
        st.files_changed,
        st.insertions,
        st.deletions,
        bot ? 1 : 0,
        c.parent_shas,
        isoNow(),
      );
      for (const f of c.files) {
        if (!f.path) continue;
        insertFile.run(c.sha, f.path, f.status);
      }
      existing.add(c.sha);
      added++;
    }
  });
  return { added, seen: commits.length };
}

main();
