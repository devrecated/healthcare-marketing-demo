"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Camera, CheckCircle2, Loader2, RefreshCw, RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { matchDeviceToSupply, type Extraction } from "@/lib/extraction"
import { createBrowserSupabase, isSupabaseConfigured, mapSupply, type DbSupply } from "@/lib/supabase"
import { isSignedIn } from "@/lib/session"
import type { Supply } from "@/lib/types"

type MatchedRow = {
  productName: string
  sku: string
  supplyId: string
  qty: number
  confidence: number
  raw: Extraction["devices"][number]
}

type Phase = "camera" | "extracting" | "review" | "confirming" | "done"

export default function ScanPage() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [auth, setAuth] = useState<"unknown" | "in" | "out">("unknown")
  const [phase, setPhase] = useState<Phase>("camera")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<Extraction | null>(null)
  const [matches, setMatches] = useState<MatchedRow[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [deducted, setDeducted] = useState<{ device: string; sku: string; qty: number }[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])

  useEffect(() => {
    setAuth(isSignedIn() ? "in" : "out")
  }, [])

  useEffect(() => {
    if (auth === "out") router.replace("/login")
  }, [auth, router])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    void (async () => {
      try {
        const client = createBrowserSupabase()
        const { data } = await client.from("supplies").select("*")
        if (data) setSupplies((data as DbSupply[]).map(mapSupply))
      } catch {
        /* review matching falls back when supplies empty */
      }
    })()
  }, [])

  useEffect(() => {
    if (auth !== "in" || phase !== "camera") return
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
            : "Camera unavailable. Use the file picker fallback.",
        )
      }
    }

    void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [auth, phase])

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  async function extractFile(file: File) {
    setPhase("extracting")
    setCameraError(null)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/extract", { method: "POST", body })
      const data: unknown = await res.json()
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Extract failed (${res.status})`)
      }
      const next = data as Extraction
      setExtraction(next)

      let catalog = supplies
      if (catalog.length === 0 && isSupabaseConfigured()) {
        const client = createBrowserSupabase()
        const { data: rows } = await client.from("supplies").select("*")
        catalog = (rows as DbSupply[] | null)?.map(mapSupply) ?? []
        setSupplies(catalog)
      }

      const matched: MatchedRow[] = []
      const miss: string[] = []
      for (const device of next.devices) {
        const hit = matchDeviceToSupply(device, catalog)
        if (!hit) {
          miss.push(device.product_name || device.ref || device.raw_sticker_text.slice(0, 40))
          continue
        }
        matched.push({
          productName: device.product_name || hit.supply.name,
          sku: hit.supply.sku,
          supplyId: hit.supply.id,
          qty: 1,
          confidence: device.confidence ?? 0,
          raw: { ...device, qty: 1 },
        })
      }
      setMatches(matched)
      setSkipped(miss)
      setPhase("review")
      if (matched.length === 0) toast.error("No devices matched inventory")
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Extraction failed")
      setPhase("camera")
    }
  }

  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    if (!video.videoWidth) {
      toast.error("Camera not ready yet")
      return
    }
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
    stopCamera()
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    const file = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" })
    await extractFile(file)
  }

  async function onFilePick(file: File | null) {
    if (!file) return
    stopCamera()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    await extractFile(file)
  }

  async function confirmDeduct() {
    if (!extraction || matches.length === 0) return
    setPhase("confirming")
    try {
      const res = await fetch("/api/scan/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          center_hint: extraction.center_hint,
          procedure_date: extraction.procedure_date,
          form_id: extraction.form_id,
          devices: matches.map((row) => row.raw),
        }),
      })
      const data: unknown = await res.json()
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `Confirm failed (${res.status})`)
      }
      const payload = data as {
        deducted?: { device?: string; sku?: string; qty?: number }[]
        skipped?: { product_name?: string | null; reason?: string }[]
      }
      const rows = Array.isArray(payload.deducted) ? payload.deducted : []
      setDeducted(
        rows.map((row) => ({
          device: row.device ?? "Device",
          sku: row.sku ?? "",
          qty: row.qty ?? 1,
        })),
      )
      if (payload.skipped?.length) {
        setSkipped(payload.skipped.map((item) => item.product_name || item.reason || "skipped"))
      }
      setPhase("done")
      toast.success(`Deducted ${rows.length} item${rows.length === 1 ? "" : "s"}`)
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Confirm failed")
      setPhase("review")
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setExtraction(null)
    setMatches([])
    setSkipped([])
    setDeducted([])
    setPhase("camera")
  }

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

      {phase === "camera" ? (
        <section className="flex flex-1 flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl border bg-black aspect-[3/4]">
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            {cameraError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">
                {cameraError}
              </div>
            ) : null}
          </div>
          <Button className="min-h-12 w-full text-base" onClick={() => void capture()} disabled={Boolean(cameraError)}>
            <Camera className="mr-2 size-5" />
            Capture form
          </Button>
          <div className="text-center text-sm text-muted-foreground">or</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => void onFilePick(event.target.files?.[0] ?? null)}
          />
          <Button
            className="min-h-11 w-full"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            Choose photo
          </Button>
        </section>
      ) : null}

      {phase === "extracting" ? (
        <Busy label="Extracting devices…" previewUrl={previewUrl} />
      ) : null}

      {phase === "review" || phase === "confirming" ? (
        <section className="flex flex-1 flex-col gap-4">
          {previewUrl ? (
            <img src={previewUrl} alt="Captured form" className="max-h-48 w-full rounded-xl border object-contain bg-muted" />
          ) : null}
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Matched to inventory
            </p>
            {matches.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing matched. Retake the form.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {matches.map((row) => (
                  <li key={`${row.supplyId}-${row.sku}`} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{row.productName}</span>
                    <span className="shrink-0 text-muted-foreground">{row.sku}</span>
                  </li>
                ))}
              </ul>
            )}
            {skipped.length > 0 ? (
              <p className="mt-3 text-xs text-amber-800">
                Skipped: {skipped.join(", ")}
              </p>
            ) : null}
          </div>
          <Button
            className="min-h-12 w-full text-base"
            disabled={matches.length === 0 || phase === "confirming"}
            onClick={() => void confirmDeduct()}
          >
            {phase === "confirming" ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Deducting…
              </>
            ) : (
              `Confirm & deduct ${matches.length}`
            )}
          </Button>
          <Button className="min-h-11 w-full" variant="outline" disabled={phase === "confirming"} onClick={reset}>
            <RotateCcw className="mr-2 size-4" />
            Retake
          </Button>
        </section>
      ) : null}

      {phase === "done" ? (
        <section className="flex flex-1 flex-col items-stretch gap-4">
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center text-emerald-950">
            <CheckCircle2 className="mx-auto size-10" />
            <p className="mt-3 text-lg font-semibold">
              Deducted {deducted.length} item{deducted.length === 1 ? "" : "s"}
            </p>
          </div>
          <ul className="rounded-2xl border bg-card p-4 text-sm">
            {deducted.map((row, index) => (
              <li key={`${row.sku}-${index}`} className="flex justify-between gap-3 py-1">
                <span>{row.device}</span>
                <span className="text-muted-foreground">{row.sku}</span>
              </li>
            ))}
          </ul>
          <Button className="min-h-12 w-full" onClick={reset}>
            <RefreshCw className="mr-2 size-4" />
            Scan another
          </Button>
          <Link
            href="/inventory"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium"
          >
            Open supplies
          </Link>
        </section>
      ) : null}
    </div>
  )
}

function Busy({ label, previewUrl }: { label: string; previewUrl: string | null }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      {previewUrl ? (
        <img src={previewUrl} alt="" className="max-h-56 w-full rounded-xl border object-contain opacity-80" />
      ) : null}
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </section>
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
