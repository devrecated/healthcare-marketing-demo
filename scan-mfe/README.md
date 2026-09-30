# Acme Healthcare scan microfrontend

Standalone Vite + React camera shell. Calls the host console APIs for extract/confirm
and reads Supabase supplies for client-side matching.

## Setup

1. `pnpm install` in `scan-mfe/`.
2. Copy `.env.example` → `.env.local` and set:
   - `VITE_API_BASE` — host origin (default `http://localhost:3000`)
   - `VITE_HOST_URL` — Supplies return URL (usually same as API base)
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — same project as the host
3. Run host: `cd ../demo && pnpm dev`
4. Run MFE: `pnpm dev` → [http://localhost:5173](http://localhost:5173)
5. Sign in with password shown on the login screen.

Phone camera needs HTTPS (or localhost). Point `VITE_API_BASE` at a tunnel to the host
when the phone cannot reach `localhost:3000`.

## Boundary

| Concern | Owner |
|---------|--------|
| Camera UI + queue + review | This MFE |
| `/api/extract`, `/api/scan/confirm` | Host `demo/` (service role + OpenRouter/Gemini keys) |
| Live Supplies / usage log | Host console |
| Auth | Separate demo password gate (not shared storage across origins) |

### Vercel

Deploy as its own project (Root Directory `scan-mfe`). Set `VITE_API_BASE` and
`VITE_HOST_URL` to the host project URL. Vite `base` is `/`.
