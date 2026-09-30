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
import {
  FORM_HEIGHT,
  FORM_WIDTH,
  MOCK_FORM_CATALOG,
  buildFormSvg,
  buildRandomFormSpec,
  downloadFormPdf,
  svgDataUrl,
  svgToPngFile,
} from "@/lib/mock-forms"
import { MOCK_USER } from "@/lib/session"
import { getScanMfeUrl } from "@/lib/scan-mfe"
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
  const [mockBusy, setMockBusy] = useState(false)

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

  async function grabMock(id: string, label: string) {
    const form = MOCK_FORM_CATALOG.find((item) => item.id === id)
    if (!form) return
    setMockBusy(true)
    try {
      // Always build from current SVG layout — static fixture PNGs may be stale
      // when rsvg-convert is missing locally.
      const next = await svgToPngFile(buildFormSvg(form), `${form.file}.png`)
      onPick(next)
      toast(`Loaded mock: ${label}`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not load mock image")
    } finally {
      setMockBusy(false)
    }
  }

  async function generateMock() {
    setMockBusy(true)
    try {
      const spec = buildRandomFormSpec(supplies)
      const next = await svgToPngFile(buildFormSvg(spec), `${spec.file}.png`)
      onPick(next)
      toast.success(`Generated mock form (${spec.devices.length} devices)`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not generate mock image")
    } finally {
      setMockBusy(false)
    }
  }

  async function printForms(
    forms: Omit<(typeof MOCK_FORM_CATALOG)[number], "id" | "file" | "label">[],
    title: string,
  ) {
    // Open synchronously on the click gesture so the browser allows the tab.
    const win = window.open("about:blank", "_blank")
    if (!win) {
      toast.error("Pop-up blocked — allow pop-ups to print forms")
      return
    }
    win.document.write(`<!DOCTYPE html><title>Preparing print…</title><p style="font-family:sans-serif;padding:2rem">Preparing print preview…</p>`)
    win.document.close()

    setMockBusy(true)
    const objectUrls: string[] = []
    try {
      // Same SVG→canvas→PNG path as cards / "Use this form" so barcodes match.
      const imgs: string[] = []
      for (const [index, form] of forms.entries()) {
        const file = await svgToPngFile(buildFormSvg(form), `print-${index}.png`)
        const url = URL.createObjectURL(file)
        objectUrls.push(url)
        imgs.push(
          `<section class="sheet"><img src="${url}" width="${FORM_WIDTH}" height="${FORM_HEIGHT}" alt=""/></section>`,
        )
      }
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title.replace(/</g, "")}</title>
  <style>
    @page { size: letter portrait; margin: 0.35in; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .sheet { page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    img { display: block; width: 100%; height: auto; max-width: 7.5in; margin: 0 auto; }
  </style>
</head>
<body>${imgs.join("\n")}
<script>
  window.addEventListener("load", function () {
    setTimeout(function () { window.print(); }, 150);
  });
</script>
</body>
</html>`
      win.document.open()
      win.document.write(html)
      win.document.close()
      win.focus()
      window.setTimeout(() => {
        for (const url of objectUrls) URL.revokeObjectURL(url)
      }, 120_000)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not prepare print preview")
      for (const url of objectUrls) URL.revokeObjectURL(url)
      win.close()
    } finally {
      setMockBusy(false)
    }
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
            qty: 1,
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

  const approvable = rows.filter((row) => row.include && row.supplyId !== NO_MATCH)

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
        qty: 1,
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
        <div className="flex flex-wrap gap-3 text-sm">
          <a
            href={getScanMfeUrl()}
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Open scan camera
          </a>
          <Link href="/inventory/usage" className="text-muted-foreground underline-offset-4 hover:underline">
            View usage log
          </Link>
        </div>
      </PageIntro>

      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <strong>Sanitized data only.</strong> Upload only synthetic or fully redacted forms. No PHI - we are using Google AI Studio, and the shared hereis not private. —
        the production path for real patient forms requires a custom, self-hosted model.
      </div>

      <Reveal>
        <div className="mb-4 rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                Mock forms
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Synthetic sticker sheets only — grab a fixture, print for the camera demo, or generate a fresh PNG.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                variant="outline"
                disabled={mockBusy || loading}
                onClick={() => void printForms(MOCK_FORM_CATALOG, "Acme Healthcare mock forms")}
              >
                Print all forms
              </Button>
              <Button
                className="min-h-11"
                variant="outline"
                disabled={mockBusy || loading}
                onClick={generateMock}
              >
                {mockBusy ? "Working…" : "Generate random mock"}
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {MOCK_FORM_CATALOG.map((form) => (
              <article key={form.id} className="overflow-hidden rounded-xl border bg-background">
                <img
                  src={svgDataUrl(buildFormSvg(form))}
                  alt={form.label}
                  className="aspect-[3/4] w-full object-cover object-top bg-white"
                />
                <div className="space-y-2 p-3">
                  <p className="text-sm font-medium">{form.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {form.devices.length} devices · {form.center}
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      className="min-h-11 w-full"
                      size="sm"
                      disabled={mockBusy || loading}
                      onClick={() => grabMock(form.id, form.label)}
                    >
                      Use this form
                    </Button>
                    <Button
                      className="min-h-11 w-full"
                      size="sm"
                      variant="outline"
                      disabled={mockBusy || loading}
                      onClick={() => void printForms([form], form.label)}
                    >
                      Print this form
                    </Button>
                    <Button
                      className="min-h-11 w-full"
                      size="sm"
                      variant="outline"
                      disabled={mockBusy || loading}
                      onClick={() => {
                        void (async () => {
                          setMockBusy(true)
                          try {
                            await downloadFormPdf(buildFormSvg(form), `${form.file}.pdf`)
                            toast.success(`Downloaded ${form.label}`)
                          } catch (caught) {
                            toast.error(
                              caught instanceof Error ? caught.message : "Could not download PDF",
                            )
                          } finally {
                            setMockBusy(false)
                          }
                        })()
                      }}
                    >
                      Download PDF
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Reveal>

      <Reveal>
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
              className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-primary-foreground"
              onChange={(event) => onPick(event.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="mt-2 truncate text-xs text-muted-foreground">
                Ready: <span className="font-medium text-foreground">{file.name}</span>
              </p>
            ) : null}
          </div>
          <Button className="min-h-11 shrink-0" onClick={runExtract} disabled={loading || !file}>
            {loading ? "Extracting…" : "Extract devices"}
          </Button>
        </div>
      </Reveal>

      {file && previewUrl && !header ? (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-card">
          <img src={previewUrl} alt="Selected form preview" className="mx-auto max-h-[32rem] w-auto max-w-full" />
        </div>
      ) : null}

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
