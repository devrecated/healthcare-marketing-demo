import { NextResponse } from "next/server"

/** Origins allowed to call extract/confirm from the scan microfrontend. */
export function allowedScanOrigins(): string[] {
  const configured = [
    process.env.NEXT_PUBLIC_SCAN_MFE_URL,
    process.env.SCAN_MFE_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]
  return configured
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/$/, ""))
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin")
  const requestHeaders = request.headers.get("access-control-request-headers")
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // Echo requested headers when present (FormData preflight); otherwise allow common ones.
    "Access-Control-Allow-Headers":
      requestHeaders || "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }
  return headers
}

function isAllowedOrigin(origin: string) {
  const normalized = origin.replace(/\/$/, "")
  if (allowedScanOrigins().includes(normalized)) return true
  // Separate Vercel project for the scan MFE (preview + production URLs).
  if (/^https:\/\/[\w.-]+\.vercel\.app$/.test(normalized)) return true
  // Local / LAN Vite during demos (phone on same Wi-Fi).
  return /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/.test(
    normalized,
  )
}

export function withCors(request: Request, response: NextResponse) {
  const headers = corsHeaders(request)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}

export function corsPreflight(request: Request) {
  return withCors(request, new NextResponse(null, { status: 204 }))
}
