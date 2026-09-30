// Generate synthetic MSP device-usage compliance forms (SVG -> PNG).
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
    patientRef: "MSP-RVA-4471",
    formId: "PU-2026-0912",
    devices: [
      { name: "Total knee implant set", mfr: "ZimVie", ref: "IMP-KNEE-01", udi: "(01)00841234567890", lot: "KNE-4471", qty: 1 },
      { name: "Bone cement", mfr: "Stryker", ref: "CON-CEM-04", udi: "(01)00849876543210", lot: "CEM-2231", qty: 2 },
      { name: "Orthopedic drape pack", mfr: "Medline", ref: "CON-DRP-12", udi: "(01)00847778889990", lot: "DRP-8890", qty: 1 },
    ],
  },
  {
    file: "form-baltimore-cataract",
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
    file: "form-nova-hernia",
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

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function barcode(x, y, seed) {
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

function sticker(d, x, y, w) {
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${w}" height="120" rx="6" fill="#fffdf5" stroke="#c9c2ad" stroke-width="1.5"/>
      <rect x="0" y="0" width="${w}" height="22" rx="6" fill="#eef1e6"/>
      <text x="10" y="15" font-family="Helvetica, Arial" font-size="11" font-weight="bold" fill="#333">DEVICE LABEL — PEEL &amp; AFFIX</text>
      <text x="10" y="42" font-family="Helvetica, Arial" font-size="14" font-weight="bold" fill="#111">${esc(d.name)}</text>
      <text x="10" y="60" font-family="Helvetica, Arial" font-size="11" fill="#444">Mfr: ${esc(d.mfr)}   REF: ${esc(d.ref)}</text>
      <text x="10" y="76" font-family="Courier, monospace" font-size="11" fill="#111">UDI ${esc(d.udi)}</text>
      <text x="10" y="92" font-family="Courier, monospace" font-size="11" fill="#111">LOT ${esc(d.lot)}    QTY ${d.qty}</text>
      ${barcode(10, 98, d.udi)}
      <text x="${w - 10}" y="112" text-anchor="end" font-family="Courier, monospace" font-size="9" fill="#666">${esc(d.udi.replace(/\D/g, ""))}</text>
    </g>`
}

function buildSvg(form) {
  const W = 720
  const H = 960
  let y = 150
  const stickers = form.devices
    .map((d) => {
      const s = sticker(d, 40, y, W - 80)
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
