/**
 * Copyright (c) 2026 Devrecated
 *
 * Local JS inference for commit review.
 * CodeReviewer: ONNX via @huggingface/transformers
 * CodeAstra: Mistral-7B-Instruct GGUF via node-llama-cpp (Metal on Apple Silicon)
 * Diffs never leave this machine.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { DATA_DIR, MODELS_DIR, ensureLocalDeps } from "./lib.mjs";

export const PROMPT_VERSION = "v1";
export const CODEREVIEWER_ID = "tomasmcm/microsoft-codereviewer-onnx";
export const CODEASTRA_PROMPT_ID = "codeastra-prompt/mistral-7b-instruct-v0.2-q5_k_m";
export const MISTRAL_GGUF = "mistral-7b-instruct-v0.2.Q5_K_M.gguf";
export const CODEASTRA_MERGED = "codeastra-merged.Q5_K_M.gguf";
export const CODEASTRA_LORA = "codeastra-lora.gguf";

const CONFIRM_SCHEMA = {
  type: "object",
  properties: {
    confirm: { type: "boolean" },
    severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
    categories: { type: "array", items: { type: "string" } },
    rationale: { type: "string" },
  },
  required: ["confirm", "severity", "rationale"],
};

let reviewerPipe;
let llamaSession;
let llamaInstance;
let llamaModelId = "";

export function mistralPath() {
  return path.join(MODELS_DIR, MISTRAL_GGUF);
}

export function codeastraMergedPath() {
  return path.join(MODELS_DIR, CODEASTRA_MERGED);
}

export function codeastraLoraPath() {
  return path.join(MODELS_DIR, CODEASTRA_LORA);
}

export const SKIP_MODEL_ID = "context/none";

export function modelsPresent() {
  return {
    reviewer: true,
    codeastra:
      fs.existsSync(codeastraMergedPath()) || fs.existsSync(mistralPath()),
  };
}

/** Skip stubs from --context-only / missing GGUF. Never use as report Why. */
export function isSkipLlmRationale(rationale) {
  const text = String(rationale || "");
  return (
    /GGUF not installed/i.test(text) ||
    /model not invoked/i.test(text) ||
    /--context-only/i.test(text)
  );
}

export function isSkipLlmReview(row) {
  if (!row) return true;
  if (row.model_id === SKIP_MODEL_ID) return true;
  return isSkipLlmRationale(row.rationale);
}

export function requiresConfirmation(finding) {
  const cat = finding.category || "";
  const rule = finding.rule_id || "";
  if (cat === "api_auth" || cat === "security" || cat === "secrets") return true;
  if (cat === "react" && /no-danger|no-innerhtml|innerhtml/i.test(rule)) return true;
  if (/detect-eval|child-process|jwt-no-alg|localstorage-token/i.test(rule)) return true;
  return false;
}

export function inheritedAuthReject(finding) {
  const via = String(finding.via || "");
  if (!via) return false;
  if (/AuthMiddleware|requireAuth|requireAdmin|verifyToken|createAuthMiddleware|authenticate/i.test(via)) {
    return true;
  }
  if (/app\.use|router\.use/i.test(via) && /auth|verify/i.test(via)) return true;
  // ancestorAuthProtects writes "<parentFile> <childSeg|id|global>"
  if (
    (finding.rule_id === "express/unprotected-route" || finding.category === "api_auth") &&
    /\.(ts|js|mjs|tsx)(\s|$)/.test(via)
  ) {
    return true;
  }
  return false;
}

export function sanitizedXssReject(finding) {
  const rule = finding.rule_id || "";
  if (!/no-danger|no-innerhtml|innerhtml/i.test(rule)) return false;
  const blob = `${finding.via || ""} ${finding.evidence || ""} ${finding.detail || ""}`;
  return /DOMPurify|sanitize|sanitizer/i.test(blob);
}

export function formatDiffForReviewer(unifiedDiff) {
  const lines = [];
  for (const line of String(unifiedDiff || "").split("\n")) {
    if (/^(diff |index |--- |\+\+\+ |@@ )/.test(line)) continue;
    if (line.startsWith("+")) lines.push(`[ADD] ${line.slice(1)}`);
    else if (line.startsWith("-")) lines.push(`[DEL] ${line.slice(1)}`);
    else if (line.startsWith(" ")) lines.push(`[KEEP] ${line.slice(1)}`);
  }
  return lines.join("\n").slice(0, 3500);
}

export function reviewNeededFromComment(comment) {
  const t = String(comment || "").replace(/\s+/g, " ").trim();
  if (t.length < 12) return 0;
  if (/^(lgtm|looks good|no (issues?|comments?|problems?)|n\/a|none|ok\.?)$/i.test(t)) return 0;
  return 1;
}

function localRequire() {
  return createRequire(path.join(DATA_DIR, "package.json"));
}

export async function loadCodeReviewer() {
  if (reviewerPipe) return reviewerPipe;
  ensureLocalDeps(["@huggingface/transformers"]);
  const hf = localRequire()("@huggingface/transformers");
  const { pipeline, env } = hf;
  if (env) {
    env.cacheDir = path.join(MODELS_DIR, "hf-cache");
    env.allowRemoteModels = true;
  }
  reviewerPipe = await pipeline("text2text-generation", CODEREVIEWER_ID, {
    cache_dir: path.join(MODELS_DIR, "hf-cache"),
    dtype: "fp32",
  });
  return reviewerPipe;
}

export async function reviewDiff(unifiedDiff) {
  const input = formatDiffForReviewer(unifiedDiff);
  if (!input.trim()) {
    return { review_needed: 0, comment: "", model_id: CODEREVIEWER_ID };
  }
  const pipe = await loadCodeReviewer();
  const out = await pipe(input, { max_new_tokens: 96, temperature: 0 });
  const comment = Array.isArray(out) ? out[0]?.generated_text || "" : out?.generated_text || String(out || "");
  return {
    review_needed: reviewNeededFromComment(comment),
    comment: String(comment).trim().slice(0, 800),
    model_id: CODEREVIEWER_ID,
  };
}

function confirmFromContext(finding) {
  if (inheritedAuthReject(finding)) {
    return {
      confirm: false,
      severity: finding.severity || "high",
      categories: [finding.category || "api_auth"],
      rationale: `Inherited authentication via ${finding.via}. Parent mount already requires auth — not an unprotected route.`,
      model_id: "context/inherited-auth",
      via_context: true,
    };
  }
  if (sanitizedXssReject(finding)) {
    return {
      confirm: false,
      severity: finding.severity || "high",
      categories: [finding.category || "react"],
      rationale: "HTML assignment is sanitized (DOMPurify or configured sanitizer) — not a confirmed XSS hole.",
      model_id: "context/sanitizer",
      via_context: true,
    };
  }
  return null;
}

function buildConfirmPrompt(finding) {
  return [
    "You are CodeAstra, a vulnerability detector for JavaScript/TypeScript and Express.",
    "Decide if this git-history finding is a REAL security defect.",
    "If a parent Express app.use / router.use already authenticates the mount, confirm=false.",
    "If HTML is passed through DOMPurify or another sanitizer, confirm=false for XSS.",
    "If jwt.verify sets algorithms, confirm=false.",
    "Be conservative: only confirm=true when the snippet itself is exploitable.",
    "",
    `Parent/sibling context (via): ${finding.via || "none"}`,
    `category: ${finding.category || ""}`,
    `severity: ${finding.severity || ""}`,
    `title: ${finding.title || ""}`,
    `path: ${finding.path || ""}:${finding.start_line || ""}`,
    `rule_id: ${finding.rule_id || ""}`,
    `evidence: ${String(finding.evidence || "").slice(0, 400)}`,
    `detail: ${String(finding.detail || "").slice(0, 400)}`,
    "",
    "Return JSON with confirm, severity, categories, rationale.",
  ].join("\n");
}

export async function loadCodeAstra() {
  if (llamaSession && llamaInstance) {
    return { session: llamaSession, model_id: llamaModelId, llama: llamaInstance };
  }
  const merged = codeastraMergedPath();
  const base = mistralPath();
  const modelPath = fs.existsSync(merged) ? merged : base;
  if (!fs.existsSync(modelPath)) {
    throw new Error(
      `CodeAstra GGUF missing. Run: pnpm audit:commits:models\nExpected ${modelPath}`,
    );
  }
  ensureLocalDeps(["node-llama-cpp"]);
  const llamaEntry = path.join(DATA_DIR, "node_modules", "node-llama-cpp", "dist", "index.js");
  const mod = await import(pathToFileURL(llamaEntry).href);
  const getLlama = mod.getLlama;
  const LlamaChatSession = mod.LlamaChatSession;
  llamaInstance = await getLlama();
  const model = await llamaInstance.loadModel({ modelPath });
  if (fs.existsSync(codeastraLoraPath()) && typeof model.loadLora === "function") {
    await model.loadLora({ filePath: codeastraLoraPath() });
  }
  const context = await model.createContext({ contextSize: 4096 });
  llamaSession = new LlamaChatSession({ contextSequence: context.getSequence() });
  llamaModelId = fs.existsSync(merged) ? "codeastra-merged/q5_k_m" : CODEASTRA_PROMPT_ID;
  return { session: llamaSession, model_id: llamaModelId, llama: llamaInstance };
}

export async function confirmFinding(finding, opts = {}) {
  const ctx = confirmFromContext(finding);
  if (ctx) return ctx;
  if (opts.contextOnly || !modelsPresent().codeastra) {
    return {
      confirm: null,
      skipped: true,
      severity: finding.severity || "high",
      categories: [finding.category || "security"],
      rationale: modelsPresent().codeastra
        ? "No inherited-auth or sanitizer context; model not invoked (--context-only)."
        : "No inherited-auth or sanitizer context; CodeAstra GGUF not installed.",
      model_id: "context/none",
      via_context: false,
    };
  }
  const { session, model_id, llama } = await loadCodeAstra();
  const prompt = buildConfirmPrompt(finding);
  const grammar = await llama.createGrammarForJsonSchema(CONFIRM_SCHEMA);
  const raw = await session.prompt(prompt, {
    temperature: 0,
    seed: 1,
    maxTokens: 256,
    grammar,
  });
  let parsed;
  try {
    parsed = JSON.parse(String(raw).trim());
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { confirm: false, severity: finding.severity, rationale: String(raw).slice(0, 240) };
  }
  return {
    confirm: Boolean(parsed.confirm),
    severity: parsed.severity || finding.severity || "high",
    categories: Array.isArray(parsed.categories) ? parsed.categories : [finding.category],
    rationale: String(parsed.rationale || "").slice(0, 800),
    model_id,
    via_context: false,
  };
}

export async function disposeModels() {
  reviewerPipe = null;
  llamaSession = null;
  llamaInstance = null;
  llamaModelId = "";
}
