"use client"

import Link from "next/link"

import { AppointmentBadge, StockBadge } from "@/components/console/badges"
import { CostSplit } from "@/components/console/cost-split"
import { Reveal } from "@/components/console/reveal"
import { StatCard } from "@/components/console/stat-card"
import { formatMoney, formatWhen, isLowStock, surgeryTotals } from "@/lib/money"
import { useStore } from "@/lib/store"
import { patientName } from "@/lib/types"

export default function OverviewPage() {
  const { patients, appointments, supplies, surgeries } = useStore()
  const scheduled = appointments.filter((item) => item.status === "scheduled").length
  const pending = appointments.filter((item) => item.status === "pending").length
  const cancelled = appointments.filter((item) => item.status === "cancelled").length
  const low = supplies.filter(isLowStock)
  const totals = surgeries.map(surgeryTotals)
  const surgerySpend = totals.reduce((sum, item) => sum + item.total, 0)
  const materials = totals.reduce((sum, item) => sum + item.materials, 0)
  const labor = totals.reduce((sum, item) => sum + item.labor, 0)
  const charges = totals.reduce((sum, item) => sum + item.charges, 0)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Today
        </p>
        <h2 className="font-heading text-3xl tracking-tight">Ward board</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Patients, visits, stock, and what each surgery actually costs.
        </p>
      </div>
      <Reveal>
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <StatCard label="Patients" value={String(patients.length)} tone="spruce" />
          <StatCard label="Scheduled visits" value={String(scheduled)} hint={`${pending} pending · ${cancelled} cancelled`} tone="clay" />
          <StatCard
            label="Supplies to reorder"
            value={String(low.length)}
            hint={low.length ? low.map((item) => item.name).slice(0, 2).join(", ") : "Stock is comfortable"}
            tone={low.length ? "warn" : "spruce"}
          />
          <StatCard label="Surgery cost on the books" value={formatMoney(surgerySpend)} hint={`${surgeries.length} cases`} tone="ink" />
        </div>
      </Reveal>
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border bg-card p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-xl">Recent appointments</h3>
            <Link href="/appointments" className="text-sm underline-offset-4 hover:underline">
              Open list
            </Link>
          </div>
          <ul className="divide-y">
            {appointments.slice(0, 5).map((appointment) => {
              const patient = patients.find((item) => item.id === appointment.patientId)
              return (
                <li key={appointment.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{patient ? patientName(patient) : "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      Dr. {appointment.physician} · {formatWhen(appointment.schedule)}
                    </p>
                  </div>
                  <AppointmentBadge status={appointment.status} />
                </li>
              )
            })}
          </ul>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-heading text-xl">Surgery cost mix</h3>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">
              Materials, doctor and staff hours, and facility charges across open cases.
            </p>
            <CostSplit materials={materials} labor={labor} charges={charges} />
            <Link href="/surgery-costs" className="mt-4 inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">
              Review each case
            </Link>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <h3 className="font-heading text-xl">Low stock</h3>
            <ul className="mt-3 space-y-3">
              {low.length === 0 ? (
                <li className="text-sm text-muted-foreground">Nothing is below its reorder level.</li>
              ) : (
                low.map((supply) => (
                  <li key={supply.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{supply.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {supply.quantity} on hand · reorder at {supply.reorderLevel}
                      </p>
                    </div>
                    <StockBadge low />
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
