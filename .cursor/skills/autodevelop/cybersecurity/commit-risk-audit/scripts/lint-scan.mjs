#!/usr/bin/env node
/**
 * Copyright (c) 2026 Devrecated
 */
/**
 * Line-aware scanners aligned with public ESLint / OWASP / AI-slop tools.
 * Sources: SOURCES.md. Deterministic — no LLM. Same diff in, same findings out.
 *
 * Context before flag: parent mounts, sibling validators, and same-expression
 * sanitizers are loaded at the commit SHA before a finding is written.
 */
import fs from "node:fs";
import path from "node:path";
import { git, githubBlobUrl, SKILL_DIR } from "./lib.mjs";

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_PATH =
  /(^|\/)(node_modules|dist|build|coverage|\.next|generated|pnpm-lock|package-lock|yarn\.lock)(\/|$)/;

let conventions;
export function loadConventions() {
  if (conventions) return conventions;
  const p = path.join(SKILL_DIR, "repo-conventions.json");
  conventions = fs.existsSync(p)
    ? JSON.parse(fs.readFileSync(p, "utf8"))
    : {};
  return conventions;
}

function isSource(p) {
  return SOURCE_EXT.test(p) && !SKIP_PATH.test(p);
}

function isTest(p) {
  return /(^|\/)(__tests__|tests?|spec)(\/|$)|[._-](test|spec)\.[tj]sx?$/.test(p);
}

function isRules(p) {
  return /\.rules$|firestore\.rules|storage\.rules/.test(p);
}

function isDts(p) {
  return /\.d\.ts$/.test(p);
}

function under(p, roots = []) {
  return (roots || []).some((r) => p === r || p.startsWith(`${r}/`));
}

function posix(p) {
  return String(p || "").replace(/\\/g, "/");
}

function finding(partial) {
  const start = partial.start_line || 0;
  const end = partial.end_line || start;
  return {
    category: partial.category,
    severity: partial.severity,
    title: partial.title,
    detail: partial.detail || "",
    path: partial.path || "",
    start_line: start,
    end_line: end,
    evidence: (partial.evidence || "").slice(0, 240),
    rule_id: partial.rule_id || "",
    github_url: githubBlobUrl(partial.sha, partial.path, start, end),
    via: partial.via || "",
  };
}

const LINE_RULES = [
  {
    id: "react/no-danger",
    category: "react",
    severity: "high",
    re: /dangerouslySetInnerHTML/,
    title: "dangerouslySetInnerHTML (XSS surface)",
    source: "eslint-plugin-react / OWASP XSS / appsec-baseline",
  },
  {
    id: "security/detect-eval",
    category: "security",
    severity: "critical",
    re: /\beval\s*\(|new Function\s*\(/,
    title: "eval / new Function",
    source: "eslint-plugin-security / appsec-baseline",
  },
  {
    id: "security/detect-child-process",
    category: "security",
    severity: "high",
    re: /\b(exec|execSync|spawn)\s*\(\s*[`'"]/,
    title: "Shell exec with string interpolation",
    source: "eslint-plugin-security / OWASP Node / appsec-baseline",
  },
  {
    id: "security/detect-sql-concat",
    category: "security",
    severity: "high",
    re: /(SELECT|INSERT|UPDATE|DELETE)\s+.+\+\s*|query\s*\(\s*[`'"].*\$\{/i,
    title: "SQL / query string concatenation",
    source: "OWASP Node cheat sheet",
  },
  {
    id: "express/cors-star",
    category: "api_auth",
    severity: "high",
    re: /origin\s*:\s*['"]\*['"]|cors\s*\(\s*\{[^}]*origin\s*:\s*true/i,
    title: "Permissive CORS origin",
    source: "OWASP / Express hardening 2026",
  },
  {
    id: "express/trust-proxy-true",
    category: "api_auth",
    severity: "medium",
    re: /trust\s*proxy['"]?\s*,\s*true/,
    title: "trust proxy set to true (IP spoofing)",
    source: "Express 5 hardening playbook",
  },
  {
    id: "express/jwt-no-algs",
    category: "api_auth",
    severity: "high",
    re: /jwt\.verify\s*\([^)]*\)(?![\s\S]{0,80}algorithms)/,
    title: "jwt.verify without algorithms allowlist",
    source: "Node.js auth best practices 2026",
  },
  {
    id: "react/no-innerhtml",
    category: "react",
    severity: "high",
    re: /\.innerHTML\s*=|document\.write\s*\(/,
    title: "innerHTML / document.write",
    source: "eslint-plugin-react / OWASP XSS / appsec-baseline",
  },
  {
    id: "react/no-array-index-key",
    category: "react",
    severity: "low",
    re: /key\s*=\s*\{\s*(index|i|idx)\s*\}/,
    title: "Array index used as React key",
    source: "eslint-plugin-react",
  },
  {
    id: "typescript/no-explicit-any",
    category: "lint",
    severity: "medium",
    re: /:\s*any\b|\bas any\b|as unknown as /,
    title: "Explicit any / double assertion",
    source: "@typescript-eslint/no-explicit-any / typescript-quality",
  },
  {
    id: "eslint/ban-ts-comment",
    category: "lint",
    severity: "medium",
    re: /@ts-ignore|@ts-nocheck|eslint-disable/,
    title: "Lint / typecheck suppression",
    source: "@typescript-eslint/ban-ts-comment",
  },
  {
    id: "quality/empty-catch",
    category: "quality",
    severity: "medium",
    re: /catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*)?\s*\}/,
    title: "Empty catch (swallowed error)",
    source: "aislop / deslop",
  },
  {
    id: "slop/ai-narrative-comment",
    category: "slop",
    severity: "medium",
    re: /^\s*(\/\/|\/\*|\*)\s*(This (function|component|method|hook|endpoint)|Here we |First,? we |Now we |Let's |Let us |Step \d+|TODO:\s*(implement|add|fix later)|FIXME:\s*(implement|later))/i,
    title: "AI-style narrative or stub comment",
    source: "aislop / vibecheck / deslop / check-ai-slop",
  },
  {
    id: "slop/section-divider",
    category: "slop",
    severity: "low",
    re: /^\s*\/\/\s*[=-]{6,}/,
    title: "Section-divider comment",
    source: "vibecheck / deslop",
  },
  {
    id: "slop/ai-attribution",
    category: "slop",
    severity: "high",
    re: /generated by (ai|chatgpt|claude|copilot|cursor)|co-authored-by:\s*(claude|chatgpt|copilot|cursor|gemini)|cursor ai/i,
    title: "AI tool attribution in source",
    source: "check-ai-slop",
  },
  {
    id: "security/localstorage-token",
    category: "security",
    severity: "high",
    re: /localStorage\.setItem\s*\(\s*['"`][^'"`]*(token|jwt|secret|password)/i,
    title: "Auth token written to localStorage (XSS-readable)",
    source: "OWASP / Node auth 2026 / appsec-baseline",
  },
  {
    id: "firestore/open-allow",
    category: "firestore_rules",
    severity: "critical",
    re: /allow\s+(read|write|get|list|create|update|delete|read, write)\s*:\s*if\s+true|\|\|\s*true/,
    title: "Open Firestore/Storage allow",
    source: "Firebase rules / firebase-security / OWASP access control",
  },
];

export function parseUnifiedDiff(text) {
  const files = [];
  let current = null;
  let newLine = 0;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      current = null;
      continue;
    }
    const plusFile = raw.match(/^\+\+\+ b\/(.+)$/);
    if (plusFile) {
      current = { path: plusFile[1], added: [] };
      files.push(current);
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      current.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith(" ")) {
      newLine += 1;
    }
  }
  return files;
}

function showDiff(sha, paths) {
  if (!paths.length) return "";
  try {
    return git(["show", "--format=", "--unified=0", sha, "--", ...paths]);
  } catch {
    return "";
  }
}

function showFile(sha, filePath) {
  try {
    return git(["show", `${sha}:${filePath}`]);
  } catch {
    return "";
  }
}

function sanitizerNames(conv) {
  return conv.sanitizers || ["DOMPurify", "sanitize"];
}

export function lineHasSanitizer(text, added, line, conv) {
  const names = sanitizerNames(conv);
  if (names.some((n) => text.includes(n))) return true;
  const nearby = (added || []).filter((a) => Math.abs(a.line - line) <= 4);
  return nearby.some((a) => names.some((n) => a.text.includes(n)));
}

function skipConsolePath(filePath, conv) {
  if (isDts(filePath) || isTest(filePath)) return true;
  const skips = conv.skipConsolePaths || ["createAuthMiddleware"];
  return skips.some((s) => filePath.includes(s));
}

function isKnownAuthClient(filePath, conv) {
  const roots = conv.knownAuthClients || [];
  return roots.some((r) => filePath === r || filePath.startsWith(`${r}/`) || filePath.includes(r));
}

function scanAddedLines(sha, filePath, added, conv) {
  const out = [];
  const skipConsole = skipConsolePath(filePath, conv);
  const skipAny = isDts(filePath);
  for (const { line, text } of added) {
    if (!skipConsole && /^\s*console\.(log|debug|info)\s*\(/.test(text) && !/eslint-disable/.test(text)) {
      out.push(
        finding({
          sha,
          path: filePath,
          start_line: line,
          category: "lint",
          severity: "low",
          title: "console.log left in production path",
          detail: "eslint no-console",
          evidence: text.trim(),
          rule_id: "no-console",
        }),
      );
    }
    for (const rule of LINE_RULES) {
      if (rule.id === "firestore/open-allow" && !isRules(filePath) && !/\.rules$/.test(filePath)) {
        if (!/allow\s+/.test(text)) continue;
      }
      if (rule.id === "typescript/no-explicit-any" && skipAny) continue;
      if (rule.id === "security/localstorage-token" && isKnownAuthClient(filePath, conv)) continue;
      if (!rule.re.test(text)) continue;
      if (
        (rule.id === "react/no-danger" || rule.id === "react/no-innerhtml") &&
        lineHasSanitizer(text, added, line, conv)
      ) {
        continue;
      }
      out.push(
        finding({
          sha,
          path: filePath,
          start_line: line,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          detail: rule.source,
          evidence: text.trim(),
          rule_id: rule.id,
        }),
      );
    }
  }
  return out;
}

function scanCommentDensity(sha, filePath, added) {
  if (added.length < 25) return [];
  const comments = added.filter((a) => /^\s*(\/\/|\/\*|\*)/.test(a.text) && !/eslint-disable|ts-ignore/.test(a.text));
  const narrative = comments.filter((a) =>
    /(This (function|component)|Here we |First,? we |Now we |Let's |Step \d)/i.test(a.text),
  );
  if (comments.length / added.length < 0.28 || narrative.length < 3) return [];
  const first = narrative[0] || comments[0];
  return [
    finding({
      sha,
      path: filePath,
      start_line: first.line,
      end_line: comments[comments.length - 1].line,
      category: "slop",
      severity: "high",
      title: "High density of AI-style comments vs business code",
      detail: `${comments.length} comment lines / ${added.length} added (${narrative.length} narrative)`,
      evidence: first.text.trim(),
      rule_id: "slop/comment-density",
    }),
  ];
}

function scanUiClutter(sha, filePath, added) {
  if (!/\.(tsx|jsx)$/.test(filePath)) return [];
  const out = [];
  const sxHard = added.filter(
    (a) =>
      /sx=\{\{|style=\{\{/.test(a.text) &&
      /#[0-9a-fA-F]{3,8}|rgb\(|\b\d+px\b/.test(a.text) &&
      !/theme\.palette|theme\.spacing|palette\./.test(a.text),
  );
  if (sxHard.length >= 12) {
    out.push(
      finding({
        sha,
        path: filePath,
        start_line: sxHard[0].line,
        end_line: sxHard[sxHard.length - 1].line,
        category: "ui",
        severity: "medium",
        title: "Inline style/sx clutter (hardcoded colors/spacing)",
        detail: `${sxHard.length} hardcoded style lines — prefer theme/tokens`,
        evidence: sxHard[0].text.trim(),
        rule_id: "ui/inline-style-soup",
      }),
    );
  }
  if (added.length >= 250) {
    out.push(
      finding({
        sha,
        path: filePath,
        start_line: added[0].line,
        end_line: added[added.length - 1].line,
        category: "ui",
        severity: "medium",
        title: "Oversized UI dump in one file",
        detail: `${added.length} added lines — extract components`,
        evidence: added[0].text.trim(),
        rule_id: "ui/oversized-component",
      }),
    );
  }
  return out;
}

function scanDeadOrRedundant(sha, filePath, added) {
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 4) {
      out.push(
        finding({
          sha,
          path: filePath,
          start_line: run[0].line,
          end_line: run[run.length - 1].line,
          category: "quality",
          severity: "low",
          title: "Commented-out code block left in",
          detail: `${run.length} consecutive commented code lines`,
          evidence: run[0].text.trim(),
          rule_id: "quality/commented-out-code",
        }),
      );
    }
    run = [];
  };
  for (const a of added) {
    if (/^\s*\/\/\s*(const|let|var|function|return|import|export|if|for|await)\b/.test(a.text)) run.push(a);
    else flush();
  }
  flush();
  const fnNames = added
    .map((a) => a.text.match(/(?:function|const)\s+([A-Z][A-Za-z0-9]+)\s*[=(]/))
    .filter(Boolean)
    .map((m) => m[1]);
  const seen = new Map();
  for (const n of fnNames) seen.set(n, (seen.get(n) || 0) + 1);
  for (const [name, n] of seen) {
    if (n < 2) continue;
    const hit = added.find((a) => a.text.includes(name));
    out.push(
      finding({
        sha,
        path: filePath,
        start_line: hit?.line || 0,
        category: "quality",
        severity: "medium",
        title: `Redundant helper '${name}' declared more than once in this diff`,
        detail: "Could be consolidated",
        evidence: hit?.text.trim() || name,
        rule_id: "quality/redundant-helper",
      }),
    );
  }
  return out;
}

function isPublicRoute(filePath, routePath, conv) {
  const hints = conv.publicRouteHints || [];
  const hay = `${filePath} ${routePath}`.toLowerCase();
  return hints.some((h) => hay.includes(String(h).toLowerCase()));
}

export function authNameRe(conv) {
  const names = conv.authMiddleware?.length
    ? conv.authMiddleware
    : [
        "adminAuthMiddleware",
        "baseAuthMiddleware",
        "clientAuthMiddleware",
        "verifyToken",
        "requireAuth",
        "createAuthMiddleware",
      ];
  return new RegExp(`\\b(${[...new Set(names)].join("|")})\\b`);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveImport(fromFile, spec) {
  if (!spec || !spec.startsWith(".")) return "";
  const dir = posix(fromFile).replace(/\/[^/]+$/, "");
  return posix(path.posix.normalize(`${dir}/${spec}`));
}

function stripIndex(p) {
  return posix(p).replace(/\/index\.[a-z]+$/i, "");
}

function importedAncestorIds(parentFile, leafPath, content) {
  const leaf = stripIndex(leafPath);
  const ids = [];
  const pairs = [
    ...content.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g),
    ...content.matchAll(/(\w+)\s*=\s*\(?(?:await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/g),
  ];
  for (const m of pairs) {
    const id = m[1];
    const resolved = resolveImport(parentFile, m[2]);
    if (!resolved) continue;
    if (leaf === resolved || leaf.startsWith(`${resolved}/`)) ids.push(id);
  }
  return [...new Set(ids)];
}

function authOnMountArgs(args, authRe) {
  return Boolean(args && authRe.test(args));
}

/**
 * Express often mounts auth on the parent:
 *   router.use("/admin", adminAuthMiddleware, admin)
 *   app.use("/api/v1/portal", portalRouter)
 * Leaf files that only call router.get(...) are still protected.
 * Walk parent index.ts and package entry files at the same SHA.
 */
export function ancestorAuthProtects(sha, filePath, conv) {
  const authRe = authNameRe(conv);
  const roots = [...(conv.apiRoots || ["services/api"]), ...(conv.functionsRoots || ["services/functions"])];
  const entries = conv.entryFiles || ["src/index.ts", "src/app.ts", "index.ts"];
  const seen = new Set();
  const checkFile = (candidate, childSeg) => {
    if (!candidate || seen.has(candidate)) return null;
    seen.add(candidate);
    const content = showFile(sha, candidate);
    if (!content) return null;
    const compact = content.replace(/\s+/g, " ");
    if (childSeg) {
      const mount = compact.match(
        new RegExp(`(?:router|app)\\.use\\(\\s*['"\`][^'"\`]*${escapeRe(childSeg)}['"\`]\\s*,\\s*([^)]*)\\)`),
      );
      if (mount && authOnMountArgs(mount[1], authRe)) {
        return { protected: true, via: `${candidate} ${childSeg}` };
      }
    }
    for (const id of importedAncestorIds(candidate, filePath, content)) {
      const useRe = new RegExp(`(?:router|app)\\.use\\(\\s*([^)]*\\b${escapeRe(id)}\\b[^)]*)\\)`, "g");
      let um;
      while ((um = useRe.exec(compact))) {
        if (authOnMountArgs(um[1], authRe)) return { protected: true, via: `${candidate} ${id}` };
      }
    }
    const globalUse = compact.match(/(?:router|app)\.use\(\s*([A-Za-z0-9_]+)\s*\)/g) || [];
    for (const g of globalUse) {
      if (authRe.test(g)) return { protected: true, via: `${candidate} global` };
    }
    return null;
  };

  let dir = posix(filePath).replace(/\/[^/]+$/, "");
  for (let i = 0; i < 12; i++) {
    const parent = dir.replace(/\/[^/]+$/, "");
    if (!parent || parent === dir) break;
    if (!roots.some((r) => dir === r || dir.startsWith(`${r}/`) || parent === r || parent.startsWith(`${r}/`))) break;
    const child = dir.slice(parent.length + 1);
    for (const name of ["index.ts", "index.js", "index.mjs", "index.tsx"]) {
      const hit = checkFile(`${parent}/${name}`, child);
      if (hit) return hit;
    }
    dir = parent;
  }
  for (const root of roots) {
    if (!under(filePath, [root]) && filePath !== root) continue;
    for (const e of entries) {
      const hit = checkFile(`${root}/${e}`, "");
      if (hit) return hit;
    }
  }
  return { protected: false, via: "" };
}

function validatorHints(conv) {
  return conv.validators || [
    "zod",
    "celebrate",
    "joi",
    "checkSchema",
    "express-validator",
    "validationResult",
    "safeParse",
  ];
}

export function fileHasValidation(content, conv) {
  if (!content) return false;
  if (/\b(z\.object|z\.string|z\.enum|celebrate\(|Joi\.|checkSchema|matchedData|validationResult|body\(|param\(|query\()\b/.test(content)) {
    return true;
  }
  const hints = validatorHints(conv);
  return hints.some((h) => content.includes(h));
}

function tryShowVariants(sha, base) {
  for (const ext of ["", ".ts", ".js", ".mjs", ".tsx", "/index.ts", "/index.js"]) {
    const content = showFile(sha, `${base}${ext}`);
    if (content) return { path: `${base}${ext}`, content };
  }
  return null;
}

export function resolveImportedValidators(sha, filePath, content, conv) {
  if (fileHasValidation(content, conv)) return { ok: true, via: filePath };
  const importedNames = [...content.matchAll(/import\s+\{([^}]+)\}/g)]
    .flatMap((m) => m[1].split(","))
    .map((s) => s.trim().split(/\s+as\s+/).pop())
    .filter(Boolean);
  if (importedNames.some((n) => /Validat|Schema|schema/.test(n))) {
    return { ok: true, via: "imported validator name" };
  }
  const specs = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of specs) {
    if (!spec.startsWith(".")) continue;
    if (!/validat|schema|zod|joi/i.test(spec)) continue;
    const resolved = resolveImport(filePath, spec);
    const hit = tryShowVariants(sha, resolved);
    if (hit && fileHasValidation(hit.content, conv)) return { ok: true, via: hit.path };
  }
  const dir = posix(filePath).replace(/\/[^/]+$/, "");
  const stem = path.basename(filePath, path.extname(filePath));
  for (const name of [`${stem}Validation`, `${stem}.validation`, `${stem}.schema`, `${stem}Schema`]) {
    const hit = tryShowVariants(sha, `${dir}/${name}`);
    if (hit && fileHasValidation(hit.content, conv)) return { ok: true, via: hit.path };
  }
  const parentIndex = tryShowVariants(sha, `${dir}/index`);
  if (parentIndex && fileHasValidation(parentIndex.content, conv)) {
    const handler = stem.replace(/[^A-Za-z0-9]/g, "");
    if (new RegExp(`${handler}Validation|${stem}Validation`, "i").test(parentIndex.content)) {
      return { ok: true, via: parentIndex.path };
    }
  }
  return { ok: false, via: "" };
}

export function routeFamily(filePath, routePath) {
  const segs = posix(filePath).split("/");
  const routesIdx = segs.lastIndexOf("routes");
  const mount = routesIdx >= 0 ? segs.slice(routesIdx + 1, routesIdx + 3).join("/") : segs.slice(-2).join("/");
  const first = String(routePath || "/").split("/").filter(Boolean)[0] || "";
  return `${mount}:${first || "_root"}`;
}

function scanApiRoutes(sha, filePath, content, conv) {
  const api = under(filePath, conv.apiRoots || ["services/api"]);
  const fns = under(filePath, conv.functionsRoots || ["services/functions", "functions"]);
  if (!api && !fns) return [];
  const out = [];
  const authRe = authNameRe(conv);
  const inherited = ancestorAuthProtects(sha, filePath, conv);
  const hasAuth = authRe.test(content) || inherited.protected;
  const routeRe = /(?:router|app)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const lines = content.split("\n");
  const unprotected = [];
  let m;
  while ((m = routeRe.exec(content))) {
    const routePath = m[2];
    if (isPublicRoute(filePath, routePath, conv)) continue;
    const before = content.slice(0, m.index);
    const line = before.split("\n").length;
    const snippet = lines[line - 1] || m[0];
    const window = content.slice(Math.max(0, m.index - 200), m.index + 280);
    const inlineAuth = authRe.test(window);
    if (!hasAuth && !inlineAuth) {
      unprotected.push({ method: m[1], routePath, line, snippet });
    }
  }
  if (unprotected.length) {
    const byFamily = new Map();
    for (const r of unprotected) {
      const fam = routeFamily(filePath, r.routePath);
      const list = byFamily.get(fam) || [];
      list.push(r);
      byFamily.set(fam, list);
    }
    for (const [fam, list] of byFamily) {
      const first = list[0];
      out.push(
        finding({
          sha,
          path: filePath,
          start_line: first.line,
          category: "api_auth",
          severity: "high",
          title:
            list.length === 1
              ? `Unprotected ${first.method.toUpperCase()} ${first.routePath}`
              : `Unprotected ${fam} routes (${list.length} endpoints)`,
          detail: inherited.via
            ? `Inherited context checked (${inherited.via}); no auth on this mount`
            : "No auth middleware in file, beside the route, or on a parent mount (deny-by-default)",
          evidence: first.snippet.trim(),
          rule_id: "express/unprotected-route",
          via: inherited.via,
        }),
      );
    }
  }
  if (fns && /onRequest\s*\(/.test(content) && !authRe.test(content) && !/context\.auth|request\.auth/.test(content)) {
    if (!inherited.protected) {
      const idx = content.indexOf("onRequest");
      const line = content.slice(0, idx).split("\n").length;
      out.push(
        finding({
          sha,
          path: filePath,
          start_line: line,
          category: "api_auth",
          severity: "high",
          title: "Firebase onRequest without auth check",
          detail: "HTTPS functions should verify the caller (firebase-security: Admin SDK still needs a role check)",
          evidence: (content.split("\n")[line - 1] || "").trim(),
          rule_id: "functions/onrequest-unauth",
          via: inherited.via,
        }),
      );
    }
  }
  if ((api || fns) && /req\.(body|query|params)/.test(content)) {
    const validated = resolveImportedValidators(sha, filePath, content, conv);
    if (!validated.ok) {
      const idx = content.search(/req\.(body|query|params)/);
      const line = content.slice(0, idx).split("\n").length;
      out.push(
        finding({
          sha,
          path: filePath,
          start_line: line,
          category: "api_auth",
          severity: "medium",
          title: "Request input used without schema validation",
          detail: "Validate at the boundary (Zod / Joi / celebrate / express-validator) — appsec-baseline",
          evidence: (content.split("\n")[line - 1] || "").trim(),
          rule_id: "express/unvalidated-input",
        }),
      );
    }
  }
  return out;
}

export function convertersAtSha(sha, conv) {
  const roots = conv?.modelsPaths || ["packages/models", "packages/models/converters"];
  const out = [];
  for (const root of roots) {
    try {
      const listed = git(["ls-tree", "-r", "--name-only", sha, "--", root]);
      for (const p of listed.split("\n")) {
        if (p && /converters\//.test(p)) out.push(p);
      }
    } catch {
      /* missing path at this SHA */
    }
  }
  return [...new Set(out)];
}

export function converterExistsForModel(sha, modelPath, conv) {
  const stem = path.basename(modelPath, path.extname(modelPath)).toLowerCase();
  if (!stem || /index|types|constants/.test(stem)) return true;
  const convs = convertersAtSha(sha, conv);
  return convs.some((c) => {
    const cs = path.basename(c, path.extname(c)).toLowerCase().replace(/converter$/, "");
    return cs === stem || cs.includes(stem.slice(0, 8)) || stem.includes(cs.slice(0, 8));
  });
}

export function scanCommit(sha, fileRows) {
  const conv = loadConventions();
  const paths = (fileRows || []).map((f) => f.path).filter((p) => isSource(p) || isRules(p));
  if (!paths.length) return [];
  const diff = showDiff(sha, paths);
  const parsed = parseUnifiedDiff(diff);
  const findings = [];
  const seen = new Set();
  const push = (f) => {
    const key =
      f.rule_id === "express/unprotected-route"
        ? `${f.rule_id}|${f.path}|${f.title}`
        : `${f.category}|${f.rule_id}|${f.path}|${f.start_line}|${f.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  for (const file of parsed) {
    if (!isSource(file.path) && !isRules(file.path)) continue;
    if (isDts(file.path)) continue;
    for (const f of scanAddedLines(sha, file.path, file.added, conv)) push(f);
    for (const f of scanCommentDensity(sha, file.path, file.added)) push(f);
    for (const f of scanUiClutter(sha, file.path, file.added)) push(f);
    for (const f of scanDeadOrRedundant(sha, file.path, file.added)) push(f);
  }

  const routeFiles = paths.filter(
    (p) =>
      under(p, conv.apiRoots || ["services/api"]) ||
      under(p, conv.functionsRoots || ["services/functions", "functions"]),
  );
  for (const p of routeFiles) {
    const content = showFile(sha, p);
    if (!content) continue;
    for (const f of scanApiRoutes(sha, p, content, conv)) push(f);
  }

  return findings;
}
