# Acme Healthcare — one-hour AutoDevelop demo

<p align="center">
  <img src="acme-healthcare.svg" alt="Acme Healthcare" width="480" />
</p>

Marketing example of what **Devrecated** can ship with **AutoDevelop** in less than one hour: a full clinic inventory scan flow for a fictional **Acme Healthcare** buyer.

Scan a synthetic Point-of-Use device form → multimodal extract → human review → live inventory deduct across laptop and phone.

Synthetic data only — never upload PHI.

## Built in under an hour

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

## Prerequisites

- pnpm 10.0.0, pinned by `packageManager` in the root `package.json`. Corepack will pick it up.
- Node.js. No `engines` field is set in any `package.json`, so no version is pinned.
- `rsvg-convert` on your PATH if you want to regenerate the mock forms with `pnpm fixtures`.

## Environment

Each app has its own `.env.example`. Copy it and fill in your own values. Never commit real keys.

| App | Template | Variables |
|-----|----------|-----------|
| Host | [`demo/.env.example`](demo/.env.example) | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SCAN_MFE_URL` |
| Scan MFE | [`scan-mfe/.env.example`](scan-mfe/.env.example) | `VITE_API_BASE`, `VITE_HOST_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

## Commands

Run these inside the app directory.

| App | Command | What it runs |
|-----|---------|--------------|
| Host | `pnpm dev` / `pnpm build` / `pnpm start` | `next dev` / `next build` / `next start` |
| Host | `pnpm lint` | `eslint` |
| Host | `pnpm typecheck` | `tsc --noEmit` |
| Host | `pnpm fixtures` | `scripts/make-fixtures.mjs`, which writes synthetic forms to `fixtures/forms` and `public/fixtures/forms` |
| Host | `pnpm eval` | `scripts/eval.ts`, which runs the Gemini extractor over `fixtures/forms` and scores it against `fixtures/golden` |
| Scan MFE | `pnpm dev` / `pnpm build` | Vite on :5173 / `tsc -b && vite build` (icons are generated first) |
| Scan MFE | `pnpm preview` | `vite preview --port 5173 --host` |
| Scan MFE | `pnpm typecheck` | `tsc -b --noEmit` |
| Scan MFE | `pnpm icons` | `scripts/generate-pwa-icons.mjs` |

## Demo script

1. Laptop: open the host → **Supplies** (live quantities).
2. **Scan intake** → print or grab an Acme Healthcare mock form.
3. Phone: open the scan MFE → photograph the form → review matches → **Confirm & deduct**.
4. Laptop: Supplies drop via Realtime; **Usage log** shows the rows.

Human-in-the-loop: nothing hits inventory until confirm. Sanitized forms only. Production PHI would need Vertex + BAA.

## Branch

Continued work on this public example lands on **`one-hour`** (merge to `master` when ready).

## CI

GitHub Actions (`.github/workflows/ci.yml`) typechecks and builds both apps, then runs Playwright smoke (`e2e/`) on push/PR to `master` and `one-hour`.

```bash
pnpm install                  # root — Playwright
pnpm install --dir demo && pnpm install --dir scan-mfe
pnpm exec playwright install chromium
pnpm test:e2e                 # local :3000 + :5173
pnpm test:e2e:live            # optional deployed URLs
```

## Demo videos

Shot lists for recording (footage stays out of git). Full briefs: [`videos/`](videos/).

| Order | Brief | Clip |
|------:|-------|------|
| 1 | [01-host-login](videos/01-host-login/) | Laptop sign-in → Clinic board |
| 2 | [02-supplies-live](videos/02-supplies-live/) | Live supplies + Reset data |
| 3 | [03-mock-forms](videos/03-mock-forms/) | Mock form intake / print |
| 4 | [04-phone-scan](videos/04-phone-scan/) | Phone scan MFE capture → extract |
| 5 | [05-confirm-realtime](videos/05-confirm-realtime/) | Confirm & deduct; laptop qty drop |
| 6 | [06-usage-log](videos/06-usage-log/) | Usage log close |
