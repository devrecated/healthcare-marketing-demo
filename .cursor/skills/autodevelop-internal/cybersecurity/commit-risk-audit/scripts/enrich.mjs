#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { enrichUser, relativizeContributions } from "./analyze.mjs";
import { ensureSqliteFlag, openDb, parseArgs, printHelp } from "./lib.mjs";

function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("enrich.mjs", [
      "[--user <name>]           Feature map, impacts, exposures, slop, monthly scores",
      "[--relativize-only]       Recompute all-time credited LOC vs peers (excludes slop / no-models)",
    ]);
    return;
  }
  const db = openDb();
  if (args["relativize-only"]) {
    relativizeContributions(db);
    const rows = db
      .prepare(
        `SELECT u.canonical_name, u.contribution_score, u.contribution_rank, u.contribution_of, u.commit_count, u.credited_loc, u.excluded_loc
         FROM users u
         WHERE EXISTS (SELECT 1 FROM commits c WHERE c.user_id = u.id AND c.is_bot = 0)
         ORDER BY u.contribution_rank ASC`,
      )
      .all();
    for (const r of rows) {
      console.log(
        `${String(r.contribution_rank).padStart(2)}/${r.contribution_of}  ${Number(r.contribution_score).toFixed(1).padStart(6)}  cred ${Number(r.credited_loc || 0).toFixed(0).padStart(7)}  excl ${Number(r.excluded_loc || 0).toFixed(0).padStart(7)}  ${String(r.commit_count).padStart(5)}  ${r.canonical_name}`,
      );
    }
    db.close();
    return;
  }
  let users;
  if (args.user) {
    const q = `%${args.user}%`;
    users = db
      .prepare(
        `SELECT id, canonical_name FROM users
         WHERE canonical_name LIKE ? OR IFNULL(github_login,'') LIKE ?`,
      )
      .all(q, q);
  } else {
    users = db.prepare("SELECT id, canonical_name FROM users WHERE commit_count > 0").all();
  }
  for (const u of users) {
    const out = enrichUser(db, u.id);
    console.log(
      `${u.canonical_name}: quality ${out.qualityAvg.toFixed(1)}  contrib ${out.contrib.toFixed(1)} (rank ${out.rank}/${out.of})  skill ${out.skill.toFixed(1)}  slop ${out.slopAvg.toFixed(1)}  months ${out.months}`,
    );
  }
  relativizeContributions(db);
  db.close();
}

main();
