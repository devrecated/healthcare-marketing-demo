"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { X } from "lucide-react"

import { belowReorder, expiryFlags, shortfalls } from "@/lib/supply-signals"
import { useStore } from "@/lib/store"

const DISMISS_KEY = "wardline-supply-alerts-dismissed"

export function SupplyAlerts() {
  const { supplies, surgeries } = useStore()
  const low = belowReorder(supplies)
  const short = shortfalls(supplies, surgeries)
  const expiry = expiryFlags(supplies)
  const total = low.length + short.length + expiry.length
  const signature = `${low.length}:${short.length}:${expiry.length}`
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === signature)
  }, [signature])

  if (total === 0 || dismissed) return null

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium">
            {total}
          </span>
          <span className="truncate">
            Reorder {low.length} · Short {short.length} · Expiring {expiry.length}
          </span>
        </button>
        <Link href="/inventory" className="hidden min-h-11 items-center text-xs underline-offset-4 hover:underline sm:inline-flex">
          Supplies
        </Link>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-amber-100"
          aria-label="Dismiss supply alerts"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, signature)
            setDismissed(true)
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      {open ? (
        <ul className="space-y-1 border-t border-amber-200/80 pt-2 pb-1 text-xs">
          {low.map((supply) => (
            <li key={`low-${supply.id}`}>{supply.name} is at {supply.quantity}, reorder at {supply.reorderLevel}</li>
          ))}
          {short.map((item) => (
            <li key={`short-${item.supply.id}`}>
              {item.supply.name}: {item.supply.quantity} on hand, {item.needed} booked
            </li>
          ))}
          {expiry.map((item) => (
            <li key={`exp-${item.supply.id}`}>
              {item.supply.name} {item.expired ? "expired" : `expires in ${item.days}d`}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
