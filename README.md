# Sermon Editor / Presenter

Dual-shell sermon app:

- **Editing Mode** (`/edit`) — TipTap headless block editor + study chrome
- **Preaching / Reading Mode** (`/preach`) — hard shell swap; Art Director stage tokens; zero editing chrome

Document **content** (TipTap JSON) is stored separately from **presentationSettings**. Client persists to `localStorage`; server CRUD lives under `/api/sermons*`.

## Run locally

```bash
npm i && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — `/` redirects to `/edit`.

```bash
npm run build   # production build (output: "standalone" for Cloud Run)
npm start       # serve the production build
npm run typecheck && npm test
```

### Real-browser E2E (Chromium)

`npm test` runs node unit tests only. Browser mount tests live in `e2e/` and use
`@playwright/test` with real Chromium. They are **not** part of `npm test`:

```bash
npx playwright install chromium   # first time only
npm run test:e2e                  # builds, starts on :3322, runs e2e/*.spec.ts
E2E_BASE_URL=https://<host> npm run test:e2e   # run against a deployed shell instead
```

`e2e/edit-mount.spec.ts` opens `/edit` with (a) cleared localStorage, (b) a stale
`seed-philippians-4:0` active id, and (c) a random UUID active id, and fails on any
`pageerror` or if the edit toolbar (History group / Undo) doesn't render. It also
checks that Scripture block alignment is applied live. Note: the tests write to the
local file store (`data/sermons/`, gitignored) through autosave.

## Route map

| Route | Shell | Notes |
|-------|--------|--------|
| `/` | — | Redirects to `/edit` |
| `/edit` | Editing | TipTap blocks (Title, H1, H2, Body, Scripture), outline, find/replace, notes, paste cleanup, **Enter Preaching** |
| `/preach` | Reading | Read-only stage: theme, type scale, line-height, bionic (default off), progress bar, calibration panel |
| `POST /api/export` | API | Accepts `CalibratedSnapshot` JSON; returns DOCX/PDF binary (`?format=docx\|pdf`) |

## Block types

- **Title** — custom TipTap node
- **H1 / H2** — primary points / subpoints (`heading` levels 1–2)
- **Body** — prose paragraphs
- **Scripture** — citation label + quote text (whole block skips bionic)

## Backend API

- Contract: [`docs/api-export-contract.md`](docs/api-export-contract.md) — uses Frontend `CalibratedSnapshot` from `src/types/document.ts`
- Export: `POST /api/export` (optional `?format=docx|pdf`, default `docx`) → real DOCX/PDF binary (`docx` + `pdfkit`)
- CRUD: `GET/POST /api/sermons`, `GET/PATCH/DELETE /api/sermons/[id]`, `PATCH /api/sermons/[id]/content`
- Store: `data/sermons/` JSON files (`SERMON_DATA_DIR` override; swap for DB in prod)

## DevOps / Cloud Run

`next.config.ts` sets `output: "standalone"` so the Docker images can boot.

- Images: `Dockerfile` (light shell ~512Mi) and `Dockerfile.export` (fonts for pdfkit, ~2Gi / 2 CPU)
- Staging runbook: `docs/runbook-staging.md` (GCP env vars + QA promote gate)
- Actions templates: `deploy/github-workflows/` — install under `.github/workflows/` once GitHub `workflow` scope is available
