import { globalStylesSchema } from "@/lib/sermon/blockStyle";
/**
 * `.sermon` file format + backup format (local-only storage).
 *
 * Browser-safe: imports only zod, types and the shared presentation schema.
 * No fs / server-only modules. Frontend uses this for Save to folder,
 * Open, Back up and Restore; QA's round-trip tests run against it.
 *
 * Files are UTF-8 JSON. Text is stored exactly as written (accents such as
 * é è ç ï round-trip byte-for-byte; no normalization).
 */

import { z } from "zod";
import type { SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";
import { presentationSettingsSchema } from "@/lib/sermon/schema";
import { getSchema } from "@tiptap/core";
import { Node as PMNode, type Schema } from "@tiptap/pm/model";
import { createSchemaExtensions } from "@/extensions/schema";
import { sanitizeFilenameStem } from "@/lib/sermon/export/filename";

export const SERMON_FILE_KIND = "sermon-editor-presenter/sermon";
export const SERMON_BACKUP_KIND = "sermon-editor-presenter/backup";
/** Bump when the shape changes; add an upgrade step in `upgrade()`. */
export const SERMON_FILE_SCHEMA_VERSION = 1;
export const SERMON_FILE_EXTENSION = ".sermon";
export const SERMON_BACKUP_EXTENSION = ".sermon-backup";

/** 20 MB per file, 200 MB per backup — guards against a wrong file picked. */
export const MAX_SERMON_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_BACKUP_FILE_BYTES = 200 * 1024 * 1024;

export type SermonFileErrorCode =
  | "TOO_LARGE"
  | "NOT_JSON"
  | "WRONG_KIND"
  | "NEWER_VERSION"
  | "INVALID";

/** Error with a plain-language message safe to show the writer. */
export class SermonFileError extends Error {
  code: SermonFileErrorCode;
  details?: string[];
  constructor(code: SermonFileErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = "SermonFileError";
    this.code = code;
    this.details = details;
  }
}

export interface SermonFile {
  kind: typeof SERMON_FILE_KIND;
  schemaVersion: number;
  /** ISO time the file was written; compare to detect another tab's save. */
  savedAt: string;
  sermon: SermonDocument;
}

export interface SermonBackupFile {
  kind: typeof SERMON_BACKUP_KIND;
  schemaVersion: number;
  savedAt: string;
  sermons: SermonDocument[];
}

const isoDate = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Not a valid date" });

const tiptapDocSchema = z
  .object({ type: z.literal("doc"), content: z.array(z.unknown()).optional() })
  .passthrough();

/** Local ids include UUIDs, `local-*` and legacy `seed-*:n`. No path chars. */
const localIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, { message: "Invalid sermon id" });

export const sermonDocumentSchema = z
  .object({
    id: localIdSchema,
    title: z.string().max(500),
    updatedAt: isoDate,
    content: tiptapDocSchema,
    presentationSettings: presentationSettingsSchema,
    notes: z.string().max(1_000_000),
    /** Block builder defaults; checked on open (bad values reject the file). */
    globalStyles: globalStylesSchema.nullish(),
  })
  .passthrough();

const fileEnvelope = z.object({
  kind: z.literal(SERMON_FILE_KIND),
  schemaVersion: z.number().int().min(1),
  savedAt: isoDate,
  sermon: z.unknown(),
});

const backupEnvelope = z.object({
  kind: z.literal(SERMON_BACKUP_KIND),
  schemaVersion: z.number().int().min(1),
  savedAt: isoDate,
  sermons: z.array(z.unknown()).max(10_000),
});

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function parseJson(text: string, maxBytes: number): unknown {
  if (byteLength(text) > maxBytes) {
    throw new SermonFileError(
      "TOO_LARGE",
      "This file is too large to be a sermon file.",
    );
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new SermonFileError(
      "NOT_JSON",
      "This file isn't a sermon file, or it is damaged.",
    );
  }
}

function issuesOf(err: z.ZodError, prefix = ""): string[] {
  return err.issues
    .slice(0, 20)
    .map((i) => `${[prefix, ...i.path].filter((p) => p !== "").join(".")}: ${i.message}`);
}

/**
 * Bring an older sermon object up to the current shape.
 * v0 = no envelope: a bare SermonDocument from localStorage, or the old
 * server `Sermon` shape (`{ id, meta: { title, updatedAt }, content, presentation?, notes? }`).
 */
function upgradeSermon(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if (o.meta && typeof o.meta === "object" && !("title" in o)) {
    const meta = o.meta as Record<string, unknown>;
    return {
      id: o.id,
      title: typeof meta.title === "string" ? meta.title : "",
      updatedAt: meta.updatedAt ?? meta.createdAt ?? new Date(0).toISOString(),
      // Keep the original creation date; never replace it with "now".
      ...(typeof meta.createdAt === "string" ? { createdAt: meta.createdAt } : {}),
      content: o.content,
      presentationSettings: o.presentation ?? DEFAULT_PRESENTATION_SETTINGS,
      notes: typeof o.notes === "string" ? o.notes : "",
      // Builder defaults: keep them (validated by sermonDocumentSchema).
      ...(o.globalStyles !== undefined && o.globalStyles !== null ? { globalStyles: o.globalStyles } : {}),
    };
  }
  return {
    ...o,
    presentationSettings: o.presentationSettings ?? DEFAULT_PRESENTATION_SETTINGS,
    notes: typeof o.notes === "string" ? o.notes : "",
  };
}

let editorSchema: Schema | null = null;
/** The same TipTap schema Edit and Preach use (built once, lazily). */
function getEditorSchema(): Schema {
  if (!editorSchema) editorSchema = getSchema(createSchemaExtensions());
  return editorSchema;
}

/**
 * Check the sermon body against the editor's schema: only known node and
 * mark types, in allowed places, with the right shapes. Returns a problem
 * description, or null when the document is fine. The original JSON is kept
 * as-is (this only checks; it never rewrites the writer's content).
 */
export function checkSermonContent(content: unknown): string | null {
  const inner = (content as { content?: unknown } | null)?.content;
  // An empty sermon (no blocks yet) is valid; the editor adds an empty line.
  if (Array.isArray(inner) && inner.length === 0) return null;
  if (inner === undefined && (content as { type?: unknown })?.type === "doc") return null;
  try {
    const node = PMNode.fromJSON(getEditorSchema(), content as never);
    node.check();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function validateSermon(raw: unknown, prefix: string): SermonDocument {
  const r = sermonDocumentSchema.safeParse(upgradeSermon(raw));
  if (!r.success) {
    throw new SermonFileError(
      "INVALID",
      "This sermon file is damaged or incomplete, so it wasn't opened.",
      issuesOf(r.error, prefix),
    );
  }
  const problem = checkSermonContent(r.data.content);
  if (problem) {
    throw new SermonFileError(
      "INVALID",
      "This sermon file contains content the editor doesn't recognise, so it wasn't opened. It may be damaged or made by another program.",
      [`${prefix ? prefix + "." : ""}content: ${problem}`],
    );
  }
  return r.data as unknown as SermonDocument;
}

function checkVersion(v: number): void {
  if (v > SERMON_FILE_SCHEMA_VERSION) {
    throw new SermonFileError(
      "NEWER_VERSION",
      "This file was saved by a newer version of the app. Update the app, then open it again.",
    );
  }
}

/** Write one sermon as `.sermon` file text (pretty JSON, UTF-8). */
export function serializeSermonFile(
  sermon: SermonDocument,
  savedAt: Date = new Date(),
): string {
  const file: SermonFile = {
    kind: SERMON_FILE_KIND,
    schemaVersion: SERMON_FILE_SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    sermon,
  };
  return JSON.stringify(file, null, 2) + "\n";
}

/**
 * Read `.sermon` file text. Accepts current files and v0 bare sermon JSON.
 * Throws `SermonFileError` with a writer-facing message on any problem.
 */
export function parseSermonFile(text: string): SermonFile {
  const raw = parseJson(text, MAX_SERMON_FILE_BYTES);
  const o = (raw ?? {}) as Record<string, unknown>;

  if (o.kind === SERMON_BACKUP_KIND) {
    throw new SermonFileError(
      "WRONG_KIND",
      "This is a backup file. Use Restore to open it.",
    );
  }

  if (o.kind === undefined && ("content" in o) && ("id" in o)) {
    const sermon = validateSermon(raw, "sermon");
    return {
      kind: SERMON_FILE_KIND,
      schemaVersion: SERMON_FILE_SCHEMA_VERSION,
      savedAt: sermon.updatedAt,
      sermon,
    };
  }

  const env = fileEnvelope.safeParse(raw);
  if (!env.success) {
    if (o.kind !== SERMON_FILE_KIND) {
      throw new SermonFileError("WRONG_KIND", "This file isn't a sermon file.");
    }
    throw new SermonFileError(
      "INVALID",
      "This sermon file is damaged or incomplete, so it wasn't opened.",
      issuesOf(env.error),
    );
  }
  checkVersion(env.data.schemaVersion);
  return {
    kind: SERMON_FILE_KIND,
    schemaVersion: SERMON_FILE_SCHEMA_VERSION,
    savedAt: env.data.savedAt,
    sermon: validateSermon(env.data.sermon, "sermon"),
  };
}

/** Write every sermon into one backup file. */
export function serializeBackupFile(
  sermons: SermonDocument[],
  savedAt: Date = new Date(),
): string {
  const file: SermonBackupFile = {
    kind: SERMON_BACKUP_KIND,
    schemaVersion: SERMON_FILE_SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    sermons,
  };
  return JSON.stringify(file) + "\n";
}

/**
 * Read a backup file. All-or-nothing: if any sermon is damaged the whole
 * restore is refused (details name which one), so a preview never shows a
 * partial set. Duplicate ids are refused too.
 */
export function parseBackupFile(text: string): SermonBackupFile {
  const raw = parseJson(text, MAX_BACKUP_FILE_BYTES);
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.kind === SERMON_FILE_KIND) {
    throw new SermonFileError(
      "WRONG_KIND",
      "This is a single sermon file, not a backup. Use Open to load it.",
    );
  }
  const env = backupEnvelope.safeParse(raw);
  if (!env.success) {
    if (o.kind !== SERMON_BACKUP_KIND) {
      throw new SermonFileError("WRONG_KIND", "This file isn't a sermon backup.");
    }
    throw new SermonFileError(
      "INVALID",
      "This backup is damaged or incomplete, so nothing was restored.",
      issuesOf(env.error),
    );
  }
  checkVersion(env.data.schemaVersion);
  const sermons = env.data.sermons.map((s, i) =>
    validateSermon(s, `sermons[${i}]`),
  );
  const seen = new Set<string>();
  for (const s of sermons) {
    if (seen.has(s.id)) {
      throw new SermonFileError(
        "INVALID",
        "This backup lists the same sermon twice, so nothing was restored.",
        [`duplicate id ${s.id}`],
      );
    }
    seen.add(s.id);
  }
  return {
    kind: SERMON_BACKUP_KIND,
    schemaVersion: SERMON_FILE_SCHEMA_VERSION,
    savedAt: env.data.savedAt,
    sermons,
  };
}

/**
 * True when the copy on disk was saved after the copy this tab loaded,
 * i.e. another tab or device wrote it. Frontend shows a warning instead of
 * silently overwriting.
 */
export function isNewerOnDisk(loadedSavedAt: string, diskSavedAt: string): boolean {
  return Date.parse(diskSavedAt) > Date.parse(loadedSavedAt);
}

/** Apostrophes (straight or curly) become word separators: "L'été" → "L-ete". */
const APOSTROPHE_RE = /['‘’ʼ]/g;

/**
 * File name for a sermon, using the export filename rules (accents become
 * plain letters, hyphen-separated). Every apostrophe becomes a hyphen, so no
 * letters are dropped or glued together.
 */
export function sermonFileName(title: string): string {
  const stem = sanitizeFilenameStem((title ?? "").replace(APOSTROPHE_RE, "-"));
  return `${stem}${SERMON_FILE_EXTENSION}`;
}
