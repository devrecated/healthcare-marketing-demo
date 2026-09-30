import {
  GoogleGenAI,
  MediaResolution,
  Type,
  createPartFromBase64,
  createPartFromText,
} from "@google/genai"

import { modelExtractionSchema, type Extraction } from "@/lib/extraction"

// Recommended always-current Flash multimodal alias; override with GEMINI_MODEL.
export const DEFAULT_MODEL = "gemini-flash-latest"
export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash"

export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const

// Gemini structured-output schema. Mirrors modelExtractionSchema in extraction.ts.
const responseJsonSchema = {
  type: Type.OBJECT,
  properties: {
    center_hint: { type: Type.STRING, nullable: true },
    procedure_date: { type: Type.STRING, nullable: true, description: "ISO date YYYY-MM-DD or null" },
    patient_ref: { type: Type.STRING, nullable: true },
    form_id: { type: Type.STRING, nullable: true },
    devices: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw_sticker_text: { type: Type.STRING },
          product_name: { type: Type.STRING, nullable: true },
          manufacturer: { type: Type.STRING, nullable: true },
          ref: { type: Type.STRING, nullable: true, description: "Catalog/REF number printed on the sticker" },
          udi_or_barcode: { type: Type.STRING, nullable: true },
          lot: { type: Type.STRING, nullable: true },
          qty: { type: Type.INTEGER },
          confidence: { type: Type.NUMBER, description: "0..1 self-assessed confidence" },
        },
        propertyOrdering: [
          "raw_sticker_text",
          "product_name",
          "manufacturer",
          "ref",
          "udi_or_barcode",
          "lot",
          "qty",
          "confidence",
        ],
        required: [
          "raw_sticker_text",
          "product_name",
          "manufacturer",
          "ref",
          "udi_or_barcode",
          "lot",
          "qty",
          "confidence",
        ],
      },
    },
    uncertain: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  propertyOrdering: ["center_hint", "procedure_date", "patient_ref", "form_id", "devices", "uncertain"],
  required: ["center_hint", "procedure_date", "patient_ref", "form_id", "devices", "uncertain"],
}

const INSTRUCTION = `You are extracting medical-device usage from a surgery-center Point-of-Use compliance form.
Staff peel device labels (stickers) off product boxes and affix them to this sheet after a procedure.

Extract:
- Form header: center_hint, procedure_date (YYYY-MM-DD), patient_ref, form_id.
- Every device sticker as one row in "devices" with: raw_sticker_text (verbatim), product_name,
  manufacturer, ref (the catalog/REF number), udi_or_barcode, lot, qty (default 1), and a confidence 0..1.

Rules:
- Read the text and any barcodes exactly as printed. DO NOT invent or guess UDIs, REF numbers, or lot
  numbers. If a value is unreadable, set it to null.
- Add a short note to "uncertain" for anything you could not read confidently (blur, glare, handwriting,
  overlapping stickers).
- Return ONLY JSON matching this shape:
{
  "center_hint": string|null,
  "procedure_date": "YYYY-MM-DD"|null,
  "patient_ref": string|null,
  "form_id": string|null,
  "devices": [{
    "raw_sticker_text": string,
    "product_name": string|null,
    "manufacturer": string|null,
    "ref": string|null,
    "udi_or_barcode": string|null,
    "lot": string|null,
    "qty": number,
    "confidence": number
  }],
  "uncertain": string[]
}`

export type ExtractInput = {
  base64: string
  mimeType: string
  sourceFile: string
  // Optional decoded barcodes from a prepass; passed to the model as ground truth.
  knownBarcodes?: string[]
}

function barcodeHint(knownBarcodes?: string[]) {
  if (!knownBarcodes || knownBarcodes.length === 0) return ""
  return `\n\nKnown barcodes decoded from the image (use verbatim for udi_or_barcode when they match a sticker; do not alter them):\n${knownBarcodes.join("\n")}`
}

function parseExtractionJson(text: string, sourceFile: string): Extraction {
  let json: unknown
  try {
    // Some models wrap JSON in markdown fences.
    const trimmed = text.trim()
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
    json = JSON.parse(fenced ? fenced[1].trim() : trimmed)
  } catch {
    throw new Error("Model did not return valid JSON.")
  }
  const parsed = modelExtractionSchema.parse(json)
  return {
    ...parsed,
    source_file: sourceFile,
    extracted_at: new Date().toISOString(),
  }
}

async function extractViaOpenRouter(input: ExtractInput): Promise<Extraction> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.")

  if (input.mimeType === "application/pdf") {
    throw new Error(
      "OpenRouter extract supports images only. Upload a PNG/JPEG or set GEMINI_API_KEY for PDF.",
    )
  }

  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL
  const dataUrl = `data:${input.mimeType};base64,${input.base64}`
  const prompt = INSTRUCTION + barcodeHint(input.knownBarcodes)

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Wardline scan demo",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  })

  const payload = (await response.json()) as {
    error?: { message?: string }
    choices?: { message?: { content?: string | null } }[]
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenRouter error (${response.status})`)
  }

  const text = payload.choices?.[0]?.message?.content
  if (!text) throw new Error("Empty response from OpenRouter.")
  return parseExtractionJson(text, input.sourceFile)
}

async function extractViaGemini(input: ExtractInput): Promise<Extraction> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to demo/.env.local (spike / sanitized data only).",
    )
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const ai = new GoogleGenAI({ apiKey })

  const response = await ai.models.generateContent({
    model,
    contents: [
      createPartFromText(INSTRUCTION + barcodeHint(input.knownBarcodes)),
      createPartFromBase64(input.base64, input.mimeType),
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema,
      temperature: 0,
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
    },
  })

  const text = response.text
  if (!text) throw new Error("Empty response from Gemini.")
  return parseExtractionJson(text, input.sourceFile)
}

export async function extractFromMedia(input: ExtractInput): Promise<Extraction> {
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY)
  const hasGemini = Boolean(process.env.GEMINI_API_KEY)

  // Images: OpenRouter only when configured (no AI Studio fallback — client retries).
  // PDFs: Gemini only (OpenRouter vision path is image data-URLs).
  if (input.mimeType === "application/pdf") {
    if (!hasGemini) {
      throw new Error(
        "PDF extract requires GEMINI_API_KEY (OpenRouter path supports images only).",
      )
    }
    return extractViaGemini(input)
  }

  if (hasOpenRouter) {
    return extractViaOpenRouter(input)
  }

  if (hasGemini) {
    return extractViaGemini(input)
  }

  throw new Error(
    "No extract provider configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in demo/.env.local.",
  )
}
