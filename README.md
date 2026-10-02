# Healthcare marketing demo (one hour)

Public **Acme Healthcare** clinic-ops demo: scan a synthetic Point-of-Use device form → extract devices with a multimodal model → human review → deduct inventory live across devices.

This repo is the **Acme Healthcare** showcase (no real client names). Synthetic data only — never upload PHI.

## What we shipped in about an hour

| Slice | What you can show |
|-------|-------------------|
| Host console | Next.js app in `demo/` — supplies, usage log, mock-form intake |
| Scan microfrontend | Vite PWA in `scan-mfe/` — phone camera → extract → confirm & deduct |
| Live inventory | Shared Supabase `supplies` + `usage_log` with Realtime |
| Extraction | Server-side OpenRouter / Gemini on the host (keys never in the browser) |
| Fixtures | Printable synthetic sticker sheets branded **Acme Healthcare** |


## Live URLs

| Surface | URL |
|---------|-----|
| Host console | https://healthcare-demo.devrecated.com |
| Scan MFE | https://healthcare-docscan-mfe-demo.devrecated.com |

Sign-in uses the demo password documented in [`demo/README.md`](demo/README.md).

## Apps

| App | Path | Local |
|-----|------|-------|
| Host | `demo/` | `pnpm install && pnpm dev` → :3000 |
| Scan MFE | `scan-mfe/` | `pnpm install && pnpm dev` → :5173 |

Setup details (env, Supabase migration, Vercel): see [`demo/README.md`](demo/README.md) and [`scan-mfe/README.md`](scan-mfe/README.md).

## One-hour demo script

1. Laptop: open the host → **Supplies** (live quantities).
2. **Scan intake** → print or grab an Acme Healthcare mock form.
3. Phone: open the scan MFE → photograph the form → review matches → **Confirm & deduct**.
4. Laptop: Supplies drop via Realtime; **Usage log** shows the rows.

Say out loud: human-in-the-loop (nothing hits inventory until confirm), sanitized forms only, production PHI would need Vertex + BAA.

## Branch

Work that extends this public demo lands on **`one-hour`** (and merges to `master` when ready).

## CI

GitHub Actions (`.github/workflows/ci.yml`) typechecks and builds both apps on push/PR to `master` and `one-hour`.
