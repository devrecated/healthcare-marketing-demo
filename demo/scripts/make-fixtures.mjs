// Generate synthetic Acme Healthcare device-usage compliance forms (SVG -> PNG).
// SANITIZED / SYNTHETIC ONLY. Writes to fixtures/forms and public/fixtures/forms
// so the intake UI can "Grab mock image" without a build step.
//
// Run: pnpm fixtures   (requires rsvg-convert on PATH)
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const formsDir = join(here, "..", "fixtures", "forms")
const publicDir = join(here, "..", "public", "fixtures", "forms")
mkdirSync(formsDir, { recursive: true })
mkdirSync(publicDir, { recursive: true })

// Keep in sync with src/lib/mock-forms.ts MOCK_FORM_CATALOG.
const forms = [
  {
    file: "form-richmond-knee",
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
    ],
  },
  {
    file: "form-baltimore-cataract",
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
    ],
  },
  {
    file: "form-nova-hernia",
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
    ],
  },
]

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

const STICKER_COLS = 2
const STICKER_GAP = 16
const STICKER_H = 180
const MARGIN_X = 40
const GRID_TOP = 160

/** Decorative barcode: skinny bars, tight gaps, natural width (not stretched). */
function barcode(centerX, y, seed, height) {
  const digits = seed.replace(/\D/g, "").padEnd(16, "1").slice(0, 16)
  const bars = [...digits].map((d) => 1.8 + (Number(d) % 3) * 0.7)
  const gap = 1.35
  const totalWidth = bars.reduce((sum, w) => sum + w + gap, 0) - gap
  let cursor = centerX - totalWidth / 2
  let out = ""
  for (const w of bars) {
    out += `<rect x="${cursor.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${height}" fill="#111"/>`
    cursor += w + gap
  }
  return out
}

function sticker(d, x, y, w) {
  const barcodeY = 58
  const barcodeH = 72
  const digits = d.udi.replace(/\D/g, "")
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="${STICKER_H}" rx="8" fill="#fffdf5" stroke="#c9c2ad" stroke-width="1.5"/>
      <text x="${w / 2}" y="36" text-anchor="middle" font-family="Helvetica, Arial" font-size="18" font-weight="bold" fill="#111">${esc(d.name)}</text>
      ${barcode(w / 2, barcodeY, d.udi, barcodeH)}
      <text x="${w / 2}" y="${STICKER_H - 22}" text-anchor="middle" font-family="Courier, monospace" font-size="13" fill="#444">${esc(digits)}</text>
    </g>`
}

function buildSvg(form) {
  const W = 720
  const H = 960
  const usable = W - MARGIN_X * 2
  const stickerW = (usable - STICKER_GAP * (STICKER_COLS - 1)) / STICKER_COLS
  const stickers = form.devices
    .map((d, index) => {
      const col = index % STICKER_COLS
      const row = Math.floor(index / STICKER_COLS)
      const x = MARGIN_X + col * (stickerW + STICKER_GAP)
      const y = GRID_TOP + row * (STICKER_H + STICKER_GAP)
      return sticker(d, x, y, stickerW)
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

let haveRsvg = true
try {
  execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" })
} catch {
  haveRsvg = false
  console.warn("rsvg-convert not found — writing .svg only (UI can still generate PNGs in-browser).")
}

for (const form of forms) {
  const svg = buildSvg(form)
  const svgPath = join(formsDir, `${form.file}.svg`)
  writeFileSync(svgPath, svg)
  if (haveRsvg) {
    const pngPath = join(formsDir, `${form.file}.png`)
    execFileSync("rsvg-convert", ["-o", pngPath, svgPath])
    copyFileSync(pngPath, join(publicDir, `${form.file}.png`))
    console.log("wrote", pngPath, "+ public copy")
  } else if (existsSync(join(formsDir, `${form.file}.png`))) {
    copyFileSync(join(formsDir, `${form.file}.png`), join(publicDir, `${form.file}.png`))
    console.log("copied existing png to public", form.file)
  } else {
    console.log("wrote", svgPath)
  }
}
