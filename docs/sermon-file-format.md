# `.sermon` file and backup format (local-only storage)

Sermons live only on Mevin's PC. The server keeps no sermons; it only builds exports.
Shared, browser-safe module: `src/lib/sermon-file/` (zod + types only, no server imports).

## Single sermon: `Title.sermon`

```json
{
  "kind": "sermon-editor-presenter/sermon",
  "schemaVersion": 1,
  "savedAt": "2026-10-16T07:05:00.000Z",
  "sermon": { "id": "…", "title": "…", "updatedAt": "…", "content": { "type": "doc", "content": [] }, "presentationSettings": { }, "notes": "" }
}
```

`sermon` is the client `SermonDocument` (`src/types/document.ts`). UTF-8, pretty JSON, text stored exactly as written (accents round-trip unchanged).

## Backup: `*.sermon-backup`

Same envelope with `kind: "sermon-editor-presenter/backup"` and `sermons: SermonDocument[]`.
Restore is all-or-nothing: one damaged sermon or a duplicate id refuses the whole file.

## API

| Function | Use |
|---|---|
| `serializeSermonFile(sermon)` / `parseSermonFile(text)` | Save to folder / Open |
| `serializeBackupFile(sermons)` / `parseBackupFile(text)` | Back up / Restore (preview from the parsed result) |
| `isNewerOnDisk(loadedSavedAt, diskSavedAt)` | Warn before overwriting a copy another tab saved |
| `sermonFileName(title)` | File name using the export filename rules |

Errors throw `SermonFileError` with `code` (`TOO_LARGE`, `NOT_JSON`, `WRONG_KIND`, `NEWER_VERSION`, `INVALID`), a writer-facing `message`, and `details` naming the failing fields.

## Versions

`schemaVersion` 1 is current. Files with a higher version are refused with "saved by a newer version of the app". Version 0 (no envelope) is upgraded on open: a bare `SermonDocument` from localStorage, or the old server `Sermon` shape (`meta.title`, `presentation`). When the shape changes, bump the version and add a step in `upgradeSermon`.

Limits: 20 MB per sermon file, 200 MB per backup. v2 images will be stored as separate files next to the sermon, referenced by relative path, not embedded.
