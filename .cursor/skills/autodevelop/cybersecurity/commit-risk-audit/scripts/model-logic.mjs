/**
 * Copyright (c) 2026 Devrecated
 */
import path from "node:path";
import { git, isConverterPath, isModelsPath } from "./lib.mjs";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function domainOf(p) {
  const rel = p.replace(/^packages\/models\//, "").replace(/^models\//, "");
  return rel.split("/")[0] || "";
}

function showAt(sha, rel) {
  try {
    return git(["show", `${sha}:${rel}`]);
  } catch {
    return "";
  }
}

function scoreModelContent(content, filePath, converterContent, otherDomains) {
  if (!content || content.trim().length < 20) return 8;
  let s = 35;
  if (/export\s+(type|interface|class|enum|const)\b/.test(content)) s += 18;
  if (/from ['"][^'"]*models/.test(content) || /from ['"]\.\.\//.test(content)) {
    const imports = [...content.matchAll(/from ['"](?:[^'"]*models\/|\.\.\/)([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
    const cross = [...new Set(imports)].filter(
      (d) => d && d !== domainOf(filePath) && !["converters", "utils", "db", "server", "constants"].includes(d),
    );
    if (cross.length >= 1) s += 22;
    if (cross.length >= 2) s += 10;
    if (cross.some((d) => otherDomains.has(d))) s += 8;
  }
  const anys = (content.match(/:\s*any\b|\bas any\b/g) || []).length;
  s -= Math.min(28, anys * 5);
  if (/Record<string,\s*any>|index signature/.test(content)) s -= 8;
  if (converterContent) {
    s += 12;
    if (/toFirestore/.test(converterContent) && /fromFirestore/.test(converterContent)) s += 10;
    const mapped =
      /safeNumber|safeDate|Number\(|toDate\(|\|\|/.test(converterContent) && converterContent.length > 180;
    if (mapped) s += 8;
    else if (/return\s+\{\s*\.\.\.data/.test(converterContent) || /as \w+/.test(converterContent)) s -= 12;
  } else {
    s -= 22;
  }
  return clamp(s, 0, 100);
}

function scoreConverterContent(content) {
  if (!content || content.trim().length < 20) return 5;
  let s = 30;
  if (/from ['"].*models|from ['"]\.\.\//.test(content)) s += 20;
  if (/toFirestore/.test(content) && /fromFirestore/.test(content)) s += 20;
  if (/FirestoreDataConverter/.test(content)) s += 8;
  const anys = (content.match(/:\s*any\b|\bas any\b/g) || []).length;
  s -= Math.min(24, anys * 4);
  if (/return\s+\{\s*\.\.\.data/.test(content) && content.length < 220) s -= 15;
  if (/safeNumber|safeDate|mapField|toDate/.test(content)) s += 12;
  return clamp(s, 0, 100);
}

export function assessModelsDesign(db, userId) {
  const rows = db
    .prepare(
      `
      SELECT c.sha, f.path, f.status
      FROM commit_files f
      JOIN commits c ON c.sha = f.sha
      WHERE c.user_id = ? AND c.is_bot = 0
    `,
    )
    .all(userId)
    .filter((r) => isModelsPath(r.path));
  if (rows.length === 0) {
    const featureN = db
      .prepare(
        `
        SELECT COUNT(DISTINCT c.sha) AS n
        FROM commits c
        JOIN commit_files f ON f.sha = c.sha
        WHERE c.user_id = ? AND c.is_bot = 0
          AND (f.path LIKE 'web/app/%' OR f.path LIKE 'frontend/%' OR f.path LIKE 'src/views/%'
               OR f.path LIKE 'services/%' OR f.path LIKE 'functions/%')
      `,
      )
      .get(userId).n;
    return { models: featureN > 0 ? 8 : 50, converters: featureN > 0 ? 8 : 50, nModels: 0, nConverters: 0 };
  }

  const latest = new Map();
  for (const r of rows) latest.set(r.path, r.sha);
  const converterByDomain = new Map();
  for (const [p, sha] of latest) {
    if (!isConverterPath(p)) continue;
    converterByDomain.set(domainOf(p), { path: p, sha, content: showAt(sha, p) });
  }
  const otherDomains = new Set(
    [...latest.keys()].filter((p) => !isConverterPath(p)).map(domainOf),
  );

  const modelScores = [];
  const converterScores = [];
  for (const [p, sha] of latest) {
    const content = showAt(sha, p);
    if (isConverterPath(p)) {
      converterScores.push(scoreConverterContent(content));
      continue;
    }
    const domain = domainOf(p);
    const conv =
      converterByDomain.get(domain) ||
      [...converterByDomain.values()].find((c) =>
        path.basename(c.path).toLowerCase().includes(path.basename(p, path.extname(p)).toLowerCase().slice(0, 8)),
      );
    modelScores.push(scoreModelContent(content, p, conv?.content || "", otherDomains));
  }

  const models = modelScores.length
    ? modelScores.reduce((a, b) => a + b, 0) / modelScores.length
    : 8;
  const converters = converterScores.length
    ? converterScores.reduce((a, b) => a + b, 0) / converterScores.length
    : modelScores.length
      ? 12
      : 8;
  return {
    models: clamp(models, 0, 100),
    converters: clamp(converters, 0, 100),
    nModels: modelScores.length,
    nConverters: converterScores.length,
  };
}
