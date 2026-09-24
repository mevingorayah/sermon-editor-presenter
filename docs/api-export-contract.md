# API & Export Contract

Contract between Frontend (TipTap dual shells `/edit` + `/preach`) and Backend.

**Source of truth for the export payload:** `src/types/document.ts` → `CalibratedSnapshot`.

## Principles

- Sermon **content** (TipTap JSON / semantic blocks) is separate from **presentation settings**.
- Presentation lives client-side (and optional server copy) until export.
- Export POSTs a **calibrated snapshot** after Reading Mode calibration.
- **`bionic` must be `false` in export** (Frontend already sends literal `false`).
- Print / DOCX / PDF use **light ink**; Frontend sets `flattenGradient: true` before POST.
- Favor simple, secure defaults. No invented metrics.

---

## `CalibratedSnapshot` (export body)

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
  content: SermonContent   // TipTap JSON
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

---

## `POST /api/export`

### Request

CalibrationPanel POSTs the snapshot **directly** as JSON:

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
  "content": { "type": "doc", "content": [] }
}
```

**Format selection**

| Mechanism | Example |
|-----------|---------|
| Query (preferred until UI adds a picker) | `POST /api/export?format=pdf` |
| Body field | `{ "format": "docx", ...snapshot }` |
| Wrapper | `{ "format": "pdf", "snapshot": { ... } }` |
| Default | `docx` |

### Success response

- Status `200`
- **Binary file bytes** (not JSON) — Frontend should use `res.blob()` / `arrayBuffer()`, not `res.json()`
- Headers:
  - DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - PDF: `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="<safe-title>.(docx|pdf)"`
  - `Cache-Control: no-store`

### Error responses

| Status | When |
|--------|------|
| `400` | Schema validation failed (`{ error, details }`) — e.g. `bionic: true` |
| `405` | GET used instead of POST |
| `500` | Unexpected generation failure |

---

## Sermon CRUD / server autosave

Complements Frontend `localStorage` autosave with durable server persistence
(`data/sermons/` JSON files; swap for DB in prod via `SERMON_DATA_DIR` / store module).

### `GET /api/sermons` → `{ sermons: Sermon[] }`

### `POST /api/sermons`

```json
{
  "title": "Untitled sermon",
  "content": { "type": "doc", "content": [] },
  "presentation": { /* PresentationSettings */ },
  "notes": ""
}
```

→ `201 { sermon }`

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

---

## TypeScript references

- `src/types/document.ts` — `CalibratedSnapshot`, semantic blocks, presentation
- `src/lib/sermon/schema.ts` — Zod validators
- `src/lib/sermon/store.ts` — file persistence
- `src/lib/sermon/export/` — DOCX (`docx`) + PDF (`pdfkit`)
