import { DATASET_BOUNDS, REGIONS, ROWS, type RegionName } from "@/lib/insurance-dataset"

// A small ordinary-least-squares linear regression fit in the browser on the
// embedded Medical Cost dataset. ~1,338 rows x 9 features solved via the normal
// equations (XtX)^-1 XtY with Gaussian elimination. Runs once, memoized.

export type RiskInput = {
  age: number
  sex: "male" | "female"
  bmi: number
  children: number
  smoker: boolean
  region: RegionName
}

// Design vector. northeast (region 0) is the dropped baseline category.
// [intercept, age, bmi, children, sexMale, smoker, nw, se, sw]
const FEATURE_COUNT = 9

function encodeRaw(
  age: number,
  bmi: number,
  children: number,
  sexMale: number,
  smoker: number,
  regionIndex: number,
): number[] {
  return [
    1,
    age,
    bmi,
    children,
    sexMale,
    smoker,
    regionIndex === 1 ? 1 : 0,
    regionIndex === 2 ? 1 : 0,
    regionIndex === 3 ? 1 : 0,
  ]
}

function encode(input: RiskInput): number[] {
  return encodeRaw(
    input.age,
    input.bmi,
    input.children,
    input.sex === "male" ? 1 : 0,
    input.smoker ? 1 : 0,
    REGIONS.indexOf(input.region),
  )
}

// Solve A x = b for a small symmetric positive-definite system via Gauss-Jordan
// elimination with partial pivoting. A is n x n (row-major), b is length n.
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (pivot !== col) {
      const tmp = m[pivot]
      m[pivot] = m[col]
      m[col] = tmp
    }
    const diag = m[col][col] || 1e-8
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = m[r][col] / diag
      if (factor === 0) continue
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c]
    }
  }

  // After full elimination every off-diagonal is ~0, so x_i = m[i][n] / m[i][i].
  return m.map((row, i) => row[n] / (row[i] || 1e-8))
}

export type FittedModel = {
  coefficients: number[]
  meanFeatures: number[]
  r2: number
  sortedCharges: number[]
}

function fit(): FittedModel {
  const n = ROWS.length
  const xtx: number[][] = Array.from({ length: FEATURE_COUNT }, () =>
    new Array<number>(FEATURE_COUNT).fill(0),
  )
  const xty = new Array<number>(FEATURE_COUNT).fill(0)
  const sumFeatures = new Array<number>(FEATURE_COUNT).fill(0)
  let sumY = 0

  const charges: number[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const row = ROWS[i]
    const y = row[6]
    charges[i] = y
    sumY += y
    const x = encodeRaw(row[0], row[2], row[3], row[1], row[4], row[5])
    for (let a = 0; a < FEATURE_COUNT; a++) {
      sumFeatures[a] += x[a]
      xty[a] += x[a] * y
      for (let b = a; b < FEATURE_COUNT; b++) {
        xtx[a][b] += x[a] * x[b]
      }
    }
  }
  // Mirror the symmetric lower triangle.
  for (let a = 0; a < FEATURE_COUNT; a++) {
    for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a]
  }

  const coefficients = solveLinearSystem(xtx, xty)
  const meanFeatures = sumFeatures.map((s) => s / n)
  const meanY = sumY / n

  // R^2 on the training data (goodness of fit indicator).
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const row = ROWS[i]
    const x = encodeRaw(row[0], row[2], row[3], row[1], row[4], row[5])
    let pred = 0
    for (let a = 0; a < FEATURE_COUNT; a++) pred += coefficients[a] * x[a]
    ssRes += (charges[i] - pred) ** 2
    ssTot += (charges[i] - meanY) ** 2
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot

  const sortedCharges = [...charges].sort((a, b) => a - b)

  return { coefficients, meanFeatures, r2, sortedCharges }
}

let cached: FittedModel | null = null

export function getModel(): FittedModel {
  if (!cached) cached = fit()
  return cached
}

const CHARGE_MIN = DATASET_BOUNDS.charges[0]
const CHARGE_MAX = DATASET_BOUNDS.charges[1]

export function rawPredict(input: RiskInput): number {
  const { coefficients } = getModel()
  const x = encode(input)
  let pred = 0
  for (let a = 0; a < FEATURE_COUNT; a++) pred += coefficients[a] * x[a]
  return pred
}

/** Estimated annual total medical cost before insurance, clamped to a sane range. */
export function predictCharges(input: RiskInput): number {
  const pred = rawPredict(input)
  return Math.min(Math.max(pred, 0), CHARGE_MAX * 1.15)
}

/**
 * Risk score 1-100: percentile rank of the predicted cost against the actual
 * charge distribution in the dataset.
 */
export function riskScore(input: RiskInput): number {
  const { sortedCharges } = getModel()
  const value = rawPredict(input)
  const n = sortedCharges.length
  // Binary search for the count of charges <= value.
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedCharges[mid] <= value) lo = mid + 1
    else hi = mid
  }
  const percentile = lo / n
  return Math.min(100, Math.max(1, Math.round(percentile * 100)))
}

export type FactorContribution = {
  key: "age" | "bmi" | "children" | "sex" | "smoker" | "region"
  label: string
  amount: number
}

/**
 * Signed dollar contribution of each factor relative to the average person in
 * the dataset. base + sum(contributions) === rawPredict(input).
 */
export function factorContributions(input: RiskInput): {
  base: number
  contributions: FactorContribution[]
} {
  const { coefficients, meanFeatures } = getModel()
  const x = encode(input)

  let base = 0
  for (let a = 0; a < FEATURE_COUNT; a++) base += coefficients[a] * meanFeatures[a]

  const delta = (i: number) => coefficients[i] * (x[i] - meanFeatures[i])
  const regionDelta = delta(6) + delta(7) + delta(8)

  const contributions: FactorContribution[] = [
    { key: "age", label: "Age", amount: delta(1) },
    { key: "bmi", label: "BMI", amount: delta(2) },
    { key: "children", label: "Children", amount: delta(3) },
    { key: "sex", label: "Sex", amount: delta(4) },
    { key: "smoker", label: "Smoking", amount: delta(5) },
    { key: "region", label: "Region", amount: regionDelta },
  ]

  return { base, contributions }
}

/** Sweep one continuous factor across its range for the interactive line chart. */
export function sweep(
  input: RiskInput,
  key: "age" | "bmi",
  steps = 48,
): { value: number; cost: number }[] {
  const [min, max] = key === "age" ? DATASET_BOUNDS.age : DATASET_BOUNDS.bmi
  const out: { value: number; cost: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const value = min + ((max - min) * i) / steps
    out.push({ value, cost: predictCharges({ ...input, [key]: value }) })
  }
  return out
}

export { CHARGE_MIN, CHARGE_MAX }
