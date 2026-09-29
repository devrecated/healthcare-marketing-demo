"use client"

import Link from "next/link"
import { toast } from "sonner"

import { ControlledBadge } from "@/components/console/badges"
import { Choice, Field } from "@/components/forms/patient-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMoney, formatWhen } from "@/lib/money"
import {
  canSignOff,
  needsExplanation,
  reasonLabel,
  sessionSummary,
  varianceOf,
} from "@/lib/reconciliation"
import { useStore } from "@/lib/store"
import { VARIANCE_REASONS, type VarianceReason } from "@/lib/types"

export default function ReconcilePage() {
  const { supplies, reconciliations, dispatch } = useStore()
  const session = reconciliations.find((item) => item.status === "open")

  if (!session) {
    return (
      <div className="rounded-2xl border bg-card p-8">
        <h2 className="font-heading text-2xl">No open count</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Start a daily reconciliation from the supplies page.
        </p>
        <Link href="/inventory" className="mt-4 inline-flex min-h-11 items-center underline">
          Back to supplies
        </Link>
      </div>
    )
  }

  const summary = sessionSummary(session, supplies)
  const blocks = canSignOff(session, supplies)

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-3">
        <div>
          <Link href="/inventory" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Supplies
          </Link>
          <h2 className="mt-2 font-heading text-3xl tracking-tight">Daily count</h2>
          <p className="text-sm text-muted-foreground">
            {formatWhen(session.date)} · {session.performedBy}
          </p>
        </div>
        {session.entries.map((entry) => {
          const supply = supplies.find((item) => item.id === entry.supplyId)
          if (!supply) return null
          const delta = varianceOf(entry)
          const explain = needsExplanation(entry, supply)
          return (
            <article key={entry.supplyId} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{supply.name}</p>
                  <p className="text-xs text-muted-foreground">{supply.sku} · system {entry.expected} {supply.unit}</p>
                </div>
                {supply.controlled ? <ControlledBadge /> : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Physical count">
                  <Input
                    className="min-h-11 bg-white"
                    type="number"
                    min={0}
                    value={entry.counted ?? ""}
                    onChange={(event) => {
                      const raw = event.target.value
                      dispatch({
                        type: "set-count",
                        sessionId: session.id,
                        supplyId: entry.supplyId,
                        counted: raw === "" ? null : Number(raw),
                      })
                    }}
                  />
                </Field>
                <div>
                  <p className="text-sm text-muted-foreground">Variance</p>
                  <p className="mt-2 font-heading text-2xl">
                    {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Value</p>
                  <p className="mt-2 font-medium">
                    {delta == null ? "—" : formatMoney(delta * supply.unitCost)}
                  </p>
                </div>
              </div>
              {explain ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Choice
                    label="Reason"
                    value={entry.reason ?? "unset"}
                    options={[
                      { value: "unset", label: "Choose a reason" },
                      ...VARIANCE_REASONS.map((reason) => ({ value: reason, label: reasonLabel(reason) })),
                    ]}
                    onChange={(value) =>
                      dispatch({
                        type: "set-reason",
                        sessionId: session.id,
                        supplyId: entry.supplyId,
                        reason: value === "unset" ? undefined : (value as VarianceReason),
                        note: entry.note,
                        witness: entry.witness,
                      })
                    }
                  />
                  {supply.controlled ? (
                    <Field label="Witness">
                      <Input
                        className="min-h-11 bg-white"
                        value={entry.witness ?? ""}
                        onChange={(event) =>
                          dispatch({
                            type: "set-reason",
                            sessionId: session.id,
                            supplyId: entry.supplyId,
                            reason: entry.reason,
                            note: entry.note,
                            witness: event.target.value,
                          })
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
      <aside className="rounded-2xl border bg-card p-5 xl:sticky xl:top-20">
        <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Count summary</p>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Counted" value={`${summary.counted} / ${session.entries.length}`} />
          <Row label="Matched" value={String(summary.matched)} />
          <Row label="Variances" value={String(summary.variances)} />
          <Row label="Controlled open" value={String(summary.unresolvedControlled)} />
          <Row label="Shrinkage" value={formatMoney(summary.shrinkageValue)} />
          <Row label="Write-off" value={formatMoney(summary.writeOffValue)} />
        </dl>
        {blocks.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {blocks.map((block) => (
              <li key={block}>{block}</li>
            ))}
          </ul>
        ) : null}
        <Button
          className="mt-4 min-h-11 w-full"
          disabled={blocks.length > 0}
          onClick={() => {
            dispatch({ type: "sign-reconciliation", sessionId: session.id })
            toast("Count signed and stock updated")
          }}
        >
          Sign off
        </Button>
      </aside>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
