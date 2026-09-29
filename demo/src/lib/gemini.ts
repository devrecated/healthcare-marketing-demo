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
- Return ONLY JSON matching the provided schema.`

export type ExtractInput = {
  base64: string
  mimeType: string
  sourceFile: string
  // Optional decoded barcodes from a prepass; passed to the model as ground truth.
  knownBarcodes?: string[]
}

export async function extractFromMedia(input: ExtractInput): Promise<Extraction> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to demo/.env.local (spike / sanitized data only).",
    )
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
  const ai = new GoogleGenAI({ apiKey })

  const barcodeHint =
    input.knownBarcodes && input.knownBarcodes.length > 0
      ? `\n\nKnown barcodes decoded from the image (use verbatim for udi_or_barcode when they match a sticker; do not alter them):\n${input.knownBarcodes.join("\n")}`
      : ""

  const response = await ai.models.generateContent({
    model,
    // Text before image per docs guidance; high media resolution for fine sticker text.
    contents: [
      createPartFromText(INSTRUCTION + barcodeHint),
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

  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("Gemini did not return valid JSON.")
  }

  const parsed = modelExtractionSchema.parse(json)
  return {
    ...parsed,
    source_file: input.sourceFile,
    extracted_at: new Date().toISOString(),
  }
}
