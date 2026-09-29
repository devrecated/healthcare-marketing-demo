#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
import { createRequire } from "node:module";
import path from "node:path";
import {
  DATA_DIR,
  EMBED_DIM,
  blobToFloat32,
  ensureLocalDeps,
  ensureSqliteFlag,
  float32Blob,
  openDb,
  parseArgs,
  printHelp,
} from "./lib.mjs";

async function loadExtractor() {
  ensureLocalDeps(["@xenova/transformers"]);
  process.env.TRANSFORMERS_CACHE = path.join(DATA_DIR, "models");
  const require = createRequire(path.join(DATA_DIR, "package.json"));
  const { pipeline } = require("@xenova/transformers");
  return pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
}

function embedText(extractor, text) {
  return extractor(text.slice(0, 8000), { pooling: "mean", normalize: true });
}

function commitText(commit, files, risks) {
  const paths = files.map((f) => f.path).slice(0, 40).join(" ");
  const titles = risks.map((r) => `${r.category}: ${r.title}`).join("; ");
  return [commit.subject, commit.body, paths, titles].filter(Boolean).join("\n");
}

async function main() {
  ensureSqliteFlag();
  const args = parseArgs();
  if (args.help) {
    printHelp("embed.mjs", ["[--rescore] [--limit N]  Embed commits missing vectors (local MiniLM, 384-d)"]);
    return;
  }
  const db = openDb();
  const sql = args.rescore
    ? "SELECT * FROM commits ORDER BY authored_at ASC"
    : `
      SELECT c.* FROM commits c
      LEFT JOIN commit_embedding_blobs b ON b.sha = c.sha
      WHERE b.sha IS NULL
      ORDER BY c.authored_at ASC
    `;
  const commits = args.limit
    ? db.prepare(`${sql} LIMIT ?`).all(Number(args.limit))
    : db.prepare(sql).all();
  if (commits.length === 0) {
    console.log("No commits to embed");
    db.close();
    return;
  }
  console.error(`Embedding ${commits.length} commits (first run downloads the ONNX model)`);
  const extractor = await loadExtractor();
  const filesFor = db.prepare("SELECT path FROM commit_files WHERE sha = ?");
  const risksFor = db.prepare("SELECT category, title FROM commit_risks WHERE sha = ?");
  const upsertBlob = db.prepare(
    "INSERT OR REPLACE INTO commit_embedding_blobs (sha, dim, vector) VALUES (?, ?, ?)",
  );
  const insertVec = db.vecLoaded
    ? db.prepare("INSERT OR REPLACE INTO commit_embeddings (sha, embedding) VALUES (?, ?)")
    : null;

  let n = 0;
  for (const c of commits) {
    const text = commitText(c, filesFor.all(c.sha), risksFor.all(c.sha));
    const out = await embedText(extractor, text || c.sha);
    const arr = Array.from(out.data);
    if (arr.length !== EMBED_DIM) {
      throw new Error(`Expected dim ${EMBED_DIM}, got ${arr.length}`);
    }
    const blob = float32Blob(arr);
    upsertBlob.run(c.sha, EMBED_DIM, blob);
    if (insertVec) {
      try {
        insertVec.run(c.sha, JSON.stringify(arr));
      } catch {
        insertVec.run(c.sha, new Float32Array(arr));
      }
    }
    n++;
    if (n % 100 === 0) console.error(`  ${n}/${commits.length}`);
  }
  void blobToFloat32;
  db.close();
  console.log(`Embedded ${n} commits`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
