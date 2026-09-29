#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
/**
 * Download local review weights into .cursor/local/commit-risk-audit/models/
 * (gitignored). Scoring stays JavaScript; this is one-time weight prep.
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { DATA_DIR, MODELS_DIR, ensureDataDir, ensureLocalDeps, parseArgs, printHelp } from "./lib.mjs";
import { CODEREVIEWER_ID, MISTRAL_GGUF, loadCodeReviewer, mistralPath } from "./model-runtime.mjs";

const MISTRAL_URL =
  "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q5_K_M.gguf";

function ensureModelsDir() {
  ensureDataDir();
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  fs.mkdirSync(path.join(MODELS_DIR, "hf-cache"), { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.part`;
    const start = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0;
    const headers = {
      "User-Agent": "commit-risk-audit/1.0",
      Accept: "*/*",
    };
    if (start > 0) headers.Range = `bytes=${start}-`;
    const out = fs.createWriteStream(tmp, { flags: start ? "a" : "w" });
    const get = (target, hops = 0) => {
      if (hops > 5) {
        reject(new Error(`Too many redirects for ${url}`));
        return;
      }
      https
        .get(target, { headers }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            get(res.headers.location, hops + 1);
            return;
          }
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            reject(new Error(`HTTP ${res.statusCode} for ${target}`));
            res.resume();
            return;
          }
          const total = Number(res.headers["content-length"] || 0) + start;
          let got = start;
          let last = 0;
          res.on("data", (chunk) => {
            got += chunk.length;
            if (total && got - last > 25 * 1024 * 1024) {
              last = got;
              const pct = ((100 * got) / total).toFixed(1);
              console.error(`  ${path.basename(dest)}  ${(got / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB  ${pct}%`);
            }
          });
          res.pipe(out);
          out.on("finish", () => {
            out.close();
            fs.renameSync(tmp, dest);
            resolve();
          });
        })
        .on("error", reject);
    };
    out.on("error", reject);
    get(url);
  });
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp("models-setup.mjs", [
      "[--skip-gguf]   Only warm the CodeReviewer ONNX cache",
      "[--skip-onnx]   Only download the Mistral GGUF for CodeAstra prompts",
    ]);
    return;
  }
  ensureModelsDir();
  ensureLocalDeps(["@huggingface/transformers", "node-llama-cpp"]);

  if (!args["skip-gguf"]) {
    const dest = mistralPath();
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1e9) {
      console.log(`GGUF already present: ${dest}`);
    } else {
      console.log(`Downloading ${MISTRAL_GGUF} (~5.1 GB) to ${MODELS_DIR}`);
      console.log("CodeAstra PEFT adapter has no official GGUF; Mistral-Instruct + CodeAstra prompt is the JS runtime.");
      console.log(`Drop ${path.join(MODELS_DIR, "codeastra-merged.Q5_K_M.gguf")} later to use a merged adapter.`);
      await download(MISTRAL_URL, dest);
      console.log(`Wrote ${dest}`);
    }
  }

  if (!args["skip-onnx"]) {
    console.log(`Warming CodeReviewer ONNX (${CODEREVIEWER_ID})…`);
    try {
      await loadCodeReviewer();
      console.log("CodeReviewer ready.");
    } catch (err) {
      console.error(`CodeReviewer warm-up failed: ${err.message}`);
      console.error("llm-review will retry on first use.");
    }
  }

  const note = path.join(DATA_DIR, "models", "README.txt");
  fs.writeFileSync(
    note,
    [
      "Local weights for commit-risk-audit. Gitignored.",
      `CodeReviewer ONNX: Hugging Face cache under hf-cache/ (${CODEREVIEWER_ID})`,
      `CodeAstra runtime: ${MISTRAL_GGUF} (Mistral-7B-Instruct-v0.2 Q5_K_M) + CodeAstra prompt`,
      "Optional override: codeastra-merged.Q5_K_M.gguf or codeastra-lora.gguf",
      "",
    ].join("\n"),
  );
  console.log("Models setup finished.");
}

const invoked = process.argv[1] && /models-setup\.mjs$/.test(process.argv[1]);
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
