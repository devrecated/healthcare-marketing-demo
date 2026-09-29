import type { LaborLine, MaterialLine, ChargeLine, SurgeryCase } from "@/lib/types"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

const dateStamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
})

const dateTimeStamp = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function formatMoney(amount: number) {
  return money.format(amount)
}

export function formatWhen(iso: string) {
  const dateOnly = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dateTime = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : dateTime
      ? new Date(
          Date.UTC(
            Number(dateTime[1]),
            Number(dateTime[2]) - 1,
            Number(dateTime[3]),
            Number(dateTime[4]),
            Number(dateTime[5]),
          ),
        )
      : new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return (dateTime ? dateTimeStamp : dateStamp).format(date)
}

export function lineMaterial(line: MaterialLine) {
  return line.quantity * line.unitCost
}

export function lineLabor(line: LaborLine) {
  return line.hours * line.hourlyRate
}

export function materialsTotal(lines: MaterialLine[]) {
  return lines.reduce((sum, line) => sum + lineMaterial(line), 0)
}

export function laborTotal(lines: LaborLine[]) {
  return lines.reduce((sum, line) => sum + lineLabor(line), 0)
}

export function chargesTotal(lines: ChargeLine[]) {
  return lines.reduce((sum, line) => sum + line.amount, 0)
}

export function surgeryTotals(surgery: SurgeryCase) {
  const materials = materialsTotal(surgery.materials)
  const labor = laborTotal(surgery.labor)
  const charges = chargesTotal(surgery.charges)
  return { materials, labor, charges, total: materials + labor + charges }
}

export function isLowStock(supply: { quantity: number; reorderLevel: number }) {
  return supply.quantity <= supply.reorderLevel
}
