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
