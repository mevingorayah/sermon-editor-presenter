# Sermon Editor / Presenter

Dual-shell sermon app:

- **Editing Mode** (`/edit`) — TipTap headless block editor + study chrome
- **Preaching / Reading Mode** (`/preach`) — hard shell swap; Art Director stage tokens; zero editing chrome

Document **content** (TipTap JSON) is stored separately from **presentationSettings**. Both persist to `localStorage` for offline autosave. Backend APIs and real DOCX/PDF export are the next step.

## Run locally

```bash
npm i && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — `/` redirects to `/edit`.

```bash
npm run build   # production build (output: "standalone" for Cloud Run)
npm start       # serve the production build
```

## Route map

| Route | Shell | Notes |
|-------|--------|--------|
| `/` | — | Redirects to `/edit` |
| `/edit` | Editing | TipTap blocks (Title, H1, H2, Body, Scripture), outline, find stub, notes stub, paste cleanup, **Enter Preaching** |
| `/preach` | Reading | Read-only stage: theme, type scale, line-height, bionic (default off), progress bar, calibration panel |
| `POST /api/export` | Stub | Accepts `CalibratedSnapshot` JSON; returns **501** until Backend implements DOCX/PDF |

## Block types

- **Title** — custom TipTap node
- **H1 / H2** — primary points / subpoints (`heading` levels 1–2)
- **Body** — prose paragraphs
- **Scripture** — citation label + quote text

## Backend contract

Calibrated export snapshot TypeScript type:

`src/types/document.ts` → `CalibratedSnapshot`

Frontend calibration posts that shape to `/api/export`. **Do not** include bionic in export snapshots (`bionic: false` always). Real file generation is Backend-owned.

## DevOps / Cloud Run

`next.config.ts` sets `output: "standalone"` so the light-shell Docker image can boot.

## Backend API

- Contract: [`docs/api-export-contract.md`](docs/api-export-contract.md) — uses Frontend `CalibratedSnapshot` from `src/types/document.ts`
- Export: `POST /api/export` (optional `?format=docx|pdf`, default `docx`) → real DOCX/PDF binary
- CRUD: `GET/POST /api/sermons`, `GET/PATCH/DELETE /api/sermons/[id]`, `PATCH /api/sermons/[id]/content`
- Store: `data/sermons/` JSON files (`SERMON_DATA_DIR` override; swap for DB in prod)

```bash
npm run typecheck
npm test
```
