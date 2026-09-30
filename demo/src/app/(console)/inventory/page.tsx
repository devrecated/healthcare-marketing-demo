"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { type AppColumn } from "@/components/console/data-table"
import { ControlledBadge, ExpiryBadge, StockBadge } from "@/components/console/badges"
import { DataTable } from "@/components/console/data-table"
import { PageIntro, StatCard } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { SupplyDialog } from "@/components/forms/supply-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLiveSupplies, useLiveUsageLog } from "@/hooks/use-live-inventory"
import { formatMoney, formatWhen, isLowStock } from "@/lib/money"
import { dayStamp, dueSupplies } from "@/lib/reconciliation"
import { addDays } from "@/lib/calendar"
import { useStore } from "@/lib/store"
import type { Supply, UsageLogEntry } from "@/lib/types"

export default function InventoryPage() {
  const { reconciliations, dispatch } = useStore()
  const { data: supplies, loading, error } = useLiveSupplies()
  const { data: usageLog, loading: usageLoading, refresh: refreshUsage } = useLiveUsageLog()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [latestBatch, setLatestBatch] = useState<UsageLogEntry[] | null>(null)
  const seenIds = useRef<Set<string> | null>(null)
  const supplyFingerprint = useRef<string>("")

  // When stock quantities change (supplies realtime), also refresh usage history —
  // covers projects that only published `supplies` to Realtime.
  useEffect(() => {
    const next = supplies.map((supply) => `${supply.id}:${supply.quantity}`).join("|")
    if (!supplyFingerprint.current) {
      supplyFingerprint.current = next
      return
    }
    if (next === supplyFingerprint.current) return
    supplyFingerprint.current = next
    void refreshUsage()
  }, [supplies, refreshUsage])

  // Toast + banner when new usage_log rows arrive (e.g. phone Confirm & deduct).
  useEffect(() => {
    if (usageLoading) return
    if (seenIds.current === null) {
      seenIds.current = new Set(usageLog.map((entry) => entry.id))
      return
    }
    const fresh = usageLog.filter((entry) => !seenIds.current!.has(entry.id))
    if (fresh.length === 0) return
    for (const entry of usageLog) seenIds.current.add(entry.id)
    setLatestBatch(fresh)
    const summary = fresh.map((entry) => entry.device).join(", ")
    toast.success(`Scan deducted ${fresh.length} item${fresh.length === 1 ? "" : "s"}`, {
      description: summary,
      duration: 8000,
    })
  }, [usageLog, usageLoading])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return supplies.filter((supply) => {
      const haystack = `${supply.name} ${supply.sku} ${supply.category}`.toLowerCase()
      return needle.length === 0 || haystack.includes(needle)
    })
  }, [query, supplies])

  const value = supplies.reduce((sum, supply) => sum + supply.quantity * supply.unitCost, 0)
  const low = supplies.filter(isLowStock).length
  const due = dueSupplies(supplies).length
  const lastSigned = reconciliations.find((session) => session.status === "signed")
  const openSession = reconciliations.find((session) => session.status === "open")

  const columns = useMemo<AppColumn<Supply>[]>(
    () => [
      { accessorKey: "name", header: "Supply" },
      { accessorKey: "category", header: "Category" },
      { accessorKey: "sku", header: "SKU" },
      {
        header: "On hand",
        cell: ({ row }) => `${row.original.quantity} ${row.original.unit}`,
      },
      {
        header: "Flags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StockBadge low={isLowStock(row.original)} />
            {row.original.controlled ? <ControlledBadge /> : null}
            {row.original.lotExpiry && row.original.lotExpiry <= dayStamp() ? <ExpiryBadge expired /> : null}
            {row.original.lotExpiry && row.original.lotExpiry > dayStamp() && row.original.lotExpiry <= addDays(dayStamp(), 30) ? (
              <ExpiryBadge expired={false} />
            ) : null}
          </div>
        ),
      },
      {
        header: "Unit cost",
        cell: ({ row }) => formatMoney(row.original.unitCost),
      },
      {
        header: "Stock value",
        cell: ({ row }) => formatMoney(row.original.quantity * row.original.unitCost),
      },
      {
        id: "edit",
        header: "",
        cell: ({ row }) => <SupplyDialog supply={row.original} />,
      },
    ],
    [],
  )

  return (
    <div>
      <PageIntro eyebrow="Stores" title="Medical supplies">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="min-h-11 sm:w-64"
            placeholder="Search name or SKU"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <SupplyDialog />
          <Button
            className="min-h-11"
            variant="outline"
            onClick={() => {
              if (!openSession) dispatch({ type: "start-reconciliation" })
              router.push("/inventory/reconcile")
            }}
          >
            {openSession ? "Continue count" : "Start daily count"}
          </Button>
        </div>
      </PageIntro>
      {error ? (
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>
      ) : null}

      {latestBatch && latestBatch.length > 0 ? (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                Just deducted from scan ({latestBatch.length} item
                {latestBatch.length === 1 ? "" : "s"})
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {latestBatch.map((entry) => (
                  <li key={entry.id}>
                    <span className="font-medium">{entry.device}</span>
                    <span className="text-emerald-900/70">
                      {" "}
                      · {entry.sku}
                      {entry.centerHint ? ` · ${entry.centerHint}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Button
              className="min-h-11"
              size="sm"
              variant="outline"
              onClick={() => setLatestBatch(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      <Reveal>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Inventory value" value={loading ? "…" : formatMoney(value)} tone="spruce" />
          <StatCard
            label="Below reorder"
            value={loading ? "…" : String(low)}
            hint={low > 0 ? "Amber means reorder, not an alarm" : "All supplies are above reorder"}
            tone={low > 0 ? "warn" : "spruce"}
          />
          <StatCard
            label="Due for count"
            value={loading ? "…" : String(due)}
            hint={lastSigned ? `Last signed ${formatWhen(lastSigned.date)}` : "No signed count yet"}
            tone={due > 0 ? "warn" : "spruce"}
          />
        </div>
      </Reveal>

      <DataTable
        columns={columns}
        data={rows}
        empty={loading ? "Loading supplies…" : "No supplies match that search."}
      />
    </div>
  )
}
