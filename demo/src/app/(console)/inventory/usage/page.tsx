"use client"

import Link from "next/link"
import { useMemo } from "react"

import { DataTable, type AppColumn } from "@/components/console/data-table"
import { PageIntro, StatCard } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { Button } from "@/components/ui/button"
import { formatWhen } from "@/lib/money"
import { useStore } from "@/lib/store"
import type { UsageLogEntry } from "@/lib/types"

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function UsageLogPage() {
  const { usageLog } = useStore()

  const totalQty = usageLog.reduce((sum, entry) => sum + entry.qty, 0)
  const distinctForms = new Set(usageLog.map((entry) => entry.formId ?? "")).size

  const columns = useMemo<AppColumn<UsageLogEntry>[]>(
    () => [
      { header: "Recorded", cell: ({ row }) => formatWhen(row.original.recordedAt) },
      { accessorKey: "centerHint", header: "Center" },
      { accessorKey: "formId", header: "Form" },
      { accessorKey: "sku", header: "SKU" },
      { accessorKey: "device", header: "Device" },
      { header: "Qty", cell: ({ row }) => row.original.qty },
      { accessorKey: "approvedBy", header: "Approved by" },
    ],
    [],
  )

  function exportCsv() {
    const headerRow = ["timestamp", "form_id", "center", "sku", "device", "qty", "approved_by"]
    const lines = [headerRow.join(",")]
    for (const entry of usageLog) {
      lines.push(
        [
          csvCell(entry.recordedAt),
          csvCell(entry.formId),
          csvCell(entry.centerHint),
          csvCell(entry.sku),
          csvCell(entry.device),
          csvCell(entry.qty),
          csvCell(entry.approvedBy),
        ].join(","),
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `device-usage-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageIntro eyebrow="Stores" title="Device usage log">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/inventory/intake"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Scan a form
          </Link>
          <Button className="min-h-11" variant="outline" onClick={exportCsv} disabled={usageLog.length === 0}>
            Export CSV
          </Button>
        </div>
      </PageIntro>

      <Reveal>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Devices recorded" value={String(usageLog.length)} tone="spruce" />
          <StatCard label="Total quantity" value={String(totalQty)} tone="ink" />
          <StatCard label="Forms" value={String(distinctForms)} tone="ink" />
        </div>
      </Reveal>

      <DataTable
        columns={columns}
        data={usageLog}
        empty="No device usage recorded yet. Scan a compliance form to get started."
      />
    </div>
  )
}
