# Document setup / Save as / Export — Slice 2 (interaction + contract notes)

**Product:** sermon-editor-presenter  
**Owner:** UI UX → Frontend (chrome) + Backend (schema/workers)  
**Depends on:** Toolbar slice 1 locked (`1836b81`); accent colors must export as **concrete hex/RGB**, never CSS vars  
**Status:** Ready for Backend schema draft + Frontend panel work

---

## Goals (Mevin)

1. Set up how a sermon will look on a target (screen / paper) before exporting.
2. Save or download in a chosen format without hunting through menus.
3. Keep study notes and Edit chrome out of preach/export files unless he opts in later (not this slice).

## Current state

| Surface | Today |
|---------|--------|
| `/edit` | Autosave to server; New / select / delete in sidebar. **No** Document setup, Save as, or export. |
| `/preach` → Calibrate | Target, type scale, line height, theme; live preview; **Export DOCX** / **Export PDF** only. |
| Contract | `CalibratedSnapshot` → `POST /api/export` with `format: docx \| pdf`. |

Backend plan (stated): extend calibrated snapshot; new workers for **image** and **PPTX** beside DOCX/PDF.

---

## Information architecture

Treat **three related jobs** as one family, not three unrelated screens:

```
Document setup  →  chooses target + presentation defaults
Save as         →  names the download / duplicate
Export          →  runs a format worker against the calibrated snapshot
```

**Primary home:** Reading Mode **Calibration** panel (already the export gate). Rename the mental model from “Calibrate only” to **Document setup & export**, but keep the existing Calibrate entry in the Preach toolbar so Mevin doesn’t lose the path.

**Secondary entry (Edit):** a single **Export…** (or **Document setup**) action in the Editing topbar that deep-links into Preach with Calibration open (`/preach?calibrate=1` or equivalent). Do **not** duplicate the full calibration UI in Edit for slice 2.

**Import** stays out of this slice (Backend mentioned aligning Import later). Note only: future Import should land content into Edit, then Mevin uses this same setup/export path.

---

## A. Document setup (fields)

Lives in the Calibration / Document setup panel. Existing fields stay; clarify labels and add only what export workers need.

### Keep (already live)

| Field | Control | Notes |
|-------|---------|--------|
| Target | Select | Existing `CalibrationTarget` list (screen + paper). Paper forces preview theme light. |
| Type scale | Select −2…+2 | Existing |
| Line height | Select 1.55 / 1.7 / 1.85 | Existing |
| Theme | Dark / Light | Disabled + forced light when target is paper |

### Show (read-only for now)

| Field | Display |
|-------|---------|
| Margins | Existing margins + binder gutter line (no free-form margin editor in slice 2) |

### Add for export fidelity (Backend schema)

| Field | UI | Snapshot / API |
|-------|-----|----------------|
| **Filename stem** | Text input, default = sermon title sanitized | Sent as `filenameStem` (or Backend derives from `Content-Disposition` using title if omitted) |
| **Include study notes** | Checkbox, **default off** | `includeNotes: boolean` — if true, notes append as a final section in DOCX/PDF only (not image/PPTX v1) |
| **Resolved text colors** | No extra UI | Frontend flattens TipTap `textStyle.color` CSS vars → hex before POST (see Color rule) |

Do **not** add arbitrary margin editors, custom page size, or brand templates in slice 2.

### Persistence

- Target / type scale / line height / theme / calibrationTarget already live in `presentationSettings` (client + optional server).
- Filename stem and includeNotes: **session defaults for this export** first; optionally remember last `includeNotes` in local presentation settings later — not required for v1.

---

## B. Save as (UX)

**Save as** here means “download / create a file copy in a chosen format,” not “duplicate sermon on the server” (server duplicate can stay New + copy-paste for now).

### Flow

1. Mevin opens Document setup (Calibrate).
2. Adjusts target / scale / line height / theme as needed; preview updates live.
3. Optionally edits **Filename** (stem only; extension comes from format).
4. Chooses a format action (see C).
5. Status line: `Downloading…` → `Downloaded {filename}` or error (existing pattern).

### Filename rules

- Default stem = current sermon title, sanitized (`Joy Without Ceasing` → `Joy-Without-Ceasing`).
- Empty stem → `sermon-export`.
- Extension always owned by format (`.docx`, `.pdf`, `.png`, `.pptx`).
- Backend may still override via `Content-Disposition`; Frontend prefers server filename when present (already implemented).

### Not in slice 2

- “Save as new sermon” (server clone) — defer.
- Cloud drive pickers — defer.

---

## C. Export format choices

### Placement

Replace the flat two-button row with a clearer **format group**:

```
[ Export DOCX ]  [ Export PDF ]  [ Export image ▾ ]  [ Export PowerPoint ]
```

Or one primary **Export** button + format select (DOCX default). Prefer **visible format buttons** for DOCX/PDF (most used) and a compact control for image/PPTX so the panel doesn’t explode.

### Formats

| Format | Availability | Worker | Snapshot extras |
|--------|--------------|--------|-----------------|
| **DOCX** | Live now | Existing | Current snapshot + optional `includeNotes` |
| **PDF** | Live now | Existing | Same |
| **Image (PNG)** | Slice 2 UI; Backend worker next | New | `format: "png"`; render first “page” / full scroll? → **v1 = single PNG of calibrated frame at preview aspect** (screen or paper frame). No multi-page PNG zip yet. |
| **PowerPoint (PPTX)** | Slice 2 UI; Backend worker next | New | `format: "pptx"`; one slide per H1 section (Title slide + each H1 and its following Body/H2/Scripture until next H1). Scripture citation as notes or subtitle. |

If a worker isn’t ready, button stays visible but disabled with hint `Coming soon` — **or** hide until Backend flags readiness. Prefer **disabled + hint** so Mevin sees the roadmap.

### Shared export rules (all formats)

1. `bionic: false` always.
2. `flattenGradient: true` always.
3. Paper targets → `theme: "light"`.
4. **Color marks:** any `var(--…)` in TipTap JSON must be resolved to `#RRGGBB` (or `rgb()`) in the POST body. Accent from Edit toolbar → use computed `--edit-accent` hex at export time (e.g. read from `getComputedStyle`). Persist resolved colors in the snapshot’s `content` **copy** for the request only; don’t rewrite the live editor doc unless we add an explicit “flatten colors” later.
5. Highlight → DOCX/PDF: soft background on runs when possible; PNG/PPTX: paint the same soft amber. If a worker can’t do highlight yet, strip mark but don’t fail the export (log/omit).
6. Font family marks → map Sans/Serif/Mono to concrete font names in workers; unknown → Sans.
7. Align → honor left/center/right on blocks in DOCX/PDF/PPTX; PNG follows preview.
8. Italic → honor in all formats.

### Request shape ( fore Backend)

Keep `POST /api/export` with body = snapshot + format:

```ts
{
  ...CalibratedSnapshot,
  format: "docx" | "pdf" | "png" | "pptx",
  filenameStem?: string,
  includeNotes?: boolean,  // default false
  // Optional explicit palette for workers:
  resolvedColors?: { accent: string } // "#xxxxxx"
}
```

Query `?format=` remains acceptable. Invalid format → 400 with clear message.

---

## D. Screen flows (summary)

### Happy path — paper handout

1. Edit sermon → Enter Preaching → Calibrate.  
2. Target = Paper Letter (or A4). Theme locked light.  
3. Tweak type scale / line height if needed.  
4. Filename stem OK → Export PDF (or DOCX).  
5. Status confirms download.

### Happy path — screen image for slides backup

1. Calibrate → Target = Screen 16:9.  
2. Export image → PNG of calibrated frame.  
3. (Later) Export PowerPoint for sectioned slides.

### Error

- Network / 5xx: keep status error text; buttons remain usable.  
- 501 / not implemented for png|pptx: status explains; don’t spin forever.

---

## E. Acceptance criteria (QA)

1. Document setup fields (target, scale, line height, theme, margins readout) work as today from Calibrate.  
2. Filename stem defaults from title; empty falls back safely.  
3. Export DOCX/PDF still green on calibrated paper + screen targets.  
4. `includeNotes` off by default; when on, notes appear only in DOCX/PDF (not PNG/PPTX v1).  
5. No CSS variables in export POST `content` color marks — hex/RGB only.  
6. PNG/PPTX: either working download or disabled+hint; never a silent fail.  
7. Edit topbar Export… (if shipped) opens Preach with setup panel open.  
8. Ready/promote gate remains independent unless PM expands it.

---

## F. Implementation order (suggested)

1. **Backend:** extend schema (`format` enum + `filenameStem` + `includeNotes` + document color-flatten rule); stub or implement PNG/PPTX workers.  
2. **Frontend:** flatten colors in `buildCalibratedSnapshot` / export payload; add filename + notes checkbox; wire format buttons.  
3. **QA:** checklist from section E; keep off Ready gate unless PM says otherwise.  
4. **UI UX:** review staging chrome once buttons land.

## Out of scope

- Import wizard  
- Server-side “duplicate sermon”  
- Multi-page PNG / PDF page thumbnails  
- Brand templates / letterhead  
- Editing notes inside Calibration  

