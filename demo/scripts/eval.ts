/**
 * Extraction eval: run the Gemini extractor over fixtures/forms/* and compare
 * against the hand-labeled fixtures/golden/*.json.
 *
 * Reports device-ID recall (UDI/REF), fuzzy product-name match, qty accuracy,
 * missing/extra devices, and header field accuracy. Honest about failures.
 *
 * Run: pnpm eval   (needs GEMINI_API_KEY in demo/.env.local; sanitized data only)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { extractFromMedia } from "@/lib/gemini"
import { digitsOnly, normalize, tokenScore } from "@/lib/extraction"
import { seedState } from "@/lib/seed"
import { matchDeviceToSupply } from "@/lib/extraction"

const here = dirname(fileURLToPath(import.meta.url))
const demoRoot = join(here, "..")
const formsDir = join(demoRoot, "fixtures", "forms")
const goldenDir = join(demoRoot, "fixtures", "golden")

const DEVICE_ID_RECALL_TARGET = 0.9
const NAME_MATCH_MIN = 0.6

type GoldenDevice = {
  product_name: string | null
  manufacturer: string | null
  ref: string | null
  udi_or_barcode: string | null
  lot: string | null
  qty: number
}
type Golden = {
  center_hint: string | null
  procedure_date: string | null
  patient_ref: string | null
  form_id: string | null
  devices: GoldenDevice[]
}

// Minimal .env.local loader (no dependency; never prints values).
function loadEnvLocal() {
  const envPath = join(demoRoot, ".env.local")
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key && !process.env[key]) process.env[key] = value
  }
}

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".pdf"]
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
}

function findImageFor(base: string): string | null {
  for (const ext of IMAGE_EXTS) {
    const candidate = join(formsDir, base + ext)
    if (existsSync(candidate)) return candidate
  }
  return null
}

type ExtractedDevice = {
  product_name: string | null
  ref: string | null
  udi_or_barcode: string | null
  lot: string | null
  qty: number
}

function findMatch(gold: GoldenDevice, devices: ExtractedDevice[]) {
  const gUdi = digitsOnly(gold.udi_or_barcode)
  const gRef = normalize(gold.ref)
  const gName = normalize(gold.product_name)

  const byUdi = gUdi ? devices.find((d) => digitsOnly(d.udi_or_barcode) === gUdi) : undefined
  if (byUdi) return { device: byUdi, by: "udi" as const }
  const byRef = gRef ? devices.find((d) => normalize(d.ref) === gRef) : undefined
  if (byRef) return { device: byRef, by: "ref" as const }
  const byName = gName
    ? devices.find((d) => tokenScore(gName, normalize(d.product_name)) >= NAME_MATCH_MIN)
    : undefined
  if (byName) return { device: byName, by: "name" as const }
  return null
}

async function main() {
  loadEnvLocal()
  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY not set — add it to demo/.env.local to run the eval. Skipping.")
    process.exit(0)
  }

  const supplies = seedState().supplies
  const goldenFiles = existsSync(goldenDir)
    ? readdirSync(goldenDir).filter((f) => f.endsWith(".json"))
    : []
  if (goldenFiles.length === 0) {
    console.log("No golden files in fixtures/golden. Nothing to eval.")
    process.exit(0)
  }

  let totalGolden = 0
  let idRecalled = 0
  let nameMatched = 0
  let qtyCorrect = 0
  let extraTotal = 0
  let supplyResolved = 0
  let headerFormId = 0
  let headerDate = 0
  let filesScored = 0

  for (const gf of goldenFiles) {
    const base = gf.replace(/\.json$/, "")
    const imagePath = findImageFor(base)
    if (!imagePath) {
      console.log(`- ${base}: SKIP (no image in fixtures/forms)`)
      continue
    }
    const gold = JSON.parse(readFileSync(join(goldenDir, gf), "utf8")) as Golden
    const ext = imagePath.slice(imagePath.lastIndexOf("."))
    const bytes = readFileSync(imagePath)

    let result
    try {
      result = await extractFromMedia({
        base64: bytes.toString("base64"),
        mimeType: MIME[ext] ?? "image/png",
        sourceFile: base + ext,
      })
    } catch (error) {
      console.log(`- ${base}: ERROR ${(error as Error).message}`)
      continue
    }

    filesScored += 1
    const devices = result.devices as ExtractedDevice[]
    const matchedExtracted = new Set<ExtractedDevice>()
    let fileId = 0
    let fileName = 0
    let fileQty = 0

    for (const gd of gold.devices) {
      totalGolden += 1
      const m = findMatch(gd, devices)
      if (m) {
        matchedExtracted.add(m.device)
        if (m.by === "udi" || m.by === "ref") {
          idRecalled += 1
          fileId += 1
        }
        if (tokenScore(normalize(gd.product_name), normalize(m.device.product_name)) >= NAME_MATCH_MIN) {
          nameMatched += 1
          fileName += 1
        }
        if (m.device.qty === gd.qty) {
          qtyCorrect += 1
          fileQty += 1
        }
      }
      if (matchDeviceToSupply(gd, supplies)) supplyResolved += 1
    }

    const extra = devices.filter((d) => !matchedExtracted.has(d)).length
    extraTotal += extra
    if (normalize(result.form_id) === normalize(gold.form_id)) headerFormId += 1
    if ((result.procedure_date ?? "") === (gold.procedure_date ?? "")) headerDate += 1

    console.log(
      `- ${base}: devices ${devices.length}/${gold.devices.length} | id ${fileId}/${gold.devices.length} | name ${fileName}/${gold.devices.length} | qty ${fileQty}/${gold.devices.length} | extra ${extra}`,
    )
    if (result.uncertain.length > 0) console.log(`    uncertain: ${result.uncertain.join("; ")}`)
  }

  if (totalGolden === 0) {
    console.log("No devices scored.")
    process.exit(0)
  }

  const idRecall = idRecalled / totalGolden
  const nameRate = nameMatched / totalGolden
  const qtyRate = qtyCorrect / totalGolden
  const supplyRate = supplyResolved / totalGolden

  console.log("\n=== Eval summary ===")
  console.log(`Files scored:        ${filesScored}/${goldenFiles.length}`)
  console.log(`Golden devices:      ${totalGolden}`)
  console.log(`Device-ID recall:    ${(idRecall * 100).toFixed(1)}%  (target >= ${DEVICE_ID_RECALL_TARGET * 100}%)`)
  console.log(`Product-name match:  ${(nameRate * 100).toFixed(1)}%`)
  console.log(`Qty accuracy:        ${(qtyRate * 100).toFixed(1)}%`)
  console.log(`Resolves to Supply:  ${(supplyRate * 100).toFixed(1)}%`)
  console.log(`Extra (hallucinated) devices: ${extraTotal}`)
  console.log(`Header form_id:      ${headerFormId}/${filesScored}`)
  console.log(`Header date:         ${headerDate}/${filesScored}`)

  const pass = idRecall >= DEVICE_ID_RECALL_TARGET && extraTotal === 0
  console.log(`\nResult: ${pass ? "PASS" : "BELOW TARGET"}`)
  process.exit(pass ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
