This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## MSP Inventory Scan Spike

A spike that turns a **scanned surgery-device compliance form** (image or PDF) into structured device
rows via Gemini, lets a human review/edit them, and — only after approval — updates the in-app
inventory (decrements `Supply`, appends a usage log) with a CSV export that mirrors a center sheet.

Flow: `inventory/intake` (upload) -> `POST /api/extract` (server-side Gemini) -> review UI -> approve
-> store update + CSV. Client context: Kenneth Pasquale / Mountain Spring Podiatry.

### SANITIZED DATA ONLY — no PHI until Vertex + BAA

- Only upload **synthetic or fully redacted** forms (patient identifiers blacked out).
- An AI Studio free/consumer API key is **not BAA-covered**. Never send real patient forms to it.
- The production PHI path is the **same Gemini models on Vertex AI under a Cloud BAA** (Phase 6). Same
  prompts/schemas, different client.
- Human-in-the-loop is mandatory: **unapproved rows never touch inventory**.
- The extractor runs **server-side** so the API key is never shipped to the browser.

### Setup

1. Add credentials to `demo/.env.local` (gitignored). It needs the AI Studio API key
   (`GEMINI_API_KEY`) and the model id (`GEMINI_MODEL`, a current Flash multimodal model). A
   commented template already exists in that file.
2. `pnpm dev`, then open `/inventory/intake` and upload a fixture from `fixtures/forms/`.

### Fixtures & eval

- `fixtures/forms/` — synthetic sticker-form images (replaceable with redacted real scans).
- `fixtures/golden/` — hand-labeled expected extractions, one JSON per form.
- `pnpm eval` — runs the extractor against the golden set and reports device-ID recall / name match.

### Demo (Tuesday call)

1. Open `/inventory/intake`, upload `fixtures/forms/form-richmond-knee.png`, click **Extract devices**.
2. In ~a few seconds you get structured rows: 3 devices auto-matched to inventory SKUs, each with a
   confidence badge; edit any field, toggle include, or fix a match.
3. Click **Approve N to inventory** -> `Supply` quantities decrement and rows land in the usage log.
4. Open `/inventory/usage` and **Export CSV** to show the center-sheet mirror.

Say out loud: accuracy is an experiment (show `pnpm eval`), the weekly shelf-count still happens,
Athena is untouched, and real patient forms require a real, custom, self-hosted, tuned model.

### Out of scope (do not build here)

Athena/billing integration, coding AI, call-center voice, live Google Drive/Sheets writes, and a
Document AI custom trainer. See the tracking issue for the full phase list.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
