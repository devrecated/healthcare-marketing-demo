"use client"

import { useEffect } from "react"

import { getScanMfeUrl } from "@/lib/scan-mfe"

/** Legacy in-app route — camera lives in the scan-mfe Vite app. */
export default function ScanRedirectPage() {
  useEffect(() => {
    window.location.replace(getScanMfeUrl())
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-muted-foreground">Opening scan microfrontend…</p>
      <a className="text-sm font-medium underline" href={getScanMfeUrl()}>
        Continue to scan
      </a>
    </div>
  )
}
