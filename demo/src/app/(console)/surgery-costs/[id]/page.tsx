"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { SurgeryBadge } from "@/components/console/badges"
import { CostSplit } from "@/components/console/cost-split"
import { Choice, Field } from "@/components/forms/patient-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { newId } from "@/lib/id"
import {
  chargesTotal,
  formatMoney,
  formatWhen,
  laborTotal,
  lineLabor,
  lineMaterial,
  materialsTotal,
  surgeryTotals,
} from "@/lib/money"
import { useStore } from "@/lib/store"
import {
  LABOR_ROLES,
  ROLE_RATES,
  patientName,
  type ChargeLine,
  type LaborLine,
  type LaborRole,
  type MaterialLine,
} from "@/lib/types"
import {
  chargeDraftSchema,
  firstIssue,
  laborDraftSchema,
  materialDraftSchema,
} from "@/lib/validation"

function share(part: number, total: number) {
  if (total <= 0) return "0%"
  return `${Math.round((part / total) * 100)}%`
}

export default function SurgeryDetailPage() {
  const params = useParams<{ id: string }>()
  const { surgeries, patients } = useStore()
  const surgery = surgeries.find((item) => item.id === params.id)

  if (!surgery) {
    return (
      <div className="rounded-2xl border bg-card p-8">
        <h2 className="font-heading text-2xl">That case is not on the board</h2>
        <Link href="/surgery-costs" className="mt-4 inline-flex min-h-11 items-center underline">
          Back to surgery costs
        </Link>
      </div>
    )
  }

  const patient = patients.find((item) => item.id === surgery.patientId)
  const totals = surgeryTotals(surgery)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/surgery-costs" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          All cases
        </Link>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-heading text-3xl tracking-tight">{surgery.procedure}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {patient ? patientName(patient) : "Unknown patient"} · Dr. {surgery.leadSurgeon} · {surgery.orRoom} · {formatWhen(surgery.date)}
            </p>
          </div>
          <SurgeryBadge status={surgery.status} />
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Tabs defaultValue="materials">
          <TabsList className="h-auto min-h-11">
            <TabsTrigger value="materials" className="min-h-11 px-3">Materials</TabsTrigger>
            <TabsTrigger value="labor" className="min-h-11 px-3">Hours</TabsTrigger>
            <TabsTrigger value="charges" className="min-h-11 px-3">Facility</TabsTrigger>
          </TabsList>
          <TabsContent value="materials" className="mt-4">
            <MaterialsPanel surgeryId={surgery.id} total={totals.total} lines={surgery.materials} />
          </TabsContent>
          <TabsContent value="labor" className="mt-4">
            <LaborPanel surgeryId={surgery.id} total={totals.total} lines={surgery.labor} />
          </TabsContent>
          <TabsContent value="charges" className="mt-4">
            <ChargesPanel surgeryId={surgery.id} total={totals.total} lines={surgery.charges} />
          </TabsContent>
        </Tabs>

        <aside className="rounded-2xl border bg-card p-5 xl:sticky xl:top-20">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Case total</p>
          <p className="mt-1 font-heading text-4xl tracking-tight">{formatMoney(totals.total)}</p>
          <div className="mt-4">
            <CostSplit materials={totals.materials} labor={totals.labor} charges={totals.charges} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Share label="Materials" amount={totals.materials} total={totals.total} />
            <Share label="Staff hours" amount={totals.labor} total={totals.total} />
            <Share label="Facility" amount={totals.charges} total={totals.total} />
          </dl>
        </aside>
      </div>
    </div>
  )
}

function Share({ label, amount, total }: { label: string; amount: number; total: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <span className="font-medium">{formatMoney(amount)}</span>
        <span className="ml-2 text-xs text-muted-foreground">{share(amount, total)}</span>
      </dd>
    </div>
  )
}

function MaterialsPanel({
  surgeryId,
  total,
  lines,
}: {
  surgeryId: string
  total: number
  lines: MaterialLine[]
}) {
  const { supplies, dispatch } = useStore()
  const [supplyId, setSupplyId] = useState(supplies[0]?.id ?? "")
  const [quantity, setQuantity] = useState("1")
  const [unitCost, setUnitCost] = useState(String(supplies[0]?.unitCost ?? 0))
  const [deduct, setDeduct] = useState(false)
  const selected = supplies.find((item) => item.id === supplyId)

  function add() {
    const parsed = materialDraftSchema.safeParse({
      supplyId,
      quantity: Number(quantity),
      unitCost: Number(unitCost),
    })
    if (!parsed.success || !selected) {
      toast.error(parsed.success ? "Choose a supply" : firstIssue(parsed.error))
      return
    }
    if (deduct && selected.quantity < parsed.data.quantity) {
      toast.error(`Only ${selected.quantity} ${selected.unit} on hand`)
      return
    }
    if (deduct) {
      dispatch({ type: "adjust-supply", id: selected.id, delta: -parsed.data.quantity })
    }
    dispatch({
      type: "upsert-material",
      surgeryId,
      line: {
        id: newId("mat"),
        supplyId: selected.id,
        name: selected.name,
        quantity: parsed.data.quantity,
        unitCost: parsed.data.unitCost,
        deducted: deduct,
      },
    })
    toast(deduct ? "Material added and stock reduced" : "Material added")
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 lg:grid-cols-[1.4fr_0.6fr_0.7fr_auto] lg:items-end">
        <Choice
          label="From inventory"
          value={supplyId}
          options={supplies.map((supply) => ({
            value: supply.id,
            label: `${supply.name} · ${supply.quantity} ${supply.unit} on hand`,
          }))}
          onChange={(value) => {
            setSupplyId(value)
            const supply = supplies.find((item) => item.id === value)
            if (supply) setUnitCost(String(supply.unitCost))
          }}
        />
        <Field label="Quantity">
          <Input className="min-h-11" type="number" min={0.1} step="0.1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </Field>
        <Field label="Unit cost">
          <Input className="min-h-11" type="number" min={0} step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox checked={deduct} onCheckedChange={(checked) => setDeduct(checked === true)} />
            Deduct stock
          </label>
          <Button className="min-h-11" onClick={add}>Add material</Button>
        </div>
      </div>
      <LineTable
        headers={["Item", "Qty", "Unit cost", "Line", "Share"]}
        empty="No materials yet. Pull a supply from inventory."
        subtotal={formatMoney(materialsTotal(lines))}
        rows={lines.map((line) => ({
          id: line.id,
          cells: [
            line.deducted ? `${line.name} · stock taken` : line.name,
            String(line.quantity),
            formatMoney(line.unitCost),
            formatMoney(lineMaterial(line)),
            share(lineMaterial(line), total),
          ],
          onRemove: () => dispatch({ type: "remove-material", surgeryId, lineId: line.id }),
        }))}
      />
    </section>
  )
}

function LaborPanel({
  surgeryId,
  total,
  lines,
}: {
  surgeryId: string
  total: number
  lines: LaborLine[]
}) {
  const { dispatch } = useStore()
  const [role, setRole] = useState<LaborRole>("Lead surgeon")
  const [staffName, setStaffName] = useState("")
  const [hours, setHours] = useState("1")
  const [rate, setRate] = useState(String(ROLE_RATES["Lead surgeon"]))

  const rollup = LABOR_ROLES.map((item) => {
    const matching = lines.filter((line) => line.role === item)
    return {
      role: item,
      hours: matching.reduce((sum, line) => sum + line.hours, 0),
      cost: matching.reduce((sum, line) => sum + lineLabor(line), 0),
    }
  }).filter((item) => item.hours > 0)

  function add() {
    const parsed = laborDraftSchema.safeParse({
      role,
      staffName,
      hours: Number(hours),
      hourlyRate: Number(rate),
    })
    if (!parsed.success) {
      toast.error(firstIssue(parsed.error))
      return
    }
    dispatch({
      type: "upsert-labor",
      surgeryId,
      line: { id: newId("lab"), ...parsed.data },
    })
    setStaffName("")
    toast("Hours added")
  }

  return (
    <section className="space-y-4">
      {rollup.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {rollup.map((item) => (
            <li key={item.role} className="rounded-full bg-muted px-3 py-2 text-sm">
              {item.role}: {item.hours}h · {formatMoney(item.cost)}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 rounded-2xl border bg-card p-4 lg:grid-cols-5 lg:items-end">
        <Choice
          label="Role"
          value={role}
          options={LABOR_ROLES}
          onChange={(value) => {
            const next = value as LaborRole
            setRole(next)
            setRate(String(ROLE_RATES[next]))
          }}
        />
        <Field label="Name">
          <Input className="min-h-11" value={staffName} onChange={(event) => setStaffName(event.target.value)} />
        </Field>
        <Field label="Hours">
          <Input className="min-h-11" type="number" min={0.25} step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} />
        </Field>
        <Field label="Hourly rate">
          <Input className="min-h-11" type="number" min={0} step="1" value={rate} onChange={(event) => setRate(event.target.value)} />
        </Field>
        <Button className="min-h-11" onClick={add}>Add hours</Button>
      </div>
      <LineTable
        headers={["Role", "Name", "Hours", "Rate", "Line", "Share"]}
        empty="No staff time yet. Add surgeon, anesthesia, and nursing hours."
        subtotal={formatMoney(laborTotal(lines))}
        rows={lines.map((line) => ({
          id: line.id,
          cells: [
            line.role,
            line.staffName,
            String(line.hours),
            formatMoney(line.hourlyRate),
            formatMoney(lineLabor(line)),
            share(lineLabor(line), total),
          ],
          onRemove: () => dispatch({ type: "remove-labor", surgeryId, lineId: line.id }),
        }))}
      />
    </section>
  )
}

function ChargesPanel({
  surgeryId,
  total,
  lines,
}: {
  surgeryId: string
  total: number
  lines: ChargeLine[]
}) {
  const { dispatch } = useStore()
  const [label, setLabel] = useState("")
  const [amount, setAmount] = useState("")

  function add() {
    const parsed = chargeDraftSchema.safeParse({ label, amount: Number(amount) })
    if (!parsed.success) {
      toast.error(firstIssue(parsed.error))
      return
    }
    dispatch({
      type: "upsert-charge",
      surgeryId,
      line: { id: newId("chg"), label: parsed.data.label, amount: parsed.data.amount },
    })
    setLabel("")
    setAmount("")
    toast("Charge added")
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[1.4fr_0.7fr_auto] md:items-end">
        <Field label="Charge">
          <Input className="min-h-11" placeholder="Theatre time, recovery, machine" value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field label="Amount">
          <Input className="min-h-11" type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Button className="min-h-11" onClick={add}>Add charge</Button>
      </div>
      <LineTable
        headers={["Charge", "Amount", "Share"]}
        empty="No facility charges yet."
        subtotal={formatMoney(chargesTotal(lines))}
        rows={lines.map((line) => ({
          id: line.id,
          cells: [line.label, formatMoney(line.amount), share(line.amount, total)],
          onRemove: () => dispatch({ type: "remove-charge", surgeryId, lineId: line.id }),
        }))}
      />
    </section>
  )
}

function LineTable({
  headers,
  rows,
  empty,
  subtotal,
}: {
  headers: string[]
  rows: { id: string; cells: string[]; onRemove: () => void }[]
  empty: string
  subtotal: string
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">{header}</th>
            ))}
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length + 1} className="px-3 py-8 text-center text-muted-foreground">{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t">
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} className="px-3 py-2">{cell}</td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" className="min-h-11" onClick={row.onRemove}>Remove</Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40">
            <td className="px-3 py-3 font-medium" colSpan={headers.length}>Subtotal {subtotal}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
