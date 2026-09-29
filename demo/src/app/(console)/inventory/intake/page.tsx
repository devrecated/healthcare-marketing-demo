"use client"

/* eslint-disable @next/next/no-img-element */

import Link from "next/link"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { Choice, Field } from "@/components/forms/patient-dialog"
import { PageIntro } from "@/components/console/stat-card"
import { Reveal } from "@/components/console/reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { matchDeviceToSupply, type Extraction } from "@/lib/extraction"
import { newId } from "@/lib/id"
import { MOCK_USER } from "@/lib/session"
import { useStore } from "@/lib/store"
import type { UsageLogEntry } from "@/lib/types"

const NO_MATCH = "__none__"

type ReviewRow = {
  key: string
  include: boolean
  rawStickerText: string
  productName: string
  ref: string
  udi: string
  lot: string
  qty: number
  confidence: number
  supplyId: string
}

type Header = {
  centerHint: string
  procedureDate: string
  patientRef: string
  formId: string
}

export default function IntakePage() {
  const { supplies, dispatch } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState<string[]>([])
  const [header, setHeader] = useState<Header | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])

  const supplyOptions = useMemo(
    () => [
      { value: NO_MATCH, label: "— no match —" },
      ...supplies.map((supply) => ({ value: supply.id, label: `${supply.name} (${supply.sku})` })),
    ],
    [supplies],
  )

  function onPick(next: File | null) {
    setFile(next)
    setError(null)
    setHeader(null)
    setRows([])
    setUncertain([])
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(next && next.type !== "application/pdf" ? URL.createObjectURL(next) : null)
  }

  async function runExtract() {
    if (!file) {
      toast.error("Choose a form image or PDF first")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/extract", { method: "POST", body })
      const data: unknown = await res.json()
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Extract failed (${res.status})`)
      }
      const extraction = data as Extraction
      setHeader({
        centerHint: extraction.center_hint ?? "",
        procedureDate: extraction.procedure_date ?? "",
        patientRef: extraction.patient_ref ?? "",
        formId: extraction.form_id ?? "",
      })
      setUncertain(extraction.uncertain ?? [])
      setRows(
        extraction.devices.map((device, index) => {
          const match = matchDeviceToSupply(device, supplies)
          return {
            key: `${index}-${newId("row")}`,
            include: Boolean(match),
            rawStickerText: device.raw_sticker_text,
            productName: device.product_name ?? "",
            ref: device.ref ?? "",
            udi: device.udi_or_barcode ?? "",
            lot: device.lot ?? "",
            qty: device.qty ?? 1,
            confidence: device.confidence ?? 0,
            supplyId: match?.supply.id ?? NO_MATCH,
          }
        }),
      )
      if (extraction.devices.length === 0) toast("No device stickers found on that form")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Extraction failed")
    } finally {
      setLoading(false)
    }
  }

  function patch(key: string, next: Partial<ReviewRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)))
  }

  const approvable = rows.filter((row) => row.include && row.supplyId !== NO_MATCH && row.qty > 0)

  function approve() {
    if (approvable.length === 0) {
      toast.error("Nothing to approve — match at least one device to a supply")
      return
    }
    const recordedAt = new Date().toISOString()
    const entries: UsageLogEntry[] = approvable.map((row) => {
      const supply = supplies.find((item) => item.id === row.supplyId)
      return {
        id: newId("use"),
        formId: header?.formId || null,
        procedureDate: header?.procedureDate || null,
        centerHint: header?.centerHint || null,
        supplyId: row.supplyId,
        sku: supply?.sku ?? "",
        device: row.productName || supply?.name || "Device",
        qty: row.qty,
        approvedBy: MOCK_USER.name,
        rawStickerText: row.rawStickerText,
        recordedAt,
      }
    })
    dispatch({ type: "record-device-usage", entries })
    toast.success(`Recorded ${entries.length} device${entries.length === 1 ? "" : "s"} — inventory updated`)
    onPick(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  return (
    <div>
      <PageIntro eyebrow="Intake" title="Scan device form">
        <Link href="/inventory/usage" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          View usage log
        </Link>
      </PageIntro>

      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Sanitized data only.</strong> Upload synthetic or fully redacted forms. No PHI — the
        production path for real patient forms is Gemini on Vertex AI under a BAA. Nothing is written to
        inventory until you approve it below.
      </div>

      <Reveal>
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
            className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-primary-foreground"
            onChange={(event) => onPick(event.target.files?.[0] ?? null)}
          />
          <Button className="min-h-11 shrink-0" onClick={runExtract} disabled={loading || !file}>
            {loading ? "Extracting…" : "Extract devices"}
          </Button>
        </div>
      </Reveal>

      {error ? (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {header ? (
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-20">
            <div className="overflow-hidden rounded-2xl border bg-card">
              {previewUrl ? (
                <img src={previewUrl} alt="Uploaded form" className="w-full" />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">
                  {file?.type === "application/pdf" ? "PDF uploaded (no inline preview)." : "No preview."}
                </div>
              )}
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Form header</p>
              <div className="mt-3 grid gap-3">
                <Field label="Center">
                  <Input
                    className="min-h-11"
                    value={header.centerHint}
                    onChange={(event) => setHeader({ ...header, centerHint: event.target.value })}
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Procedure date">
                    <Input
                      className="min-h-11"
                      value={header.procedureDate}
                      onChange={(event) => setHeader({ ...header, procedureDate: event.target.value })}
                    />
                  </Field>
                  <Field label="Form ID">
                    <Input
                      className="min-h-11"
                      value={header.formId}
                      onChange={(event) => setHeader({ ...header, formId: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Patient ref (synthetic)">
                  <Input
                    className="min-h-11"
                    value={header.patientRef}
                    onChange={(event) => setHeader({ ...header, patientRef: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          </aside>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-2xl tracking-tight">
                Extracted devices <span className="text-muted-foreground">({rows.length})</span>
              </h3>
              <Button className="min-h-11" onClick={approve} disabled={approvable.length === 0}>
                Approve {approvable.length} to inventory
              </Button>
            </div>

            {uncertain.length > 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                <strong>Model flagged uncertain:</strong> {uncertain.join("; ")}
              </div>
            ) : null}

            {rows.length === 0 ? (
              <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
                No devices extracted.
              </p>
            ) : (
              rows.map((row) => {
                const matched = row.supplyId !== NO_MATCH
                return (
                  <article key={row.key} className="rounded-2xl border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={row.include}
                          onChange={(event) => patch(row.key, { include: event.target.checked })}
                        />
                        Include
                      </label>
                      <div className="flex items-center gap-2">
                        <ConfidenceBadge value={row.confidence} />
                        {matched ? (
                          <Badge variant="outline">matched</Badge>
                        ) : (
                          <Badge className="bg-rose-100 text-rose-950">no match</Badge>
                        )}
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground" title={row.rawStickerText}>
                      {row.rawStickerText}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Product name">
                        <Input
                          className="min-h-11"
                          value={row.productName}
                          onChange={(event) => patch(row.key, { productName: event.target.value })}
                        />
                      </Field>
                      <Field label="REF / SKU">
                        <Input
                          className="min-h-11"
                          value={row.ref}
                          onChange={(event) => patch(row.key, { ref: event.target.value })}
                        />
                      </Field>
                      <Field label="UDI / barcode">
                        <Input
                          className="min-h-11"
                          value={row.udi}
                          onChange={(event) => patch(row.key, { udi: event.target.value })}
                        />
                      </Field>
                      <Field label="Lot">
                        <Input
                          className="min-h-11"
                          value={row.lot}
                          onChange={(event) => patch(row.key, { lot: event.target.value })}
                        />
                      </Field>
                      <Field label="Qty">
                        <Input
                          className="min-h-11"
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(event) => patch(row.key, { qty: Math.max(1, Number(event.target.value) || 1) })}
                        />
                      </Field>
                      <Choice
                        label="Inventory match"
                        value={row.supplyId}
                        options={supplyOptions}
                        onChange={(value) => patch(row.key, { supplyId: value })}
                      />
                    </div>
                  </article>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  if (value >= 0.85) return <Badge className="bg-emerald-100 text-emerald-950">{pct}%</Badge>
  if (value >= 0.6) return <Badge className="bg-amber-100 text-amber-950">{pct}%</Badge>
  return <Badge className="bg-rose-100 text-rose-950">{pct}%</Badge>
}
