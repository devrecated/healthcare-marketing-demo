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
    patientRef: "ACME-RVA-4471",
    formId: "PU-2026-0912",
    devices: [
      { name: "Total knee implant set", mfr: "ZimVie", ref: "IMP-KNEE-01", udi: "(01)00841234567890", lot: "KNE-4471", qty: 1 },
      { name: "Bone cement", mfr: "Stryker", ref: "CON-CEM-04", udi: "(01)00849876543210", lot: "CEM-2231", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889990", lot: "DRP-8890", qty: 1 },
      { name: "Sterile gloves, size 7", mfr: "Medline", ref: "PPE-GLV-7", udi: "(01)00841110002220", lot: "GLV-7701", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443330", lot: "VIC-4471", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334440", lot: "GAU-4471", qty: 1 },
      { name: "Bone cement", mfr: "Stryker", ref: "CON-CEM-04", udi: "(01)00849876543211", lot: "CEM-2232", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443331", lot: "VIC-4472", qty: 1 },
      { name: "Sterile gloves, size 7", mfr: "Medline", ref: "PPE-GLV-7", udi: "(01)00841110002221", lot: "GLV-7702", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334441", lot: "GAU-4472", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889991", lot: "DRP-8891", qty: 1 },
      { name: "Propofol 20ml", mfr: "Fresenius", ref: "MED-PRO-20", udi: "(01)00843334445550", lot: "PRO-4471", qty: 1 },
    ],
  },
  {
    id: "baltimore-cataract",
    file: "form-baltimore-cataract",
    label: "Baltimore — cataract",
    center: "Baltimore Surgery Center",
    date: "2026-09-23",
    patientRef: "ACME-BAL-1120",
    formId: "PU-2026-0913",
    devices: [
      { name: "Intraocular lens", mfr: "Alcon", ref: "IMP-IOL-21", udi: "(01)00843216549870", lot: "IOL-1120", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889990", lot: "DRP-8891", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443330", lot: "VIC-3300", qty: 1 },
      { name: "Bone cement", mfr: "Stryker", ref: "CON-CEM-04", udi: "(01)00849876543210", lot: "CEM-1120", qty: 1 },
      { name: "Sterile gloves, size 7", mfr: "Medline", ref: "PPE-GLV-7", udi: "(01)00841110002220", lot: "GLV-1120", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334440", lot: "GAU-1120", qty: 1 },
      { name: "Intraocular lens", mfr: "Alcon", ref: "IMP-IOL-21", udi: "(01)00843216549871", lot: "IOL-1121", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443332", lot: "VIC-3301", qty: 1 },
      { name: "Sterile gloves, size 7", mfr: "Medline", ref: "PPE-GLV-7", udi: "(01)00841110002222", lot: "GLV-1121", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334442", lot: "GAU-1121", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889992", lot: "DRP-8892", qty: 1 },
      { name: "Propofol 20ml", mfr: "Fresenius", ref: "MED-PRO-20", udi: "(01)00843334445551", lot: "PRO-1120", qty: 1 },
    ],
  },
  {
    id: "nova-hernia",
    file: "form-nova-hernia",
    label: "NoVA — hernia",
    center: "Northern Virginia Surgery Center",
    date: "2026-09-24",
    patientRef: "ACME-NOVA-1550",
    formId: "PU-2026-0914",
    devices: [
      { name: "Hernia mesh 15cm", mfr: "Bard", ref: "IMP-MSH-15", udi: "(01)00841112223330", lot: "MSH-1550", qty: 1 },
      { name: "Laparoscopic clip applier", mfr: "Teleflex", ref: "CON-CLIP-2", udi: "(01)00846667778880", lot: "CLIP-0202", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334440", lot: "GAU-4004", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889990", lot: "DRP-1550", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443330", lot: "VIC-1550", qty: 1 },
      { name: "Sterile gloves, size 7", mfr: "Medline", ref: "PPE-GLV-7", udi: "(01)00841110002220", lot: "GLV-1550", qty: 1 },
      { name: "Laparoscopic clip applier", mfr: "Teleflex", ref: "CON-CLIP-2", udi: "(01)00846667778881", lot: "CLIP-0203", qty: 1 },
      { name: "Vicryl suture 3-0", mfr: "Ethicon", ref: "SUT-VIC-30", udi: "(01)00845554443333", lot: "VIC-1551", qty: 1 },
      { name: "Gauze sponges", mfr: "Medline", ref: "CON-GAU-4", udi: "(01)00842223334443", lot: "GAU-4005", qty: 1 },
      { name: "Sterile gloves, size 7", mfr: "Medline", ref: "PPE-GLV-7", udi: "(01)00841110002223", lot: "GLV-1551", qty: 1 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889993", lot: "DRP-1551", qty: 1 },
      { name: "Propofol 20ml", mfr: "Fresenius", ref: "MED-PRO-20", udi: "(01)00843334445552", lot: "PRO-1550", qty: 1 },
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

const STICKER_COLS = 2
const STICKERS_PER_PAGE = 12
const STICKER_GAP = 10
const STICKER_H = 108
const MARGIN_X = 36
const GRID_TOP = 148

/** Decorative barcode: skinny bars, tight gaps, natural width (not stretched). */
function barcode(centerX: number, y: number, seed: string, height: number) {
  const digits = seed.replace(/\D/g, "").padEnd(16, "1").slice(0, 16)
  const bars = [...digits].map((d) => 1.35 + (Number(d) % 3) * 0.55)
  const gap = 1.1
  const totalWidth = bars.reduce((sum, w) => sum + w + gap, 0) - gap
  let cursor = centerX - totalWidth / 2
  let out = ""
  for (const w of bars) {
    out += `<rect x="${cursor.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${height}" fill="#111"/>`
    cursor += w + gap
  }
  return out
}

function sticker(device: MockDevice, x: number, y: number, w: number) {
  const barcodeY = 30
  const barcodeH = 44
  const digits = device.udi.replace(/\D/g, "")
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="${STICKER_H}" rx="5" fill="#fffdf5" stroke="#c9c2ad" stroke-width="1"/>
      <text x="${w / 2}" y="20" text-anchor="middle" font-family="Helvetica, Arial" font-size="12" font-weight="bold" fill="#111">${esc(device.name)}</text>
      ${barcode(w / 2, barcodeY, device.udi, barcodeH)}
      <text x="${w / 2}" y="${STICKER_H - 12}" text-anchor="middle" font-family="Courier, monospace" font-size="10" fill="#444">${esc(digits)}</text>
    </g>`
}

export const FORM_WIDTH = 720
export const FORM_HEIGHT = 960

export function buildFormSvg(form: Omit<MockFormSpec, "id" | "file" | "label">) {
  const W = FORM_WIDTH
  const H = FORM_HEIGHT
  const usable = W - MARGIN_X * 2
  const stickerW = (usable - STICKER_GAP * (STICKER_COLS - 1)) / STICKER_COLS
  const stickers = form.devices
    .map((device, index) => {
      const col = index % STICKER_COLS
      const row = Math.floor(index / STICKER_COLS)
      const x = MARGIN_X + col * (stickerW + STICKER_GAP)
      const y = GRID_TOP + row * (STICKER_H + STICKER_GAP)
      return sticker(device, x, y, stickerW)
    })
    .join("")
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#999" stroke-width="1"/>
  <text x="40" y="52" font-family="Helvetica, Arial" font-size="22" font-weight="bold" fill="#1c2b1c">Acme Healthcare</text>
  <text x="40" y="76" font-family="Helvetica, Arial" font-size="15" fill="#444">Point-of-Use Device Compliance Form (SYNTHETIC — no PHI)</text>
  <line x1="40" y1="90" x2="${W - 40}" y2="90" stroke="#ccc" stroke-width="1"/>
  <text x="40" y="118" font-family="Helvetica, Arial" font-size="14" fill="#222">Center: ${esc(form.center)}      Procedure date: ${esc(form.date)}</text>
  <text x="40" y="140" font-family="Helvetica, Arial" font-size="14" fill="#222">Patient ref: ${esc(form.patientRef)}      Form ID: ${esc(form.formId)}</text>
  ${stickers}
  <text x="40" y="${H - 36}" font-family="Helvetica, Arial" font-size="12" fill="#888">Staff affix device labels above after each procedure. Scan and submit to inventory manager.</text>
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
          qty: 1,
        }))
      : MOCK_FORM_CATALOG.flatMap((form) => form.devices)

  // Twelve stickers fill the 2×6 grid on a generated form (sample with replacement if needed).
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  const picked: MockDevice[] = []
  while (picked.length < STICKERS_PER_PAGE && shuffled.length > 0) {
    const base = shuffled[picked.length % shuffled.length]!
    picked.push({
      ...base,
      qty: 1,
      lot: `LOT-${base.ref.slice(-4)}-${Math.floor(Math.random() * 9000 + 1000)}`,
      udi: `${base.udi.slice(0, -1)}${picked.length % 10}`,
    })
  }
  const center = MOCK_CENTERS[Math.floor(Math.random() * MOCK_CENTERS.length)]
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  return {
    file: `form-generated-${stamp.toLowerCase()}`,
    center,
    date: todayStamp(),
    patientRef: `ACME-SYN-${stamp}`,
    formId: `PU-GEN-${stamp}`,
    devices: picked,
  }
}

/** Encode SVG for <img src> / Image() — more reliable than blob URLs in some browsers. */
export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** Browser-only: rasterize SVG → PNG File for upload to /api/extract. */
export async function svgToPngFile(svg: string, filename: string): Promise<File> {
  const canvas = await svgToCanvas(svg)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("PNG encode failed"))), "image/png")
  })
  return new File([png], filename.endsWith(".png") ? filename : `${filename}.png`, {
    type: "image/png",
  })
}

async function svgToCanvas(svg: string): Promise<HTMLCanvasElement> {
  const url = svgDataUrl(svg)
  const img = new Image()
  img.decoding = "async"
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Timed out rendering mock form SVG")), 8000)
    img.onload = () => {
      window.clearTimeout(timer)
      resolve()
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      reject(new Error("Could not render mock form SVG"))
    }
    img.src = url
  })
  const canvas = document.createElement("canvas")
  canvas.width = FORM_WIDTH
  canvas.height = FORM_HEIGHT
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, FORM_WIDTH, FORM_HEIGHT)
  ctx.drawImage(img, 0, 0, FORM_WIDTH, FORM_HEIGHT)
  return canvas
}

/** Single-page PDF of the form (same raster look as the cards). */
export async function downloadFormPdf(svg: string, filename: string): Promise<void> {
  const canvas = await svgToCanvas(svg)
  const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92)
  const jpegBase64 = jpegDataUrl.split(",")[1] ?? ""
  const jpegBytes = Uint8Array.from(atob(jpegBase64), (c) => c.charCodeAt(0))
  const pdf = buildJpegPdf(jpegBytes, FORM_WIDTH, FORM_HEIGHT)
  const pdfBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
  const blob = new Blob([pdfBuffer], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Minimal PDF wrapping one JPEG (letter-ish page scaled to image aspect). */
function buildJpegPdf(jpeg: Uint8Array, imgW: number, imgH: number): Uint8Array {
  // Fit image on a US Letter page (612×792 pt) with small margins.
  const pageW = 612
  const pageH = 792
  const margin = 24
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const scale = Math.min(maxW / imgW, maxH / imgH)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const x = (pageW - drawW) / 2
  const y = (pageH - drawH) / 2

  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let cursor = 0

  function push(bytes: Uint8Array | string) {
    const chunk = typeof bytes === "string" ? encoder.encode(bytes) : bytes
    parts.push(chunk)
    cursor += chunk.length
  }

  function startObj(id: number) {
    offsets[id] = cursor
    push(`${id} 0 obj\n`)
  }

  function endObj() {
    push("\nendobj\n")
  }

  push("%PDF-1.4\n")

  startObj(1)
  push("<< /Type /Catalog /Pages 2 0 R >>")
  endObj()

  startObj(2)
  push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  endObj()

  startObj(3)
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
  )
  endObj()

  startObj(4)
  push(
    `<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  )
  push(jpeg)
  push("\nendstream")
  endObj()

  const content = `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`
  const contentBytes = encoder.encode(content)
  startObj(5)
  push(`<< /Length ${contentBytes.length} >>\nstream\n`)
  push(contentBytes)
  push("\nendstream")
  endObj()

  const xrefStart = cursor
  push(`xref\n0 6\n`)
  push("0000000000 65535 f \n")
  for (let id = 1; id <= 5; id++) {
    push(`${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`)
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Fetch a prebuilt fixture from /public/fixtures/forms. */
export async function fetchMockFormFile(fileBase: string): Promise<File> {
  const res = await fetch(mockPublicPath(fileBase))
  if (!res.ok) throw new Error(`Mock image missing (${fileBase}). Run pnpm fixtures.`)
  const blob = await res.blob()
  return new File([blob], `${fileBase}.png`, { type: blob.type || "image/png" })
}
