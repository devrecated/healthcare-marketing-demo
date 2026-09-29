"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

import { type AppColumn } from "@/components/console/data-table"
import { ControlledBadge, ExpiryBadge, StockBadge } from "@/components/console/badges"
import { DataTable } from "@/components/console/data-table"
import { PageIntro, StatCard } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { SupplyDialog } from "@/components/forms/supply-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMoney, formatWhen, isLowStock } from "@/lib/money"
import { dayStamp, dueSupplies } from "@/lib/reconciliation"
import { addDays } from "@/lib/calendar"
import { useStore } from "@/lib/store"
import type { Supply } from "@/lib/types"

export default function InventoryPage() {
  const { supplies, reconciliations, dispatch } = useStore()
  const router = useRouter()
  const [query, setQuery] = useState("")
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
      <Reveal>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="Inventory value" value={formatMoney(value)} tone="spruce" />
          <StatCard
            label="Below reorder"
            value={String(low)}
            hint={low > 0 ? "Amber means reorder, not an alarm" : "All supplies are above reorder"}
            tone={low > 0 ? "warn" : "spruce"}
          />
          <StatCard
            label="Due for count"
            value={String(due)}
            hint={lastSigned ? `Last signed ${formatWhen(lastSigned.date)}` : "No signed count yet"}
            tone={due > 0 ? "warn" : "spruce"}
          />
        </div>
      </Reveal>
      <DataTable columns={columns} data={rows} empty="No supplies match that search." />
    </div>
  )
}
