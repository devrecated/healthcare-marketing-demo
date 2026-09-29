import type {
  ReconciliationEntry,
  ReconciliationSession,
  Supply,
  VarianceReason,
} from "@/lib/types"

export function dayStamp(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function utcDay(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

export function daysBetween(from: string, to: string) {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000)
}

export function varianceOf(entry: ReconciliationEntry) {
  if (entry.counted == null) return null
  return entry.counted - entry.expected
}

export function withinTolerance(expected: number, counted: number) {
  const delta = counted - expected
  if (Math.abs(delta) <= 1) return true
  if (expected === 0) return counted === 0
  return Math.abs(delta) / expected <= 0.02
}

export function needsExplanation(entry: ReconciliationEntry, supply: Supply) {
  if (entry.counted == null) return false
  const delta = entry.counted - entry.expected
  if (delta === 0) return false
  if (supply.controlled) return true
  return !withinTolerance(entry.expected, entry.counted)
}

export function entryResolved(entry: ReconciliationEntry, supply: Supply) {
  if (entry.counted == null) return false
  const delta = entry.counted - entry.expected
  if (delta === 0) return true
  if (supply.controlled) {
    return Boolean(entry.reason && (entry.witness?.trim().length ?? 0) >= 2)
  }
  if (withinTolerance(entry.expected, entry.counted)) return true
  return Boolean(entry.reason)
}

export function dueSupplies(supplies: Supply[], today = dayStamp()) {
  return supplies.filter((supply) => {
    if (supply.controlled) return true
    if (!supply.lastReconciledAt) return true
    return daysBetween(supply.lastReconciledAt, today) >= 7
  })
}

export function canSignOff(session: ReconciliationSession, supplies: Supply[]) {
  const blocks: string[] = []
  for (const entry of session.entries) {
    const supply = supplies.find((item) => item.id === entry.supplyId)
    if (!supply) continue
    if (entry.counted == null) {
      blocks.push(`${supply.name} has not been counted`)
      continue
    }
    if (!entryResolved(entry, supply)) {
      blocks.push(
        supply.controlled
          ? `${supply.name} needs a reason and a witness`
          : `${supply.name} needs a variance reason`,
      )
    }
  }
  return blocks
}

export function sessionSummary(session: ReconciliationSession, supplies: Supply[]) {
  let counted = 0
  let matched = 0
  let variances = 0
  let unresolvedControlled = 0
  let shrinkageValue = 0
  let writeOffValue = 0

  for (const entry of session.entries) {
    if (entry.counted == null) continue
    const supply = supplies.find((item) => item.id === entry.supplyId)
    if (!supply) continue
    counted += 1
    const delta = entry.counted - entry.expected
    const value = delta * supply.unitCost
    const matchedLine =
      delta === 0 || (!supply.controlled && withinTolerance(entry.expected, entry.counted))
    if (matchedLine) matched += 1
    else variances += 1
    if (supply.controlled && !entryResolved(entry, supply)) unresolvedControlled += 1
    if (delta < 0) shrinkageValue += Math.abs(value)
    if (
      delta < 0 &&
      (entry.reason === "expiry" || entry.reason === "wastage")
    ) {
      writeOffValue += Math.abs(value)
    }
  }

  return { counted, matched, variances, unresolvedControlled, shrinkageValue, writeOffValue }
}

export function reasonLabel(reason: VarianceReason) {
  const labels: Record<VarianceReason, string> = {
    miscount: "Miscount",
    wastage: "Wastage",
    expiry: "Expired lot",
    shrinkage: "Shrinkage",
    found: "Found stock",
    "unrecorded-use": "Unrecorded use",
  }
  return labels[reason]
}
