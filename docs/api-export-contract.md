# API & Export Contract

Contract between Frontend (TipTap dual shells `/edit` + `/preach`) and Backend.

**Source of truth for the export payload:** `src/types/document.ts` → `CalibratedSnapshot` + `ExportRequestOptions`.

**Slice:** Document setup / Save as / Export — slice 2 (`docs/ux/document-setup-save-export-slice-2.md`).

## Principles

- Sermon **content** (TipTap JSON / semantic blocks) is separate from **presentation settings**.
- Presentation lives client-side (and optional server copy) until export.
- Export POSTs a **calibrated snapshot** after Reading Mode calibration.
- **`bionic` must be `false` in export** (Frontend already sends literal `false`).
- Print / DOCX / PDF use **light ink**; Frontend sets `flattenGradient: true` before POST.
- **Color marks:** TipTap `textStyle.color` must be concrete `#RRGGBB` or `rgb(r, g, b)` (integers 0–255). Backend rejects anything else in content color marks with **400**: CSS `var(--…)`, named colors (`red`), `#RGB`, `rgba()`, `hsl()`. Frontend should normalize every non-hex color (including pasted ones) to `#RRGGBB` before POST.
- Favor simple, secure defaults. No invented metrics.

---

## `CalibratedSnapshot` (export body core)

Shape defined in `src/types/document.ts` and built by `buildCalibratedSnapshot()`:

```ts
{
  target: CalibrationTarget | string,
  margins: {
    top: string,      // e.g. "0.75in" | "5%"
    right: string,
    bottom: string,
    left: string,
    binderGutter?: string  // e.g. "0.25in" on paper
  },
  typeScaleStep: number,   // -2..+2
  lineHeight: 1.55 | 1.7 | 1.85,
  theme: "light" | "dark", // paper targets should be light
  flattenGradient: true,
  bionic: false,           // required literal false
  semanticBlocks: SemanticBlock[],
  content: SermonContent   // TipTap JSON (marks walked for italic/align/highlight/font/color)
}
```

### Semantic blocks

| `type`      | Fields              | DOCX / PDF treatment        |
|-------------|---------------------|-----------------------------|
| `Title`     | `text`              | Title                       |
| `H1`        | `text`              | Heading 1                   |
| `H2`        | `text`              | Heading 2                   |
| `Body`      | `text`              | Body paragraph              |
| `Scripture` | `text`, `citation?` | Italic body + caption right |
| `Caption`   | `text`              | Caption (right-aligned)     |

Workers prefer TipTap `content` (for marks) and fall back to `semanticBlocks`.

---

## Slice 2 request extras (`ExportRequestOptions`)

Accepted on the same POST alongside the snapshot:

```ts
{
  format?: "docx" | "pdf" | "png" | "pptx",
  filenameStem?: string,       // sanitized; empty → "sermon-export"
  includeNotes?: boolean,      // default false
  notes?: string,              // study notes text when includeNotes is true
  resolvedColors?: { accent: string }  // "#RRGGBB" or rgb(r, g, b) only
}
```

| Field | Rules |
|-------|--------|
| `format` | `docx` \| `pdf` \| `png` \| `pptx`. Invalid → **400**. |
| `filenameStem` | Sanitized to `[A-Za-z0-9._-]`; empty/whitespace → `sermon-export`. Used in `Content-Disposition`. When omitted, Backend derives from Title block / `"sermon-export"`. |
| `includeNotes` | Default **false**. When **true**, appends a final **Study Notes** section in **DOCX/PDF only**. Ignored for **png** / **pptx**. Requires `notes` string from Frontend; empty/missing notes → no section added. |
| `notes` | Free-form study notes (not part of `CalibratedSnapshot`). |
| `resolvedColors.accent` | Concrete accent for Title / chrome (PNG accent bar, PPTX accents, DOCX/PDF title default). Same strict color rule. The canonical light accent is the Edit accent `#5c4a1f`; when omitted, PNG/PPTX fall back to `#5C4A1F` (light) or `#C4A35A` (dark screen targets). |

### Shared export rules (all formats)

1. `bionic: false` always.
2. `flattenGradient: true` always.
3. Paper targets → Frontend should send `theme: "light"`.
4. Color marks: `#RRGGBB` or `rgb(r, g, b)` only (validated; see top of doc).
5. Highlight → soft amber background on runs when the worker supports it; otherwise omit mark (don’t fail).
6. Font family marks → Sans / Serif / Mono mapped to concrete fonts; unknown → Sans.
7. Align → left / center / right on Body, H1/H2 and Scripture blocks in all formats (PPTX included). Scripture citations and Captions are always right-aligned, regardless of block alignment.
8. Italic → honored in all formats (best-effort).

---

## `POST /api/export`

### Request

CalibrationPanel POSTs the snapshot **directly** as JSON (plus optional extras):

```http
POST /api/export
Content-Type: application/json
```

```json
{
  "target": "paper-letter",
  "margins": {
    "top": "0.75in",
    "right": "0.75in",
    "bottom": "0.75in",
    "left": "0.75in",
    "binderGutter": "0.25in"
  },
  "typeScaleStep": 0,
  "lineHeight": 1.7,
  "theme": "light",
  "flattenGradient": true,
  "bionic": false,
  "semanticBlocks": [
    { "type": "Title", "text": "Joy Without Ceasing" },
    { "type": "H1", "text": "Introduction" },
    { "type": "Body", "text": "Rejoice in the Lord always." },
    {
      "type": "Scripture",
      "text": "Rejoice in the Lord always; again I will say, rejoice.",
      "citation": "Philippians 4:4"
    }
  ],
  "content": { "type": "doc", "content": [] },
  "format": "pdf",
  "filenameStem": "Joy-Without-Ceasing",
  "includeNotes": false,
  "resolvedColors": { "accent": "#5c4a1f" }
}
```

**Format selection**

| Mechanism | Example |
|-----------|---------|
| Query (**wins** over body) | `POST /api/export?format=png` |
| Body field | `{ "format": "pptx", ...snapshot }` |
| Wrapper | `{ "format": "pdf", "snapshot": { ... }, "filenameStem": "…" }` |
| Default | `docx` |

### Success response

- Status `200`
- **Binary file bytes** (not JSON) — Frontend should use `res.blob()` / `arrayBuffer()`, not `res.json()`
- Headers:
  - DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - PDF: `Content-Type: application/pdf`
  - PNG: `Content-Type: image/png`
  - PPTX: `Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`
  - `Content-Disposition: attachment; filename="<stem>.(docx|pdf|png|pptx)"`
  - `Cache-Control: no-store`

### Format workers (slice 2)

| Format | Status | Behavior |
|--------|--------|----------|
| **DOCX** | Implemented | Semantic / TipTap content; optional Study Notes; `filenameStem`; accent on title when provided |
| **PDF** | Implemented | Same as DOCX |
| **PNG** | Implemented | Single PNG of calibrated frame at target aspect (`sharp` + SVG). Notes ignored. |
| **PPTX** | Implemented | Title slide + one slide per H1 section (`pptxgenjs`). Notes ignored. |

If a future worker is stubbed, Backend returns:

```http
501
Content-Type: application/json
```

```json
{ "error": "…", "code": "NOT_IMPLEMENTED" }
```

Frontend should show a clear status (and may keep the button disabled + “Coming soon” when it already knows).

### Error responses

| Status | When |
|--------|------|
| `400` | Schema validation failed: `{ error: "Validation failed", details: Issue[] }`, where each issue has `path` (array, e.g. `["resolvedColors","accent"]`) and `message`. For content color marks the message starts with the exact mark path (e.g. `content.content[2].content[0].marks[0].color: …`). Examples: `bionic: true`, a disallowed color, invalid `format`. |
| `405` | GET used instead of POST |
| `500` | Unexpected generation failure |
| `501` | Format worker intentionally not implemented (`{ error, code: "NOT_IMPLEMENTED" }`) |

---

## Sermon CRUD / server autosave

Complements Frontend `localStorage` autosave with durable server persistence
(`data/sermons/` JSON files; swap for DB in prod via `SERMON_DATA_DIR` / store module).

### `GET /api/sermons` → `{ sermons: Sermon[] }`

### `POST /api/sermons`

```json
{
  "id": "optional UUID (same-id restore)",
  "title": "Untitled sermon",
  "content": { "type": "doc", "content": [] },
  "presentation": { /* PresentationSettings */ },
  "notes": ""
}
```

→ `201 { sermon }`

- `id` is optional. Omit it and the server generates a UUID. Send one (UUID only, stored lowercase) to restore a sermon under the same id after a server-side loss.
- If a sermon with that `id` already exists → **`409 { error: "Sermon already exists" }`** and the stored copy is untouched. Client should `GET /api/sermons/:id`, then `PATCH` its pending content.
- A non-UUID `id` (e.g. `seed-…`) → **400** with `details[0].path = ["id"]`.

### `GET /api/sermons/:id` → `{ sermon }`

### `PATCH /api/sermons/:id`

Partial update of `title`, `content`, `presentation` (`null` clears), `notes`.

### `DELETE /api/sermons/:id` → `{ ok: true }`

### `PATCH /api/sermons/:id/content` (autosave)

```json
{
  "content": { "type": "doc", "content": [ /* TipTap */ ] },
  "document": { /* alias for content */ },
  "title": "optional"
}
```

At least one of `content` or `document` required. TipTap JSON is sanitized on write.

### Persisted `Sermon` shape

```ts
{
  id: string,
  meta: { title: string, createdAt: string, updatedAt: string },
  content: SermonContent,
  presentation?: PresentationSettings,
  notes?: string
}
```

**IDs:** sermon route params remain **UUID-only** (seed-* blocked on first paint / API).

---

## TypeScript references

- `src/types/document.ts` — `CalibratedSnapshot`, `ExportFormat`, `ExportRequestOptions`, semantic blocks, presentation
- `src/lib/sermon/schema.ts` — Zod validators (incl. CSS var rejection)
- `src/lib/sermon/store.ts` — file persistence
- `src/lib/sermon/export/` — DOCX (`docx`), PDF (`pdfkit`), PNG (`sharp`+SVG), PPTX (`pptxgenjs`)

## Frontend follow-ups (slice 2)

1. Flatten TipTap `textStyle.color` CSS vars → hex before POST (esp. accent).
2. Send `filenameStem`, optional `includeNotes` + `notes`, and `resolvedColors.accent`.
3. Wire PNG / PPTX format buttons; on 501 show clear status (or disable + hint).
4. Edit topbar **Export…** → `/preach?calibrate=1` (chrome only; not Backend).
