/**
 * Writes solid spruce PWA icons with a simple white camera glyph.
 * Runs on prebuild so Vercel gets real PNG icons without committing binaries.
 */
import { deflateSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, "..", "public")
mkdirSync(outDir, { recursive: true })

const BG = [0x2a, 0x4a, 0x44]
const FG = [0xf7, 0xf6, 0xf1]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function inCamera(x, y, size) {
  const s = size
  const cx = s / 2
  const cy = s * 0.52
  const bodyW = s * 0.54
  const bodyH = s * 0.38
  const left = cx - bodyW / 2
  const top = cy - bodyH / 2
  const right = left + bodyW
  const bottom = top + bodyH
  const radius = s * 0.04
  const insideBody =
    x >= left &&
    x <= right &&
    y >= top &&
    y <= bottom &&
    !(x < left + radius && y < top + radius && (left + radius - x) ** 2 + (top + radius - y) ** 2 > radius ** 2) &&
    !(x > right - radius && y < top + radius && (x - (right - radius)) ** 2 + (top + radius - y) ** 2 > radius ** 2) &&
    !(x < left + radius && y > bottom - radius && (left + radius - x) ** 2 + (y - (bottom - radius)) ** 2 > radius ** 2) &&
    !(x > right - radius && y > bottom - radius && (x - (right - radius)) ** 2 + (y - (bottom - radius)) ** 2 > radius ** 2)

  const stroke = s * 0.028
  const onBodyStroke =
    x >= left - stroke &&
    x <= right + stroke &&
    y >= top - stroke &&
    y <= bottom + stroke &&
    !(x > left + stroke && x < right - stroke && y > top + stroke && y < bottom - stroke)

  const lensR = s * 0.12
  const lensDist = Math.hypot(x - cx, y - cy)
  const onLens = Math.abs(lensDist - lensR) < stroke
  const inLensHole = lensDist < lensR - stroke

  const bumpW = s * 0.22
  const bumpH = s * 0.08
  const bumpLeft = cx - bumpW / 2
  const bumpTop = top - bumpH
  const onBump =
    x >= bumpLeft &&
    x <= bumpLeft + bumpW &&
    y >= bumpTop &&
    y <= top &&
    (x <= bumpLeft + stroke ||
      x >= bumpLeft + bumpW - stroke ||
      y <= bumpTop + stroke ||
      (y >= top - stroke && y <= top))

  if (onLens) return true
  if (inLensHole) return false
  if (onBump) return true
  if (onBodyStroke) return true
  if (insideBody) return false
  return false
}

function writePng(size, fileName) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = inCamera(x + 0.5, y + 0.5, size) ? FG : BG
      const i = 1 + x * 3
      row[i] = r
      row[i + 1] = g
      row[i + 2] = b
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
  writeFileSync(join(outDir, fileName), png)
  console.log("wrote", fileName)
}

writePng(192, "pwa-192.png")
writePng(512, "pwa-512.png")
