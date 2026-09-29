import { isLowStock } from "@/lib/money"
import { dayStamp, daysBetween } from "@/lib/reconciliation"
import type { Supply, SurgeryCase } from "@/lib/types"

export function scheduledDemand(surgeries: SurgeryCase[]) {
  const demand = new Map<string, { quantity: number; cases: string[] }>()
  for (const surgery of surgeries) {
    if (surgery.status === "completed") continue
    for (const line of surgery.materials) {
      if (!line.supplyId) continue
      const current = demand.get(line.supplyId) ?? { quantity: 0, cases: [] }
      current.quantity += line.quantity
      if (!current.cases.includes(surgery.procedure)) current.cases.push(surgery.procedure)
      demand.set(line.supplyId, current)
    }
  }
  return demand
}

export function shortfalls(supplies: Supply[], surgeries: SurgeryCase[]) {
  const demand = scheduledDemand(surgeries)
  return supplies.flatMap((supply) => {
    const need = demand.get(supply.id)
    if (!need || supply.quantity >= need.quantity) return []
    return [{ supply, needed: need.quantity, cases: need.cases }]
  })
}

export function expiryFlags(supplies: Supply[], today = dayStamp()) {
  return supplies.flatMap((supply) => {
    if (!supply.lotExpiry) return []
    const days = daysBetween(today, supply.lotExpiry)
    if (days > 30) return []
    return [{ supply, days, expired: days < 0 }]
  })
}

export function belowReorder(supplies: Supply[]) {
  return supplies.filter(isLowStock)
}
