import {
  parseSermonFile,
  serializeSermonFile,
  sermonFileName,
  SERMON_FILE_EXTENSION,
  type SermonFile,
} from "@/lib/sermon-file";
import type { SermonDocument } from "@/types/document";
import type { DirHandleLike, FileHandleLike } from "./fsTypes";
import { decideWrite } from "./conflict";

export interface FolderEntry {
  fileName: string;
  file: SermonFile;
  /** Set when this file holds the same sermon id as another file (e.g. a Google Drive "Sermon (1).sermon" conflict copy). */
  conflictCopyOf?: string;
}

/** Marker in the in-app id of a conflict copy; it is written into the file on its first save. */
export const CONFLICT_COPY_MARK = ":conflict-copy-";

export function isConflictCopyId(id: string): boolean {
  return id.includes(CONFLICT_COPY_MARK);
}

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const RENAMED_COPY = /\s\(\d+\)\.sermon$/i;

/**
 * Two files with the same sermon id (sync tools copy instead of overwrite).
 * Keep both: the original keeps its id; every other file gets a stable,
 * file-specific id so the library lists it separately and saving it only
 * ever touches its own file. The original is the un-renamed file, then the
 * oldest save.
 */
function separateDuplicateIds(entries: FolderEntry[]): void {
  const groups = new Map<string, FolderEntry[]>();
  for (const e of entries) {
    const g = groups.get(e.file.sermon.id);
    if (g) g.push(e);
    else groups.set(e.file.sermon.id, [e]);
  }
  const used = new Set(groups.keys());
  for (const [id, group] of groups) {
    if (group.length < 2) continue;
    const ordered = [...group].sort(
      (a, b) =>
        Number(RENAMED_COPY.test(a.fileName)) - Number(RENAMED_COPY.test(b.fileName)) ||
        Date.parse(a.file.savedAt) - Date.parse(b.file.savedAt) ||
        a.fileName.localeCompare(b.fileName),
    );
    for (const e of ordered.slice(1)) {
      let newId = `${id.slice(0, 100)}${CONFLICT_COPY_MARK}${shortHash(e.fileName.toLowerCase())}`;
      while (used.has(newId)) newId += "x";
      used.add(newId);
      e.conflictCopyOf = id;
      e.file = { ...e.file, sermon: { ...e.file.sermon, id: newId } };
    }
  }
}

export interface FolderListing {
  entries: FolderEntry[];
  /** Files ending in .sermon that could not be read (damaged / newer version). */
  unreadable: { fileName: string; message: string }[];
}

async function readText(h: FileHandleLike): Promise<string> {
  return (await h.getFile()).text();
}

/** Read every `.sermon` file in the folder. Damaged files are reported, never thrown. */
export async function listFolder(dir: DirHandleLike): Promise<FolderListing> {
  const entries: FolderEntry[] = [];
  const unreadable: FolderListing["unreadable"] = [];
  for await (const h of dir.values()) {
    if (h.kind !== "file" || !h.name.toLowerCase().endsWith(SERMON_FILE_EXTENSION)) continue;
    try {
      entries.push({ fileName: h.name, file: parseSermonFile(await readText(h as FileHandleLike)) });
    } catch (err) {
      unreadable.push({ fileName: h.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  separateDuplicateIds(entries);
  entries.sort((a, b) => Date.parse(b.file.sermon.updatedAt) - Date.parse(a.file.sermon.updatedAt));
  return { entries, unreadable };
}

/** `Title.sermon`, or `Title (2).sermon` when another sermon already uses the name. */
export function uniqueFileName(title: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((n) => n.toLowerCase()));
  const base = sermonFileName(title || "Untitled sermon");
  if (!used.has(base.toLowerCase())) return base;
  const stem = base.slice(0, -SERMON_FILE_EXTENSION.length);
  for (let i = 2; ; i++) {
    const n = `${stem} (${i})${SERMON_FILE_EXTENSION}`;
    if (!used.has(n.toLowerCase())) return n;
  }
}

export async function readFolderFile(dir: DirHandleLike, fileName: string): Promise<SermonFile | null> {
  let h: FileHandleLike;
  try {
    h = await dir.getFileHandle(fileName);
  } catch (err) {
    if ((err as { name?: string })?.name === "NotFoundError") {
      // The file is gone — but if the folder itself moved, surface that.
      await assertFolderReachable(dir);
      return null;
    }
    throw err;
  }
  return parseSermonFile(await readText(h));
}

/** Throws NotFoundError when the folder was moved or deleted. */
export async function assertFolderReachable(dir: DirHandleLike): Promise<void> {
  const it = dir.values()[Symbol.asyncIterator]();
  await it.next();
  await it.return?.();
}

export type WriteResult =
  | { status: "ok"; savedAt: string }
  | { status: "conflict"; disk: SermonFile };

/**
 * Write one sermon. Reads the current file first and refuses (conflict) when
 * it was saved after `loadedSavedAt`, unless `force`. Only resolves "ok"
 * after the writable stream has been closed, i.e. the bytes are committed.
 */
export async function writeSermonFile(
  dir: DirHandleLike,
  fileName: string,
  doc: SermonDocument,
  opts: { loadedSavedAt: string | null; force?: boolean; now?: Date },
): Promise<WriteResult> {
  let disk: SermonFile | null = null;
  try {
    disk = await readFolderFile(dir, fileName);
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "NotFoundError" || name === "NotAllowedError" || name === "SecurityError") throw err;
    disk = null; // damaged file on disk: overwriting with a good copy is fine
  }
  if (decideWrite(opts.loadedSavedAt, disk?.savedAt, opts.force) === "conflict" && disk) {
    return { status: "conflict", disk };
  }
  let savedAt = (opts.now ?? new Date()).toISOString();
  // Keep savedAt strictly increasing so another tab's check always sees it.
  if (disk && Date.parse(savedAt) <= Date.parse(disk.savedAt)) {
    savedAt = new Date(Date.parse(disk.savedAt) + 1).toISOString();
  }
  const text = serializeSermonFile(doc, new Date(savedAt));
  const h = await dir.getFileHandle(fileName, { create: true });
  const w = await h.createWritable();
  try {
    await w.write(text);
    await w.close();
  } catch (err) {
    try {
      await w.abort?.(err);
    } catch {
      /* already failed */
    }
    throw err;
  }
  return { status: "ok", savedAt };
}

export async function removeSermonFile(dir: DirHandleLike, fileName: string): Promise<void> {
  try {
    await dir.removeEntry(fileName);
  } catch (err) {
    if ((err as { name?: string })?.name !== "NotFoundError") throw err;
  }
}
