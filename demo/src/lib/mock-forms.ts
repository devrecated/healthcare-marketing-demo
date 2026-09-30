/** Synthetic Point-of-Use compliance forms for the intake demo. No PHI. */

export type MockDevice = {
  name: string
  mfr: string
  ref: string
  udi: string
  lot: string
  qty: number
}

export type MockFormSpec = {
  id: string
  file: string
  label: string
  center: string
  date: string
  patientRef: string
  formId: string
  devices: MockDevice[]
}

export const MOCK_FORM_CATALOG: MockFormSpec[] = [
  {
    id: "richmond-knee",
    file: "form-richmond-knee",
    label: "Richmond — knee",
    center: "Richmond Surgery Center",
    date: "2026-09-22",
    patientRef: "MSP-RVA-4471",
    formId: "PU-2026-0912",
    devices: [
      { name: "Total knee implant set", mfr: "ZimVie", ref: "IMP-KNEE-01", udi: "(01)00841234567890", lot: "KNE-4471", qty: 1 },
      { name: "Bone cement", mfr: "Stryker", ref: "CON-CEM-04", udi: "(01)00849876543210", lot: "CEM-2231", qty: 2 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889990", lot: "DRP-8890", qty: 1 },
    ],
  },
  {
    id: "baltimore-cataract",
    file: "form-baltimore-cataract",
    label: "Baltimore — cataract",
    center: "Baltimore Surgery Center",
    date: "2026-09-23",
    patientRef: "MSP-BAL-1120",
    formId: "PU-2026-0913",
    devices: [
      { name: "Intraocular lens", mfr: "Alcon", ref: "IMP-IOL-21", udi: "(01)00843216549870", lot: "IOL-1120", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889990", lot: "DRP-8891", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443330", lot: "VIC-3300", qty: 1 },
    ],
  },
  {
    id: "nova-hernia",
    file: "form-nova-hernia",
    label: "NoVA — hernia",
    center: "Northern Virginia Surgery Center",
    date: "2026-09-24",
    patientRef: "MSP-NOVA-1550",
    formId: "PU-2026-0914",
    devices: [
      { name: "Hernia mesh 15cm", mfr: "Bard", ref: "IMP-MSH-15", udi: "(01)00841112223330", lot: "MSH-1550", qty: 1 },
      { name: "Laparoscopic clip applier", mfr: "Teleflex", ref: "CON-CLIP-2", udi: "(01)00846667778880", lot: "CLIP-0202", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334440", lot: "GAU-4004", qty: 3 },
    ],
  },
]

export const MOCK_CENTERS = [
  "Richmond Surgery Center",
  "Baltimore Surgery Center",
  "Northern Virginia Surgery Center",
  "Virginia Beach Surgery Center",
] as const

function esc(value: string) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function barcode(x: number, y: number, seed: string) {
  const digits = seed.replace(/\D/g, "").padEnd(24, "1")
  let out = ""
  let cursor = x
  for (let i = 0; i < digits.length; i++) {
    const w = 1 + (Number(digits[i]) % 3)
    if (i % 2 === 0) out += `<rect x="${cursor}" y="${y}" width="${w}" height="34" fill="#111"/>`
    cursor += w + 1
  }
  return out
}

function sticker(device: MockDevice, x: number, y: number, w: number) {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="120" rx="6" fill="#fffdf5" stroke="#c9c2ad" stroke-width="1.5"/>
      <rect x="0" y="0" width="${w}" height="22" rx="6" fill="#eef1e6"/>
      <text x="10" y="15" font-family="Helvetica, Arial" font-size="11" font-weight="bold" fill="#333">DEVICE LABEL — PEEL &amp; AFFIX</text>
      <text x="10" y="42" font-family="Helvetica, Arial" font-size="14" font-weight="bold" fill="#111">${esc(device.name)}</text>
      <text x="10" y="60" font-family="Helvetica, Arial" font-size="11" fill="#444">Mfr: ${esc(device.mfr)}   REF: ${esc(device.ref)}</text>
      <text x="10" y="76" font-family="Courier, monospace" font-size="11" fill="#111">UDI ${esc(device.udi)}</text>
      <text x="10" y="92" font-family="Courier, monospace" font-size="11" fill="#111">LOT ${esc(device.lot)}    QTY ${device.qty}</text>
      ${barcode(10, 98, device.udi)}
      <text x="${w - 10}" y="112" text-anchor="end" font-family="Courier, monospace" font-size="9" fill="#666">${esc(device.udi.replace(/\D/g, ""))}</text>
    </g>`
}

export const FORM_WIDTH = 720
export const FORM_HEIGHT = 960

export function buildFormSvg(form: Omit<MockFormSpec, "id" | "file" | "label">) {
  const W = FORM_WIDTH
  const H = FORM_HEIGHT
  let y = 150
  const stickers = form.devices
    .map((device) => {
      const s = sticker(device, 40, y, W - 80)
      y += 140
      return s
    })
    .join("")
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#999" stroke-width="1"/>
  <text x="40" y="55" font-family="Helvetica, Arial" font-size="20" font-weight="bold" fill="#1c2b1c">Mountain Spring Podiatry</text>
  <text x="40" y="78" font-family="Helvetica, Arial" font-size="14" fill="#444">Point-of-Use Device Compliance Form (SYNTHETIC — no PHI)</text>
  <line x1="40" y1="92" x2="${W - 40}" y2="92" stroke="#ccc" stroke-width="1"/>
  <text x="40" y="118" font-family="Helvetica, Arial" font-size="12" fill="#222">Center: ${esc(form.center)}      Procedure date: ${esc(form.date)}</text>
  <text x="40" y="136" font-family="Helvetica, Arial" font-size="12" fill="#222">Patient ref: ${esc(form.patientRef)}      Form ID: ${esc(form.formId)}</text>
  ${stickers}
  <text x="40" y="${H - 40}" font-family="Helvetica, Arial" font-size="10" fill="#888">Staff affix device labels above after each procedure. Scan and submit to inventory manager.</text>
</svg>`
}

export function mockPublicPath(fileBase: string) {
  return `/fixtures/forms/${fileBase}.png`
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function todayStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Build a random synthetic form from inventory supplies (or catalog fallback). */
export function buildRandomFormSpec(
  supplies: { name: string; sku: string }[],
): Omit<MockFormSpec, "id" | "file" | "label"> & { file: string } {
  const pool =
    supplies.length > 0
      ? supplies.map((supply, index) => ({
          name: supply.name,
          mfr: "Demo Mfr",
          ref: supply.sku,
          udi: `(01)0084${String(1000000000 + index).slice(0, 10)}`,
          lot: `LOT-${supply.sku.slice(-4)}-${Math.floor(Math.random() * 9000 + 1000)}`,
          qty: 1 + Math.floor(Math.random() * 2),
        }))
      : MOCK_FORM_CATALOG.flatMap((form) => form.devices)

  const count = Math.min(3, Math.max(1, pool.length))
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count)
  const center = MOCK_CENTERS[Math.floor(Math.random() * MOCK_CENTERS.length)]
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  return {
    file: `form-generated-${stamp.toLowerCase()}`,
    center,
    date: todayStamp(),
    patientRef: `MSP-SYN-${stamp}`,
    formId: `PU-GEN-${stamp}`,
    devices: shuffled,
  }
}

/** Browser-only: rasterize SVG → PNG File for upload to /api/extract. */
export async function svgToPngFile(svg: string, filename: string): Promise<File> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = "async"
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error("Could not render mock form SVG"))
      img.src = url
    })
    const canvas = document.createElement("canvas")
    canvas.width = FORM_WIDTH
    canvas.height = FORM_HEIGHT
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas unavailable")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, FORM_WIDTH, FORM_HEIGHT)
    ctx.drawImage(img, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("PNG encode failed"))), "image/png")
    })
    return new File([png], filename.endsWith(".png") ? filename : `${filename}.png`, {
      type: "image/png",
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Fetch a prebuilt fixture from /public/fixtures/forms. */
export async function fetchMockFormFile(fileBase: string): Promise<File> {
  const res = await fetch(mockPublicPath(fileBase))
  if (!res.ok) throw new Error(`Mock image missing (${fileBase}). Run pnpm fixtures.`)
  const blob = await res.blob()
  return new File([blob], `${fileBase}.png`, { type: blob.type || "image/png" })
}
