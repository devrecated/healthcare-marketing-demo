"use client"

import Link from "next/link"
import { useMemo } from "react"

import { DataTable, type AppColumn } from "@/components/console/data-table"
import { PageIntro, StatCard } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { Button } from "@/components/ui/button"
import { useLiveUsageLog } from "@/hooks/use-live-inventory"
import { formatWhen } from "@/lib/money"
import type { UsageLogEntry } from "@/lib/types"

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default function UsageLogPage() {
  const { data: usageLog, loading, error } = useLiveUsageLog()

  const distinctForms = new Set(usageLog.map((entry) => entry.formId ?? "")).size
  const distinctSkus = new Set(usageLog.map((entry) => entry.sku)).size

  const columns = useMemo<AppColumn<UsageLogEntry>[]>(
    () => [
      { header: "Recorded", cell: ({ row }) => formatWhen(row.original.recordedAt) },
      { accessorKey: "centerHint", header: "Center" },
      { accessorKey: "formId", header: "Form" },
      { accessorKey: "sku", header: "SKU" },
      { accessorKey: "device", header: "Device" },
      { accessorKey: "approvedBy", header: "Approved by" },
    ],
    [],
  )

  function exportCsv() {
    const headerRow = ["timestamp", "form_id", "center", "sku", "device", "approved_by"]
    const lines = [headerRow.join(",")]
    for (const entry of usageLog) {
      lines.push(
        [
          csvCell(entry.recordedAt),
          csvCell(entry.formId),
          csvCell(entry.centerHint),
          csvCell(entry.sku),
          csvCell(entry.device),
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
            href="/scan"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Open scan camera
          </Link>
          <Button className="min-h-11" variant="outline" onClick={exportCsv} disabled={usageLog.length === 0}>
            Export CSV
          </Button>
        </div>
      </PageIntro>

      {error ? (
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>
      ) : null}

      <Reveal>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Devices recorded" value={loading ? "…" : String(usageLog.length)} tone="spruce" />
          <StatCard label="Distinct SKUs" value={loading ? "…" : String(distinctSkus)} tone="ink" />
          <StatCard label="Forms" value={loading ? "…" : String(distinctForms)} tone="ink" />
        </div>
      </Reveal>

      <DataTable
        columns={columns}
        data={usageLog}
        empty={
          loading
            ? "Loading usage log…"
            : "No device usage recorded yet. Scan a compliance form to get started."
        }
      />
    </div>
  )
}
