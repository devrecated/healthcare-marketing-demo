import { NextResponse } from "next/server"

import { ACCEPTED_MIME_TYPES, extractFromMedia } from "@/lib/gemini"
import { corsPreflight, withCors } from "@/lib/cors"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024 // 15MB inline cap

export function OPTIONS(request: Request) {
  return corsPreflight(request)
}

// POST multipart/form-data with a "file" field (image or PDF of a sanitized
// compliance form). Returns a validated Extraction. Runs server-side so the
// GEMINI_API_KEY never reaches the browser.
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file")

    if (!(file instanceof File)) {
      return withCors(
        request,
        NextResponse.json({ error: "No file uploaded (expected form field 'file')." }, { status: 400 }),
      )
    }
    if (!ACCEPTED_MIME_TYPES.includes(file.type as (typeof ACCEPTED_MIME_TYPES)[number])) {
      return withCors(
        request,
        NextResponse.json(
          { error: `Unsupported file type "${file.type || "unknown"}". Use PNG, JPEG, WEBP, HEIC, or PDF.` },
          { status: 415 },
        ),
      )
    }
    if (file.size > MAX_BYTES) {
      return withCors(
        request,
        NextResponse.json({ error: "File too large (max 15MB for inline upload)." }, { status: 413 }),
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const extraction = await extractFromMedia({
      base64: bytes.toString("base64"),
      mimeType: file.type,
      sourceFile: file.name || "upload",
    })

    return withCors(request, NextResponse.json(extraction))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed."
    return withCors(request, NextResponse.json({ error: message }, { status: 500 }))
  }
}
