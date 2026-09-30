"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Camera,
  CheckCircle2,
  Images,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { matchDeviceToSupply, type Extraction } from "@/lib/extraction"
import { newId } from "@/lib/id"
import { isSignedIn } from "@/lib/session"
import { createBrowserSupabase, isSupabaseConfigured, mapSupply, type DbSupply } from "@/lib/supabase"
import type { Supply } from "@/lib/types"

const HIGH_CONFIDENCE = 0.8
const AUTO_CONFIRM_MS = 2500
const MAX_PARALLEL_EXTRACT = 2

type MatchedRow = {
  productName: string
  sku: string
  supplyId: string
  confidence: number
  matchMethod: "sku" | "name"
  matchScore: number
  raw: Extraction["devices"][number]
}

type DeductedRow = { device: string; sku: string; qty: number }

type QueueItem = {
  id: string
  file: File
  previewUrl: string | null
  status: "queued" | "extracting" | "ready" | "needs_review" | "confirming" | "done" | "error"
  extraction: Extraction | null
  matches: MatchedRow[]
  skipped: string[]
  error: string | null
  deducted: DeductedRow[]
  autoConfirmed: boolean
}

type View = "scan" | "review"

function isAutoConfirmable(item: Pick<QueueItem, "matches" | "skipped" | "extraction">) {
  if (item.matches.length === 0) return false
  if (item.skipped.length > 0) return false
  if ((item.extraction?.uncertain?.length ?? 0) > 0) return false
  return item.matches.every(
    (row) =>
      row.confidence >= HIGH_CONFIDENCE &&
      (row.matchMethod === "sku" || row.matchScore >= 0.7),
  )
}

export default function ScanPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const multiFileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const itemsRef = useRef<QueueItem[]>([])
  const extractingCountRef = useRef(0)
  const autoTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const suppliesRef = useRef<Supply[]>([])
  const pumpRef = useRef<() => void>(() => undefined)
  const confirmRef = useRef<(id: string, opts?: { auto?: boolean }) => Promise<boolean>>(
    async () => false,
  )

  const [auth, setAuth] = useState<"unknown" | "in" | "out">("unknown")
  const [view, setView] = useState<View>("scan")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [items, setItems] = useState<QueueItem[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [sessionDeducted, setSessionDeducted] = useState(0)
  const [batchConfirming, setBatchConfirming] = useState(false)

  const syncItems = useCallback((next: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => {
    setItems((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next
      itemsRef.current = resolved
      return resolved
    })
  }, [])

  const patchItem = useCallback(
    (id: string, patch: Partial<QueueItem> | ((item: QueueItem) => QueueItem)) => {
      syncItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item
          return typeof patch === "function" ? patch(item) : { ...item, ...patch }
        }),
      )
    },
    [syncItems],
  )

  useEffect(() => {
    setAuth(isSignedIn() ? "in" : "out")
  }, [])

  useEffect(() => {
    if (auth === "out") router.replace("/login")
  }, [auth, router])

  useEffect(() => {
    suppliesRef.current = supplies
  }, [supplies])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    void (async () => {
      try {
        const client = createBrowserSupabase()
        const { data } = await client.from("supplies").select("*")
        if (data) setSupplies((data as DbSupply[]).map(mapSupply))
      } catch {
        /* matching falls back when empty */
      }
    })()
  }, [])

  // Keep camera warm for the whole signed-in session (not torn down between captures).
  useEffect(() => {
    if (auth !== "in") return
    let cancelled = false

    async function startCamera() {
      setCameraError(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (caught) {
        setCameraError(
          caught instanceof Error
            ? caught.message
            : "Camera unavailable. Use Add photos instead.",
        )
      }
    }

    void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      for (const timer of autoTimersRef.current.values()) clearTimeout(timer)
      autoTimersRef.current.clear()
    }
  }, [auth])

  useEffect(() => {
    if (auth !== "in" || !streamRef.current || !videoRef.current) return
    if (videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
    void videoRef.current.play().catch(() => undefined)
  }, [auth, view])

  const confirmItem = useCallback(
    async (id: string, opts?: { auto?: boolean }): Promise<boolean> => {
      const item = itemsRef.current.find((row) => row.id === id)
      if (!item || item.matches.length === 0 || !item.extraction) return false
      if (item.status === "done" || item.status === "confirming") return false

      const timer = autoTimersRef.current.get(id)
      if (timer) {
        clearTimeout(timer)
        autoTimersRef.current.delete(id)
      }

      patchItem(id, { status: "confirming" })
      try {
        const res = await fetch("/api/scan/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            center_hint: item.extraction.center_hint,
            procedure_date: item.extraction.procedure_date,
            form_id: item.extraction.form_id,
            devices: item.matches.map((row) => row.raw),
          }),
        })
        const data: unknown = await res.json()
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? `Confirm failed (${res.status})`)
        }
        const payload = data as {
          deducted?: { device?: string; sku?: string; qty?: number }[]
        }
        const rows = Array.isArray(payload.deducted) ? payload.deducted : []
        const deducted = rows.map((row) => ({
          device: row.device ?? "Device",
          sku: row.sku ?? "",
          qty: row.qty ?? 1,
        }))
        patchItem(id, {
          status: "done",
          deducted,
          autoConfirmed: Boolean(opts?.auto),
        })
        setSessionDeducted((n) => n + deducted.length)
        if (opts?.auto) {
          toast.success(`Auto-deducted ${deducted.length} item${deducted.length === 1 ? "" : "s"}`)
        }
        return true
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Confirm failed"
        patchItem(id, { status: "needs_review", error: message })
        toast.error(message)
        return false
      }
    },
    [patchItem],
  )

  useEffect(() => {
    confirmRef.current = confirmItem
  }, [confirmItem])

  const scheduleAutoConfirm = useCallback(
    (id: string, matchCount: number) => {
      const existing = autoTimersRef.current.get(id)
      if (existing) clearTimeout(existing)

      const toastId = `auto-${id}`
      toast(`Auto-confirming ${matchCount} item${matchCount === 1 ? "" : "s"}…`, {
        id: toastId,
        duration: AUTO_CONFIRM_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const timer = autoTimersRef.current.get(id)
            if (timer) {
              clearTimeout(timer)
              autoTimersRef.current.delete(id)
            }
            patchItem(id, { status: "needs_review" })
            toast.message("Held for review")
          },
        },
      })

      const timer = setTimeout(() => {
        autoTimersRef.current.delete(id)
        toast.dismiss(toastId)
        void confirmRef.current(id, { auto: true })
      }, AUTO_CONFIRM_MS)
      autoTimersRef.current.set(id, timer)
    },
    [patchItem],
  )

  const runExtract = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((row) => row.id === id)
      if (!item) {
        extractingCountRef.current = Math.max(0, extractingCountRef.current - 1)
        pumpRef.current()
        return
      }

      patchItem(id, { status: "extracting", error: null })
      try {
        const body = new FormData()
        body.append("file", item.file)
        const res = await fetch("/api/extract", { method: "POST", body })
        const data: unknown = await res.json()
        if (!res.ok) {
          throw new Error((data as { error?: string }).error ?? `Extract failed (${res.status})`)
        }
        const extraction = data as Extraction

        let catalog = suppliesRef.current
        if (catalog.length === 0 && isSupabaseConfigured()) {
          const client = createBrowserSupabase()
          const { data: rows } = await client.from("supplies").select("*")
          catalog = (rows as DbSupply[] | null)?.map(mapSupply) ?? []
          setSupplies(catalog)
          suppliesRef.current = catalog
        }

        const matched: MatchedRow[] = []
        const miss: string[] = []
        for (const device of extraction.devices) {
          const hit = matchDeviceToSupply(device, catalog)
          if (!hit) {
            miss.push(device.product_name || device.ref || device.raw_sticker_text.slice(0, 40))
            continue
          }
          matched.push({
            productName: device.product_name || hit.supply.name,
            sku: hit.supply.sku,
            supplyId: hit.supply.id,
            confidence: device.confidence ?? 0,
            matchMethod: hit.method,
            matchScore: hit.score,
            raw: { ...device, qty: 1 },
          })
        }

        const nextPartial: Partial<QueueItem> = {
          extraction,
          matches: matched,
          skipped: miss,
        }

        if (matched.length === 0) {
          patchItem(id, {
            ...nextPartial,
            status: "needs_review",
            error: "No devices matched inventory",
          })
          toast.error("No devices matched — held for review")
          return
        }

        const draft = { matches: matched, skipped: miss, extraction }
        if (isAutoConfirmable(draft)) {
          patchItem(id, { ...nextPartial, status: "ready" })
          scheduleAutoConfirm(id, matched.length)
        } else {
          patchItem(id, { ...nextPartial, status: "needs_review" })
          toast.message("Needs review", {
            description: `${matched.length} matched${miss.length ? `, ${miss.length} skipped` : ""}`,
          })
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Extraction failed"
        patchItem(id, { status: "error", error: message })
        toast.error(message)
      } finally {
        extractingCountRef.current = Math.max(0, extractingCountRef.current - 1)
        pumpRef.current()
      }
    },
    [patchItem, scheduleAutoConfirm],
  )

  const pumpQueue = useCallback(() => {
    while (extractingCountRef.current < MAX_PARALLEL_EXTRACT) {
      const next = itemsRef.current.find((item) => item.status === "queued")
      if (!next) break
      extractingCountRef.current += 1
      itemsRef.current = itemsRef.current.map((item) =>
        item.id === next.id ? { ...item, status: "extracting" as const } : item,
      )
      setItems(itemsRef.current)
      void runExtract(next.id)
    }
  }, [runExtract])

  useEffect(() => {
    pumpRef.current = pumpQueue
  }, [pumpQueue])

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return
      const created: QueueItem[] = files.map((file) => ({
        id: newId("scan"),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "queued" as const,
        extraction: null,
        matches: [],
        skipped: [],
        error: null,
        deducted: [],
        autoConfirmed: false,
      }))
      syncItems((prev) => {
        const next = [...created, ...prev]
        itemsRef.current = next
        queueMicrotask(() => pumpRef.current())
        return next
      })
      toast.message(files.length === 1 ? "Form queued" : `${files.length} forms queued`)
    },
    [syncItems],
  )

  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (!video.videoWidth) {
      toast.error("Camera not ready yet")
      return
    }
    setCapturing(true)
    try {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(video, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
      if (!blob) {
        toast.error("Could not capture frame")
        return
      }
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" })
      addFiles([file])
    } finally {
      setCapturing(false)
    }
  }

  function onMultiPick(list: FileList | null) {
    if (!list?.length) return
    addFiles(Array.from(list))
    if (multiFileRef.current) multiFileRef.current.value = ""
  }

  function removeItem(id: string) {
    const timer = autoTimersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      autoTimersRef.current.delete(id)
    }
    syncItems((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }

  function clearDone() {
    syncItems((prev) => {
      for (const item of prev) {
        if (item.status === "done" && item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      }
      return prev.filter((item) => item.status !== "done")
    })
  }

  async function confirmAllPending() {
    const pending = itemsRef.current.filter(
      (item) =>
        (item.status === "ready" || item.status === "needs_review") && item.matches.length > 0,
    )
    if (pending.length === 0) {
      toast.message("Nothing to deduct")
      return
    }
    setBatchConfirming(true)
    let ok = 0
    for (const item of pending) {
      const timer = autoTimersRef.current.get(item.id)
      if (timer) {
        clearTimeout(timer)
        autoTimersRef.current.delete(item.id)
      }
      if (await confirmItem(item.id)) ok += 1
    }
    setBatchConfirming(false)
    if (ok > 0) {
      toast.success(`Deducted from ${ok} form${ok === 1 ? "" : "s"}`)
      setView("scan")
    }
  }

  const pendingReview = items.filter(
    (item) => item.status === "needs_review" || item.status === "ready",
  )
  const pendingCount = pendingReview.reduce((sum, item) => sum + item.matches.length, 0)
  const processing = items.filter(
    (item) => item.status === "queued" || item.status === "extracting" || item.status === "confirming",
  ).length
  const doneCount = items.filter((item) => item.status === "done").length
  const scannedCount = items.length

  if (auth !== "in") {
    return <div className="min-h-dvh bg-background" />
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-background px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Scan</p>
          <h1 className="text-xl font-semibold tracking-tight">Device form camera</h1>
        </div>
        <Link href="/inventory" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Supplies
        </Link>
      </header>

      {!isSupabaseConfigured() ? (
        <Banner tone="warn">
          Supabase env keys missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and
          SUPABASE_SERVICE_ROLE_KEY for confirm).
        </Banner>
      ) : null}

      <canvas ref={canvasRef} className="hidden" />

      {scannedCount > 0 || sessionDeducted > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border bg-card px-3 py-1 font-medium">
            {doneCount}/{scannedCount} forms
            {processing > 0 ? ` · ${processing} working` : ""}
          </span>
          {sessionDeducted > 0 ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-medium text-emerald-950">
              {sessionDeducted} deducted
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Single video stays mounted so the stream never restarts between captures/review. */}
      <div
        className={
          view === "scan"
            ? "relative mb-4 overflow-hidden rounded-2xl border bg-black aspect-[3/4]"
            : "pointer-events-none fixed top-0 left-0 h-px w-px overflow-hidden opacity-0"
        }
      >
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {view === "scan" && cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">
            {cameraError}
          </div>
        ) : null}
        {view === "scan" && capturing ? (
          <div className="pointer-events-none absolute inset-0 bg-white/40" />
        ) : null}
        {view === "scan" && processing > 0 ? (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs text-white">
            <Loader2 className="size-3.5 animate-spin" />
            Extracting…
          </div>
        ) : null}
      </div>

      {view === "scan" ? (
        <section className="flex flex-1 flex-col gap-4">
          <Button
            className="min-h-12 w-full text-base"
            onClick={() => void capture()}
            disabled={Boolean(cameraError) || capturing}
          >
            <Camera className="mr-2 size-5" />
            Capture form
          </Button>

          <div className="text-center text-sm text-muted-foreground">or</div>

          <input
            ref={multiFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => onMultiPick(event.target.files)}
          />
          <Button
            className="min-h-11 w-full"
            variant="outline"
            onClick={() => multiFileRef.current?.click()}
          >
            <Images className="mr-2 size-4" />
            Add photos
          </Button>

          {items.length > 0 ? (
            <div className="rounded-2xl border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  Queue
                </p>
                {doneCount > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline"
                    onClick={clearDone}
                  >
                    Clear done
                  </button>
                ) : null}
              </div>
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {items.map((item) => (
                  <QueueRow key={item.id} item={item} onRemove={() => removeItem(item.id)} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Keep capturing — high-confidence forms deduct automatically. Uncertain ones wait in
              review.
            </p>
          )}

          {pendingCount > 0 ? (
            <Button className="min-h-12 w-full text-base" onClick={() => setView("review")}>
              Review & deduct ({pendingCount})
            </Button>
          ) : null}

          {sessionDeducted > 0 ? (
            <p className="flex items-center justify-center gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="size-4" />
              Session total: {sessionDeducted} deducted
            </p>
          ) : null}
        </section>
      ) : null}

      {view === "review" ? (
        <section className="flex flex-1 flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-heading text-2xl tracking-tight">Review queue</h2>
            <Button variant="outline" className="min-h-11" onClick={() => setView("scan")}>
              Back to camera
            </Button>
          </div>

          {pendingReview.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing waiting. Keep scanning.</p>
          ) : (
            <ul className="space-y-3">
              {pendingReview.map((item) => (
                <li key={item.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex gap-3">
                    {item.previewUrl ? (
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="size-16 shrink-0 rounded-lg border object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {item.matches.length} matched
                        {item.skipped.length ? ` · ${item.skipped.length} skipped` : ""}
                      </p>
                      {item.error ? <p className="mt-1 text-xs text-amber-800">{item.error}</p> : null}
                      <ul className="mt-2 space-y-1 text-sm">
                        {item.matches.map((row) => (
                          <li
                            key={`${item.id}-${row.supplyId}-${row.sku}`}
                            className="flex justify-between gap-2"
                          >
                            <span className="truncate">{row.productName}</span>
                            <span className="shrink-0 text-muted-foreground">{row.sku}</span>
                          </li>
                        ))}
                      </ul>
                      {item.skipped.length > 0 ? (
                        <p className="mt-2 text-xs text-amber-800">
                          Skipped: {item.skipped.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="self-start rounded-lg p-2 text-muted-foreground hover:bg-muted"
                      aria-label="Remove"
                      onClick={() => removeItem(item.id)}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <Button
                    className="mt-3 min-h-11 w-full"
                    variant="outline"
                    disabled={item.matches.length === 0 || item.status === "confirming"}
                    onClick={() => void confirmItem(item.id)}
                  >
                    Deduct this form
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button
            className="min-h-12 w-full text-base"
            disabled={pendingCount === 0 || batchConfirming}
            onClick={() => void confirmAllPending()}
          >
            {batchConfirming ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Deducting…
              </>
            ) : (
              `Confirm & deduct all (${pendingCount})`
            )}
          </Button>
          <Button className="min-h-11 w-full" variant="outline" onClick={() => setView("scan")}>
            <RotateCcw className="mr-2 size-4" />
            Keep scanning
          </Button>
        </section>
      ) : null}
    </div>
  )
}

function QueueRow({ item, onRemove }: { item: QueueItem; onRemove: () => void }) {
  const label =
    item.status === "queued"
      ? "Queued"
      : item.status === "extracting"
        ? "Extracting…"
        : item.status === "ready"
          ? "Auto-confirming…"
          : item.status === "needs_review"
            ? "Needs review"
            : item.status === "confirming"
              ? "Deducting…"
              : item.status === "done"
                ? item.autoConfirmed
                  ? "Auto-deducted"
                  : "Deducted"
                : "Error"

  return (
    <li className="flex items-center gap-2 text-sm">
      {item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="size-10 rounded-md border object-cover" />
      ) : (
        <div className="size-10 rounded-md border bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {item.matches.length > 0
            ? `${item.matches.length} item${item.matches.length === 1 ? "" : "s"}`
            : item.file.name}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      {item.status === "extracting" || item.status === "confirming" ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <button
          type="button"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          aria-label="Remove"
          onClick={onRemove}
        >
          <X className="size-4" />
        </button>
      )}
    </li>
  )
}

function Banner({ children, tone }: { children: ReactNode; tone: "warn" }) {
  return (
    <div
      className={
        tone === "warn"
          ? "mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          : "mb-4 rounded-xl border p-3 text-sm"
      }
    >
      {children}
    </div>
  )
}
