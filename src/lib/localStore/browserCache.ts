import { parseSermonFile } from "@/lib/sermon-file";
import type { SermonDocument } from "@/types/document";
import { STORAGE_KEY } from "@/types/document";

/**
 * Browser copy of every sermon (localStorage). In folder mode it is the
 * automatic backup; in browser-only mode it is the store itself.
 * The active sermon is also mirrored to the legacy STORAGE_KEY so Preach
 * (and older builds) read it exactly as before.
 */
export const LIBRARY_KEY = "sermon-editor-presenter:library:v1";
export const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";

export interface CachedSermon {
  doc: SermonDocument;
  /** savedAt of the last completed write (folder file or browser store). */
  savedAt: string | null;
  /** Folder file this sermon lives in, when known. */
  fileName?: string;
  /** Edited here but not yet written to the folder. */
  dirty?: boolean;
}

export type Library = Record<string, CachedSermon>;

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function kv(store?: KV): KV | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLibrary(store?: KV): Library {
  const s = kv(store);
  if (!s) return {};
  let lib: Library = {};
  try {
    const raw = s.getItem(LIBRARY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Library;
      if (parsed && typeof parsed === "object") lib = parsed;
    }
  } catch {
    lib = {};
  }
  // Legacy single-document cache (pre local-only builds): fold it in so it
  // is never lost. Uses the shared v0 reader.
  try {
    const legacy = s.getItem(STORAGE_KEY);
    if (legacy) {
      const doc = parseSermonFile(legacy).sermon;
      const have = lib[doc.id];
      if (!have || Date.parse(doc.updatedAt) > Date.parse(have.doc.updatedAt)) {
        lib[doc.id] = { doc, savedAt: have?.savedAt ?? null, fileName: have?.fileName, dirty: true };
      }
    }
  } catch {
    /* corrupt legacy entry: ignore, library still intact */
  }
  return lib;
}

/** Throws (e.g. QuotaExceededError) so callers can show "storage is full". */
export function writeLibrary(lib: Library, store?: KV): void {
  const s = kv(store);
  if (!s) return;
  s.setItem(LIBRARY_KEY, JSON.stringify(lib));
}

export function getActiveId(store?: KV): string | null {
  try {
    return kv(store)?.getItem(ACTIVE_ID_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setActiveDoc(doc: SermonDocument, store?: KV): void {
  const s = kv(store);
  if (!s) return;
  s.setItem(STORAGE_KEY, JSON.stringify(doc));
  s.setItem(ACTIVE_ID_KEY, doc.id);
}

/** Put one sermon in the browser copy (and mirror it if active). Throws on quota. */
export function cacheSermon(
  entry: CachedSermon,
  opts: { active?: boolean } = {},
  store?: KV,
): Library {
  const lib = readLibrary(store);
  lib[entry.doc.id] = entry;
  writeLibrary(lib, store);
  if (opts.active) setActiveDoc(entry.doc, store);
  return lib;
}

export function uncacheSermon(id: string, store?: KV): Library {
  const lib = readLibrary(store);
  delete lib[id];
  const s = kv(store);
  if (s && s.getItem(ACTIVE_ID_KEY) === id) {
    s.removeItem(ACTIVE_ID_KEY);
    s.removeItem(STORAGE_KEY);
  }
  writeLibrary(lib, store);
  return lib;
}

export function newSermonId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
