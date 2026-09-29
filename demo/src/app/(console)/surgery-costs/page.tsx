"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { type AppColumn } from "@/components/console/data-table"

import { SurgeryBadge } from "@/components/console/badges"
import { SupplyAlerts } from "@/components/console/supply-alerts"
import { DataTable } from "@/components/console/data-table"
import { PageIntro, StatCard } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { SurgeryDialog } from "@/components/forms/surgery-dialog"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { formatMoney, formatWhen, surgeryTotals } from "@/lib/money"
import { useStore } from "@/lib/store"
import { patientName, type SurgeryCase } from "@/lib/types"

export default function SurgeryListPage() {
  const { surgeries, patients } = useStore()
  const [query, setQuery] = useState("")
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return surgeries.filter((surgery) => {
      const patient = patients.find((item) => item.id === surgery.patientId)
      const haystack = `${surgery.procedure} ${surgery.leadSurgeon} ${patient ? patientName(patient) : ""}`.toLowerCase()
      return needle.length === 0 || haystack.includes(needle)
    })
  }, [patients, query, surgeries])

  const spend = surgeries.reduce((sum, surgery) => sum + surgeryTotals(surgery).total, 0)
  const average = surgeries.length ? spend / surgeries.length : 0

  const columns = useMemo<AppColumn<SurgeryCase>[]>(
    () => [
      {
        header: "Procedure",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.procedure}</p>
            <p className="text-xs text-muted-foreground">{row.original.orRoom}</p>
          </div>
        ),
      },
      {
        header: "Patient",
        cell: ({ row }) => {
          const patient = patients.find((item) => item.id === row.original.patientId)
          return patient ? patientName(patient) : "Unknown"
        },
      },
      {
        header: "Surgeon",
        cell: ({ row }) => `Dr. ${row.original.leadSurgeon}`,
      },
      {
        header: "Date",
        cell: ({ row }) => formatWhen(row.original.date),
      },
      {
        header: "Status",
        cell: ({ row }) => <SurgeryBadge status={row.original.status} />,
      },
      {
        header: "Materials",
        cell: ({ row }) => formatMoney(surgeryTotals(row.original).materials),
      },
      {
        header: "Hours",
        cell: ({ row }) => formatMoney(surgeryTotals(row.original).labor),
      },
      {
        header: "Facility",
        cell: ({ row }) => formatMoney(surgeryTotals(row.original).charges),
      },
      {
        header: "Total",
        cell: ({ row }) => formatMoney(surgeryTotals(row.original).total),
      },
      {
        id: "open",
        header: "",
        cell: ({ row }) => (
          <Link
            href={`/surgery-costs/${row.original.id}`}
            className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
          >
            View costs
          </Link>
        ),
      },
    ],
    [patients],
  )

  return (
    <div>
      <PageIntro eyebrow="Cases" title="Surgery costs">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-h-11 sm:w-64"
            placeholder="Search procedure or patient"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <SurgeryDialog />
        </div>
      </PageIntro>
      <SupplyAlerts />
      <Reveal>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Cases" value={String(surgeries.length)} />
          <StatCard label="Total cost" value={formatMoney(spend)} tone="spruce" />
          <StatCard label="Average per case" value={formatMoney(average)} tone="clay" />
        </div>
      </Reveal>
      <DataTable columns={columns} data={rows} empty="No surgery cases yet." />
    </div>
  )
}
