import type { DirHandleLike } from "./fsTypes";

/** The chosen folder handle lives in IndexedDB (handles can't go in localStorage). */
const DB = "sermon-editor-presenter";
const STORE = "handles";
const KEY = "sermons-folder";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export async function loadFolderHandle(): Promise<DirHandleLike | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    return ((await tx("readonly", (s) => s.get(KEY))) as DirHandleLike | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveFolderHandle(h: DirHandleLike): Promise<void> {
  await tx("readwrite", (s) => s.put(h, KEY));
}

export async function clearFolderHandle(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await tx("readwrite", (s) => s.delete(KEY));
}
