export type Supply = {
  id: string
  name: string
  category: string
  sku: string
  quantity: number
  unit: string
  reorderLevel: number
  unitCost: number
  controlled?: boolean
  lotExpiry?: string
  lastReconciledAt?: string
}

export type ExtractedDevice = {
  raw_sticker_text: string
  product_name: string | null
  manufacturer: string | null
  ref: string | null
  udi_or_barcode: string | null
  lot: string | null
  qty: number
  confidence: number
}

export type Extraction = {
  center_hint: string | null
  procedure_date: string | null
  patient_ref: string | null
  form_id: string | null
  devices: ExtractedDevice[]
  uncertain: string[]
  source_file: string
  extracted_at: string
}

export type SupplyMatch = {
  supply: Supply
  method: "sku" | "name"
  score: number
}

export function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
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
