import type { SermonDocument } from "@/types/document";
import type { DirHandleLike } from "./fsTypes";
import type { CachedSermon, Library } from "./browserCache";
import { listFolder, uniqueFileName, writeSermonFile, type FolderListing } from "./folder";

export interface SyncReport {
  library: Library;
  listing: FolderListing;
  written: string[];
  /** Ids of copies created because the folder had a newer, different version. */
  copies: string[];
}

function sameContent(a: SermonDocument, b: SermonDocument): boolean {
  return (
    JSON.stringify(a.content) === JSON.stringify(b.content) &&
    a.notes === b.notes &&
    a.title === b.title &&
    JSON.stringify(a.presentationSettings) === JSON.stringify(b.presentationSettings)
  );
}

/**
 * Bring the folder and the browser copy together without losing anything.
 * Used on first folder pick (migration of the existing browser cache) and on
 * every Edit load (pushes edits made while the folder was unavailable, e.g.
 * Preach setting changes or a lost permission).
 *
 * - Sermon only in the browser → written as a new file.
 * - Edited here, folder copy unchanged since → folder file updated.
 * - Edited here AND changed in the folder → this browser's version is saved
 *   as a separate "(copy from this browser)" sermon; neither is overwritten.
 * - Otherwise the folder copy wins and refreshes the browser copy.
 */
export async function syncFolderAndCache(
  dir: DirHandleLike,
  library: Library,
  newId: () => string,
  now: () => Date = () => new Date(),
): Promise<SyncReport> {
  const listing = await listFolder(dir);
  const lib: Library = {};
  const written: string[] = [];
  const copies: string[] = [];
  const byId = new Map(listing.entries.map((e) => [e.file.sermon.id, e]));
  const names = new Set(listing.entries.map((e) => e.fileName));
  for (const u of listing.unreadable) names.add(u.fileName);

  for (const e of listing.entries) {
    lib[e.file.sermon.id] = { doc: e.file.sermon, savedAt: e.file.savedAt, fileName: e.fileName };
  }

  for (const entry of Object.values(library)) {
    const doc = entry.doc;
    const disk = byId.get(doc.id);
    if (!disk) {
      const fileName = entry.fileName && !names.has(entry.fileName) ? entry.fileName : uniqueFileName(doc.title, names);
      names.add(fileName);
      const r = await writeSermonFile(dir, fileName, doc, { loadedSavedAt: null, now: now() });
      if (r.status === "ok") {
        lib[doc.id] = { doc, savedAt: r.savedAt, fileName };
        written.push(doc.id);
      }
      continue;
    }
    if (!entry.dirty || sameContent(doc, disk.file.sermon)) continue;
    const r = await writeSermonFile(dir, disk.fileName, doc, { loadedSavedAt: entry.savedAt, now: now() });
    if (r.status === "ok") {
      lib[doc.id] = { doc, savedAt: r.savedAt, fileName: disk.fileName };
      written.push(doc.id);
      continue;
    }
    const copy: SermonDocument = {
      ...doc,
      id: newId(),
      title: `${doc.title || "Untitled sermon"} (copy from this browser)`,
    };
    const fileName = uniqueFileName(copy.title, names);
    names.add(fileName);
    const w = await writeSermonFile(dir, fileName, copy, { loadedSavedAt: null, now: now() });
    if (w.status === "ok") {
      lib[copy.id] = { doc: copy, savedAt: w.savedAt, fileName } satisfies CachedSermon;
      copies.push(copy.id);
    }
  }
  return { library: lib, listing, written, copies };
}
