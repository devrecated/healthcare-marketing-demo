import { z } from "zod"

import type { Supply } from "@/lib/types"

// Shape the model returns. Unreadable scalar fields are null; anything the model
// is unsure about is also surfaced in `uncertain` so a human can check it.
export const extractedDeviceSchema = z.object({
  raw_sticker_text: z.string(),
  product_name: z.string().nullable(),
  manufacturer: z.string().nullable(),
  // Catalog / REF number printed on the sticker. Maps to our Supply.sku.
  ref: z.string().nullable(),
  udi_or_barcode: z.string().nullable(),
  lot: z.string().nullable(),
  qty: z.number().int().min(1),
  confidence: z.number().min(0).max(1),
})
export type ExtractedDevice = z.infer<typeof extractedDeviceSchema>

// What the model is asked to produce (no server-added metadata yet).
export const modelExtractionSchema = z.object({
  center_hint: z.string().nullable(),
  procedure_date: z.string().nullable(), // YYYY-MM-DD
  patient_ref: z.string().nullable(),
  form_id: z.string().nullable(),
  devices: z.array(extractedDeviceSchema),
  uncertain: z.array(z.string()),
})
export type ModelExtraction = z.infer<typeof modelExtractionSchema>

// Full record persisted / returned by the API (adds provenance).
export const extractionSchema = modelExtractionSchema.extend({
  source_file: z.string(),
  extracted_at: z.string(),
})
export type Extraction = z.infer<typeof extractionSchema>

// --- Supply matching -------------------------------------------------------

export type SupplyMatch = {
  supply: Supply
  method: "sku" | "name"
  score: number
}

export function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "")
}

export function tokenScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  const at = new Set(a.split(" ").filter(Boolean))
  const bt = new Set(b.split(" ").filter(Boolean))
  if (at.size === 0 || bt.size === 0) return 0
  let inter = 0
  for (const t of at) if (bt.has(t)) inter += 1
  const union = new Set([...at, ...bt]).size
  return union ? inter / union : 0
}

// Resolve an extracted device to a Supply row: exact REF/SKU first, then a
// fuzzy product-name match. Returns null when nothing is confident enough.
export function matchDeviceToSupply(
  device: Pick<ExtractedDevice, "ref" | "product_name">,
  supplies: Supply[],
  minNameScore = 0.5,
): SupplyMatch | null {
  const ref = normalize(device.ref)
  if (ref) {
    const bySku = supplies.find((supply) => normalize(supply.sku) === ref)
    if (bySku) return { supply: bySku, method: "sku", score: 1 }
  }

  const name = normalize(device.product_name)
  if (name) {
    let best: SupplyMatch | null = null
    for (const supply of supplies) {
      const score = tokenScore(name, normalize(supply.name))
      if (score > 0 && (!best || score > best.score)) {
        best = { supply, method: "name", score }
      }
    }
    if (best && best.score >= minNameScore) return best
  }

  return null
}
