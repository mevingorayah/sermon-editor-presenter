/**
 * File-based sermon persistence under data/sermons/.
 *
 * Suitable for local/dev and Cloud Run with an ephemeral disk or mounted volume.
 * Production can swap this module for a DB-backed store without changing API routes.
 */

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  CreateSermonInput,
  Sermon,
  UpdateContentInput,
  UpdateSermonInput,
} from "./types";
import { sanitizeDocumentJson, sanitizeText } from "./sanitize";
import { normalizeBlockLayout, normalizeGlobalStyles } from "./blockStyle";

const DATA_DIR =
  process.env.SERMON_DATA_DIR ||
  path.join(process.cwd(), "data", "sermons");

const EMPTY_DOC = { type: "doc", content: [] as unknown[] };

function sermonPath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** Path ids must be UUID — seed-* / local-* never reach the file store. */
const SERVER_SERMON_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertSafeId(id: string): void {
  if (!SERVER_SERMON_ID_RE.test(id)) {
    throw new StoreError("Invalid sermon id", 400);
  }
}

export class StoreError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export async function listSermons(): Promise<Sermon[]> {
  await ensureDataDir();
  const entries = await fs.readdir(DATA_DIR);
  const files = entries.filter(
    (f) => f.endsWith(".json") && f !== "README.md",
  );
  const sermons: Sermon[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      sermons.push(JSON.parse(raw) as Sermon);
    } catch {
      // skip corrupt
    }
  }
  sermons.sort((a, b) => b.meta.updatedAt.localeCompare(a.meta.updatedAt));
  return sermons;
}

export async function getSermon(id: string): Promise<Sermon | null> {
  assertSafeId(id);
  await ensureDataDir();
  try {
    const raw = await fs.readFile(sermonPath(id), "utf8");
    return JSON.parse(raw) as Sermon;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function createSermon(
  input: CreateSermonInput = {},
): Promise<Sermon> {
  await ensureDataDir();
  const now = new Date().toISOString();
  let id: string = randomUUID();
  if (input.id !== undefined) {
    assertSafeId(input.id);
    id = input.id.toLowerCase();
  }
  const title = sanitizeText(input.title?.trim() || "Untitled sermon");
  const content = normalizeBlockLayout(
    sanitizeDocumentJson(input.content ?? EMPTY_DOC),
  );
  const sermon: Sermon = {
    id,
    meta: { title, createdAt: now, updatedAt: now },
    content,
    ...(input.presentation ? { presentation: input.presentation } : {}),
    ...(input.notes !== undefined
      ? { notes: sanitizeText(input.notes) }
      : {}),
    ...(input.globalStyles
      ? { globalStyles: normalizeGlobalStyles(input.globalStyles) }
      : {}),
  };
  try {
    // "wx" fails if the file exists, so a client-chosen id never overwrites.
    await fs.writeFile(sermonPath(id), JSON.stringify(sermon, null, 2), {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new StoreError("Sermon already exists", 409);
    }
    throw err;
  }
  return sermon;
}

export async function updateSermon(
  id: string,
  input: UpdateSermonInput,
): Promise<Sermon> {
  assertSafeId(id);
  const existing = await getSermon(id);
  if (!existing) throw new StoreError("Sermon not found", 404);

  const now = new Date().toISOString();
  const next: Sermon = {
    ...existing,
    meta: {
      ...existing.meta,
      title:
        input.title !== undefined
          ? sanitizeText(input.title.trim() || existing.meta.title)
          : existing.meta.title,
      updatedAt: now,
    },
    content:
      input.content !== undefined
        ? normalizeBlockLayout(sanitizeDocumentJson(input.content))
        : existing.content,
  };

  if (input.globalStyles === null) {
    delete next.globalStyles;
  } else if (input.globalStyles !== undefined) {
    next.globalStyles = normalizeGlobalStyles(input.globalStyles);
  }

  if (input.presentation === null) {
    delete next.presentation;
  } else if (input.presentation !== undefined) {
    next.presentation = input.presentation;
  }

  if (input.notes === null) {
    delete next.notes;
  } else if (input.notes !== undefined) {
    next.notes = sanitizeText(input.notes);
  }

  await fs.writeFile(sermonPath(id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function updateContent(
  id: string,
  input: UpdateContentInput,
): Promise<Sermon> {
  assertSafeId(id);
  const existing = await getSermon(id);
  if (!existing) throw new StoreError("Sermon not found", 404);

  const now = new Date().toISOString();
  const rawDoc = input.content ?? input.document;
  const next: Sermon = {
    ...existing,
    content:
      rawDoc !== undefined
        ? normalizeBlockLayout(sanitizeDocumentJson(rawDoc))
        : existing.content,
    meta: {
      ...existing.meta,
      title:
        input.title !== undefined
          ? sanitizeText(input.title.trim() || existing.meta.title)
          : existing.meta.title,
      updatedAt: now,
    },
  };
  await fs.writeFile(sermonPath(id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export async function deleteSermon(id: string): Promise<boolean> {
  assertSafeId(id);
  const existing = await getSermon(id);
  if (!existing) return false;
  await fs.unlink(sermonPath(id));
  return true;
}

export function getDataDir(): string {
  return DATA_DIR;
}
