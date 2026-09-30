# Acme Healthcare inventory scan demo

Next.js App Router demo: mock Point-of-Use forms → Gemini extract → inventory deduct.
Cross-device demo uses Supabase for shared `supplies` + `usage_log`.

## SANITIZED DATA ONLY — no PHI until Vertex + BAA

- Only upload **synthetic or fully redacted** forms.
- An AI Studio API key is **not BAA-covered**. Never send real patient forms.
- Extractor runs **server-side** (`OPENROUTER_API_KEY` / `GEMINI_API_KEY` never ship to the browser).
- Image extract prefers **OpenRouter** when configured; Gemini remains a fallback (and for PDFs).
- Phone path: one-tap **Confirm & deduct** after extract (matched SKUs only).

## Setup

1. `pnpm install` in `demo/`.
2. Copy `.env.example` → `.env.local` and fill:
   - `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` (preferred for camera/image extract)
   - `GEMINI_API_KEY` / optional `GEMINI_MODEL` (fallback; needed for PDF uploads)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only — never `NEXT_PUBLIC_`)
3. In the Supabase SQL editor, run
   [`supabase/migrations/20260930120000_scan_inventory.sql`](supabase/migrations/20260930120000_scan_inventory.sql)
   (creates tables, RLS read policies, `confirm_scan_deduction` RPC, seed rows).
4. In Supabase → Database → Replication, ensure `supplies` is enabled for Realtime
   (migration tries to add it to `supabase_realtime`).
5. `pnpm dev` — open [http://localhost:3000](http://localhost:3000) (login password shown on the login screen).

Camera capture needs **HTTPS** (or `localhost`). For a phone on the LAN, use a tunnel
(e.g. Cloudflare Tunnel / ngrok) to the Next server.

## Routes

| Path | Role |
|------|------|
| `/scan` | Camera microfrontend — capture → extract → Confirm & deduct |
| `/inventory` | Supplies (live from Supabase) |
| `/inventory/usage` | Usage log (live from Supabase) |
| `/inventory/intake` | Mock form generator / file upload spike (local approve still available) |

## Cross-device demo

1. Laptop: open `/inventory` (quantities load from Supabase).
2. Print a mock form from `/inventory/intake` (**Use this form** / **Generate random mock**).
3. Phone: same origin `/scan` → photograph the printout → review matches → **Confirm & deduct**.
4. Laptop Supplies quantities drop via Realtime (or refresh).

## Fixtures & eval

- `fixtures/forms/` — synthetic sticker sheets (UI can also generate PNGs in-browser).
- `fixtures/golden/` — hand-labeled expected extractions.
- `pnpm eval` — extractor vs golden set (needs `GEMINI_API_KEY`).
- `pnpm fixtures` — regenerate SVGs (PNG convert needs `rsvg-convert` on PATH).

## Out of scope

Athena/billing, coding AI, call-center voice, live Drive/Sheets, Document AI trainer,
Module Federation / separate MFE deploy, Vertex PHI path.
