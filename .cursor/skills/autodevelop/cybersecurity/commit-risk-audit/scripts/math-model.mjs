/**
 * Copyright (c) 2026 Devrecated
 *
 * Deterministic statistical scoring. No I/O. Same events → same numbers.
 * Intensity is an exponential kernel over finding times; hygiene is a
 * survival map of the closed-form hazard integral.
 */
export const HALF_LIFE_DAYS = 90;
export const PROD_HAZARD_WEIGHT = 1.15;
export const EB_N0 = 12;
export const CONTRIB_ALPHA = 1;
export const TREND_WINDOW_DAYS = 30;

export const EVENT_WEIGHT = {
  critical: 4,
  high: 2,
  medium: 1,
  low: 0.4,
};

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return (b - a) / 86_400_000;
}

export function eventWeight(severity) {
  return EVENT_WEIGHT[severity] || 1;
}

function decayK(halfLife = HALF_LIFE_DAYS) {
  return Math.LN2 / halfLife;
}

/** λ(t) = Σ w_i exp(-ln2 · (t − t_i) / h) for t_i ≤ t */
export function intensityAt(events, t, halfLife = HALF_LIFE_DAYS) {
  const k = decayK(halfLife);
  let lam = 0;
  for (const e of events) {
    if (e.t <= t) lam += (e.w || 0) * Math.exp(-k * (t - e.t));
  }
  return lam;
}

/**
 * H(T) = ∫_0^T λ(t) dt = Σ w_i (h / ln2) (1 − exp(-k (T − t_i))) for t_i ≤ T
 */
export function hazardIntegral(events, T, halfLife = HALF_LIFE_DAYS) {
  const k = decayK(halfLife);
  const scale = halfLife / Math.LN2;
  let H = 0;
  for (const e of events) {
    if (e.t <= T) H += (e.w || 0) * scale * (1 - Math.exp(-k * (T - e.t)));
  }
  return H;
}

/** Analytic dλ/dt on the kernel (always ≤ 0 between jumps). Prefer trendScore. */
export function intensityDerivative(events, t, halfLife = HALF_LIFE_DAYS) {
  const k = decayK(halfLife);
  let d = 0;
  for (const e of events) {
    if (e.t <= t) d += -k * (e.w || 0) * Math.exp(-k * (t - e.t));
  }
  return d;
}

/**
 * 30-day finite difference of λ. Positive raw delta = more defect intensity now.
 * quality_trend is −100…100: negative means defects accelerating.
 */
export function trendScore(events, tNow, halfLife = HALF_LIFE_DAYS, window = TREND_WINDOW_DAYS) {
  const delta = intensityAt(events, tNow, halfLife) - intensityAt(events, tNow - window, halfLife);
  return clamp(-100 * Math.tanh(delta / 2), -100, 100);
}

export function issueHygieneFromHazard(Hstg, Hprod) {
  return clamp(100 * Math.exp(-(Hstg || 0) - PROD_HAZARD_WEIGHT * (Hprod || 0)), 0, 100);
}

export function anscombe(n) {
  return 2 * Math.sqrt((Number(n) || 0) + 3 / 8);
}

/** Poisson-count hygiene: n=0 → 100, larger n → lower. */
export function countHygiene(n) {
  const delta = anscombe(n) - anscombe(0);
  return clamp(100 * Math.exp(-0.18 * delta), 0, 100);
}

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mad(xs, med = median(xs)) {
  if (!xs.length) return 0;
  return median(xs.map((x) => Math.abs(x - med)));
}

export function robustZ(x, xs) {
  const med = median(xs);
  const m = mad(xs, med);
  const denom = 1.4826 * (m > 1e-12 ? m : 1e-9);
  return (x - med) / denom;
}

export function logisticFromZ(z) {
  return 100 / (1 + Math.exp(-0.5 * z));
}

export function empiricalBayes(raw, mu, n, n0 = EB_N0) {
  const nn = Number(n) || 0;
  const w = nn / (nn + n0);
  return mu + w * (raw - mu);
}

/** contribution_i = 100 · (1+L_i)^α / max_j (1+L_j)^α */
export function softmaxLogContribution(locs, alpha = CONTRIB_ALPHA) {
  const vals = locs.map((L) => (1 + Math.max(0, Number(L) || 0)) ** alpha);
  const max = Math.max(...vals, 1e-12);
  return vals.map((v) => (100 * v) / max);
}

export function skillFromQuality(quality, openHazard, remediations = 0) {
  const tail = Math.min(28, 8 * (openHazard || 0));
  const bonus = Math.min(12, 0.4 * (remediations || 0));
  return clamp((quality || 0) + bonus - tail, 0, 100);
}

export function riskFromHazard(Hopen) {
  return clamp(100 * (1 - Math.exp(-(Hopen || 0))), 0, 100);
}

export function combineComponentZ(components, weights, peerByKey) {
  let z = 0;
  let wsum = 0;
  for (const [key, w] of Object.entries(weights)) {
    if (w == null || !peerByKey[key]) continue;
    z += w * robustZ(components[key] ?? 0, peerByKey[key]);
    wsum += w;
  }
  if (!wsum) return 50;
  return logisticFromZ(z);
}

export function toEvents(rows, originIso, nowIso) {
  const origin = originIso || rows[0]?.authored_at || nowIso;
  const now = nowIso || new Date().toISOString();
  const T = Math.max(0, daysBetween(origin, now));
  const events = rows.map((r) => ({
    t: Math.max(0, daysBetween(origin, r.authored_at)),
    w: eventWeight(r.severity) * (r.on_release ? 1.15 : 1),
    category: r.category,
    on_master: r.on_master,
    on_release: r.on_release,
  }));
  return { events, T, origin, now };
}

export function splitEnvEvents(rows, originIso) {
  const origin = originIso || rows[0]?.authored_at;
  const stg = [];
  const prod = [];
  for (const r of rows) {
    const t = Math.max(0, daysBetween(origin, r.authored_at));
    const w = eventWeight(r.severity);
    if (r.on_master) stg.push({ t, w });
    if (r.on_release) prod.push({ t, w });
  }
  return { stg, prod, origin };
}
