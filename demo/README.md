# Acme Healthcare inventory scan demo

Next.js App Router **host** console + Vite **scan microfrontend** (`../scan-mfe`).
Cross-device demo uses Supabase for shared `supplies` + `usage_log`.

## SANITIZED DATA ONLY — no PHI until Vertex + BAA

- Only upload **synthetic or fully redacted** forms.
- An AI Studio API key is **not BAA-covered**. Never send real patient forms.
- Extractor runs **server-side on the host** (`OPENROUTER_API_KEY` / `GEMINI_API_KEY` never ship to the browser).
- Image extract prefers **OpenRouter** when configured; Gemini remains a fallback (and for PDFs).

## Apps

| App | Path | Dev |
|-----|------|-----|
| Host console | `demo/` | `pnpm dev` → :3000 |
| Scan MFE | `scan-mfe/` | `pnpm dev` → :5173 |

### Vercel (multi-service)

Root [`vercel.json`](../vercel.json) deploys both as one project:

- `scan-mfe` public at `/scan`
- `demo` public at `/` (including `/api/*`)
- No service bindings (browser same-origin API calls)

Set host secrets (OpenRouter/Gemini/Supabase service role) on the project. You can omit
`NEXT_PUBLIC_SCAN_MFE_URL` on Vercel (defaults to `/scan`). For the MFE, omit
`VITE_API_BASE` / `VITE_HOST_URL` on Vercel (same origin). Still set
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for the scan service (or project-wide).


## Host setup

1. `pnpm install` in `demo/`.
2. Copy `.env.example` → `.env.local` and fill OpenRouter/Gemini, Supabase, and:
   - `NEXT_PUBLIC_SCAN_MFE_URL=http://localhost:5173`
3. Run the Supabase migration
   [`supabase/migrations/20260930120000_scan_inventory.sql`](supabase/migrations/20260930120000_scan_inventory.sql).
4. Ensure `supplies` (and ideally `usage_log`) are in the Realtime publication.
5. `pnpm dev` — [http://localhost:3000](http://localhost:3000) (password shown on the login screen).

## Scan MFE setup

1. `pnpm install` in `scan-mfe/`.
2. Copy `scan-mfe/.env.example` → `.env.local` (`VITE_API_BASE`, `VITE_HOST_URL`, Supabase anon).
3. `pnpm dev` — [http://localhost:5173](http://localhost:5173) (password shown on the login screen).

Host sidebar / Mock forms / Usage log open the MFE URL. `/scan` on the host redirects there.

## Cross-device demo

1. Laptop: host `/inventory`.
2. Print a mock form from `/inventory/intake`.
3. Phone: open the scan MFE URL → capture → review → **Confirm & deduct**.
4. Laptop Supplies updates via Realtime.

Camera capture needs **HTTPS** (or `localhost`). Tunnel both apps (or at least the host APIs)
when using a physical phone.

## Routes (host)

| Path | Role |
|------|------|
| `/scan` | Redirects to `NEXT_PUBLIC_SCAN_MFE_URL` |
| `/inventory` | Supplies (live from Supabase) |
| `/inventory/usage` | Usage log |
| `/inventory/intake` | Mock form generator / file upload spike |

## Fixtures & eval

- `fixtures/forms/` — synthetic sticker sheets (UI can also generate PNGs in-browser).
- `fixtures/golden/` — hand-labeled expected extractions.
- `pnpm eval` — extractor vs golden set (needs `GEMINI_API_KEY`).
- `pnpm fixtures` — regenerate SVGs (PNG convert needs `rsvg-convert` on PATH).

## Out of scope

Athena/billing, coding AI, call-center voice, live Drive/Sheets, Document AI trainer,
Module Federation embed into the host chrome, Vertex PHI path.
