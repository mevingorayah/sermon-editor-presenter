"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Editor, JSONContent } from "@tiptap/react";
import { extractTitleFromContent, loadDocument } from "@/lib/documentStore";
import { extractOutline } from "@/lib/outline";
import { createSeedDocument } from "@/lib/seed";
import {
  parseSermonFile,
  serializeBackupFile,
  serializeSermonFile,
  sermonFileName,
  SermonFileError,
  type SermonBackupFile,
} from "@/lib/sermon-file";
import {
  folderApiAvailable,
  pickSermonsFolder,
  queryFolderPermission,
  requestFolderPermission,
  type DirHandleLike,
} from "@/lib/localStore/fsTypes";
import { loadFolderHandle, saveFolderHandle } from "@/lib/localStore/handleStore";
import {
  cacheSermon,
  newSermonId,
  readLibrary,
  setActiveDoc,
  uncacheSermon,
  writeLibrary,
  getActiveId,
  type Library,
} from "@/lib/localStore/browserCache";
import {
  isConflictCopyId,
  RestoreWriteError,
  writeSermonFilesAtomically,
  readFolderFile,
  removeSermonFile,
  uniqueFileName,
  writeSermonFile,
} from "@/lib/localStore/folder";
import { syncFolderAndCache } from "@/lib/localStore/sync";
import { decideWrite, isStaleFor, presenceAction, SYNC_CHANNEL, type SyncMessage } from "@/lib/localStore/conflict";
import {
  ACTION_LABELS,
  isSaved,
  nextStatus,
  statusAction,
  statusDisplay,
  type SaveEvent,
  type SaveStatus,
} from "@/lib/localStore/status";
import {
  backupFileName,
  FIRST_USE_KEY,
  LAST_BACKUP_KEY,
  planRestore,
  previewRestore,
  REMINDER_DISMISSED_KEY,
  shouldShowBackupReminder,
  type ConflictChoice,
  type RestorePreview,
  parseRestoreFile,
} from "@/lib/localStore/backup";
import type { SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";
import { SermonEditor } from "./SermonEditor";
import { OutlineNav } from "./OutlineNav";
import { FindBar } from "./FindBar";
import { NotesPanel } from "./NotesPanel";
import { SermonList } from "./SermonList";
import {
  BackupBanner,
  BrowserOnlyBanner,
  ConflictPrompt,
  OpenElsewhereBanner,
  FirstRunScreen,
  ConfirmDialog,
  MessageDialog,
  RestorePreviewDialog,
} from "./StoragePanels";
import { saveTextToPc } from "@/lib/localStore/saveToPc";
import styles from "./EditShell.module.css";

export const STORAGE_MODE_KEY = "sermon-editor-presenter:storage-mode:v1";
const SAVE_DELAY_MS = 500;

type Mode = "loading" | "first-run" | "folder" | "browser";

function ls(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function blankSermon(): SermonDocument {
  return {
    id: newSermonId(),
    title: "Untitled sermon",
    updatedAt: new Date().toISOString(),
    content: { type: "doc", content: [{ type: "title", content: [] }] },
    presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS },
    notes: "",
  };
}

function newest(lib: Library): SermonDocument | null {
  return (
    Object.values(lib)
      .map((e) => e.doc)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null
  );
}

export function EditShell() {
  const [mode, setMode] = useState<Mode>("loading");
  const [folderApi, setFolderApi] = useState(false);
  const [folderReady, setFolderReady] = useState(false);
  const [doc, setDoc] = useState<SermonDocument | null>(null);
  const [library, setLibrary] = useState<Library>({});
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "saving" });
  const [busy, setBusy] = useState(false);
  const [editorKey, setEditorKey] = useState("");
  const [conflict, setConflict] = useState<{ theirs: SermonDocument; savedAt: string } | null>(null);
  const [firstRunError, setFirstRunError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ title: string; message: string; details?: string[] } | null>(null);
  const [restore, setRestore] = useState<{ backup: SermonBackupFile; preview: RestorePreview } | null>(null);
  const [restoreChoices, setRestoreChoices] = useState<Record<string, ConflictChoice>>({});
  const [showReminder, setShowReminder] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openElsewhere, setOpenElsewhere] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<SermonDocument | null>(null);

  const docRef = useRef<SermonDocument | null>(null);
  const dirRef = useRef<DirHandleLike | null>(null);
  const folderReadyRef = useRef(false);
  const modeRef = useRef<Mode>("loading");
  /** savedAt of the version this tab loaded or last wrote, per open sermon. */
  const loadedSavedAt = useRef<string | null>(null);
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writing = useRef<Promise<void> | null>(null);
  const conflictRef = useRef(false);
  const tabId = useRef(newSermonId());
  const channel = useRef<BroadcastChannel | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const keyCounter = useRef(0);
  const openFileInput = useRef<HTMLInputElement>(null);
  /** Edits made since the last Save to PC / Open (the .sermon file is behind). */
  const fileDirty = useRef(false);
  /** The open sermon had edits not yet written when Restore was started. */
  const restoreOpenDirty = useRef(false);

  /** The save status stays empty until this session's first edit/save. */
  const [statusShown, setStatusShown] = useState(false);
  const statusShownRef = useRef(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const apply = useCallback((ev: SaveEvent) => {
    if (ev.type === "edit" || ev.type === "write-failed" || ev.type === "conflict") {
      statusShownRef.current = true;
      setStatusShown(true);
    }
    if (ev.type === "write-ok" && statusShownRef.current) setSavedAt(new Date());
    setStatus((s) => nextStatus(s, ev));
  }, []);
  const broadcast = useCallback((m: Omit<SyncMessage, "tabId">) => {
    channel.current?.postMessage({ ...m, tabId: tabId.current } satisfies SyncMessage);
  }, []);

  const showDoc = useCallback((d: SermonDocument, savedAt: string | null) => {
    const prevId = docRef.current?.id;
    if (prevId !== d.id) {
      if (prevId) channel.current?.postMessage({ type: "closed", id: prevId, tabId: tabId.current } satisfies SyncMessage);
      setOpenElsewhere(false);
    }
    // Presence ping on open (ST9): a tab with the same sermon open warns and answers.
    channel.current?.postMessage({ type: "opened", id: d.id, tabId: tabId.current } satisfies SyncMessage);
    docRef.current = d;
    loadedSavedAt.current = savedAt;
    savedSeq.current = editSeq.current;
    conflictRef.current = false;
    setConflict(null);
    setDoc(d);
    keyCounter.current += 1;
    setEditorKey(`${d.id}:${keyCounter.current}`);
    try {
      setActiveDoc(d);
    } catch {
      /* quota: Preach falls back to the library */
    }
  }, []);

  const refreshReminder = useCallback(() => {
    setShowReminder(
      shouldShowBackupReminder({
        now: Date.now(),
        lastBackupAt: ls(LAST_BACKUP_KEY),
        firstUseAt: ls(FIRST_USE_KEY),
        dismissedAt: ls(REMINDER_DISMISSED_KEY),
      }),
    );
  }, []);

  /** Sync folder ↔ browser copy, then open the active sermon from the folder. */
  const connectFolder = useCallback(
    async (dir: DirHandleLike) => {
      const report = await syncFolderAndCache(dir, readLibrary(), newSermonId);
      let lib = report.library;
      if (Object.keys(lib).length === 0) {
        const seed = { ...createSeedDocument(), id: newSermonId() };
        const fileName = uniqueFileName(seed.title, []);
        const r = await writeSermonFile(dir, fileName, seed, { loadedSavedAt: null });
        if (r.status === "ok") lib = { [seed.id]: { doc: seed, savedAt: r.savedAt, fileName } };
      }
      try {
        writeLibrary(lib);
      } catch {
        /* browser copy full: folder still has everything */
      }
      dirRef.current = dir;
      folderReadyRef.current = true;
      setFolderReady(true);
      modeRef.current = "folder";
      setMode("folder");
      setLibrary(lib);
      const active = getActiveId();
      const pick = (active && lib[active]?.doc) || newest(lib)!;
      showDoc(pick, lib[pick.id]?.savedAt ?? null);
      apply({ type: "write-ok", target: "folder" });
      const notes: string[] = [];
      if (report.copies.length)
        notes.push(
          `${report.copies.length} sermon(s) had different versions in this browser and the folder. Both were kept; look for "(copy from this browser)".`,
        );
      if (report.listing.unreadable.length)
        notes.push(
          `${report.listing.unreadable.length} file(s) in the folder couldn't be opened: ${report.listing.unreadable
            .map((u) => `${u.fileName} (${u.message})`)
            .join("; ")}`,
        );
      if (notes.length) setMessage({ title: "Sermons folder", message: notes.join(" ") });
    },
    [apply, showDoc],
  );

  const startBrowserMode = useCallback(() => {
    modeRef.current = "browser";
    setMode("browser");
    const d = loadDocument();
    const lib = readLibrary();
    setLibrary(lib);
    showDoc(d, lib[d.id]?.savedAt ?? null);
    apply({ type: "write-ok", target: "browser" });
  }, [apply, showDoc]);

  // Boot: decide folder / browser / first run.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ls(FIRST_USE_KEY)) lsSet(FIRST_USE_KEY, new Date().toISOString());
      refreshReminder();
      const api = folderApiAvailable();
      setFolderApi(api);
      const pref = ls(STORAGE_MODE_KEY);
      const handle = api ? await loadFolderHandle() : null;
      if (cancelled) return;
      if (handle) {
        dirRef.current = handle;
        let perm: string = "prompt";
        try {
          perm = await queryFolderPermission(handle);
        } catch {
          perm = "prompt";
        }
        if (cancelled) return;
        if (perm === "granted") {
          try {
            await connectFolder(handle);
            return;
          } catch (err) {
            if (cancelled) return;
            // Folder moved / deleted: keep working from the browser copy.
            modeRef.current = "folder";
            setMode("folder");
            const d = loadDocument();
            const lib = readLibrary();
            setLibrary(lib);
            showDoc(d, lib[d.id]?.savedAt ?? null);
            apply({ type: "write-failed", target: "folder", error: err });
            return;
          }
        }
        modeRef.current = "folder";
        setMode("folder");
        const d = loadDocument();
        const lib = readLibrary();
        setLibrary(lib);
        showDoc(d, lib[d.id]?.savedAt ?? null);
        apply({ type: "permission-needed" });
        return;
      }
      if (pref === "browser") {
        startBrowserMode();
        return;
      }
      modeRef.current = "first-run";
      setMode("first-run");
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, connectFolder, refreshReminder, showDoc, startBrowserMode]);

  /** Write the open sermon. Never reports saved unless the write completed. */
  const persist = useCallback(
    async (force = false): Promise<void> => {
      if (writing.current) {
        await writing.current;
      }
      const d = docRef.current;
      if (!d || (conflictRef.current && !force)) return;
      const seq = editSeq.current;
      const run = (async () => {
        if (folderReadyRef.current && dirRef.current) {
          const lib = readLibrary();
          const fileName =
            lib[d.id]?.fileName ??
            uniqueFileName(
              d.title,
              Object.values(lib)
                .map((e) => e.fileName)
                .filter((n): n is string => !!n),
            );
          try {
            const r = await writeSermonFile(dirRef.current, fileName, d, {
              loadedSavedAt: loadedSavedAt.current,
              force,
            });
            if (r.status === "conflict") {
              conflictRef.current = true;
              setConflict({ theirs: r.disk.sermon, savedAt: r.disk.savedAt });
              apply({ type: "conflict" });
              return;
            }
            loadedSavedAt.current = r.savedAt;
            conflictRef.current = false;
            setConflict(null);
            try {
              const next = cacheSermon(
                { doc: d, savedAt: r.savedAt, fileName, dirty: seq !== editSeq.current },
                { active: true },
              );
              setLibrary(next);
            } catch {
              setLibrary((l) => ({ ...l, [d.id]: { doc: d, savedAt: r.savedAt, fileName } }));
            }
            broadcast({ type: "saved", id: d.id, savedAt: r.savedAt });
            if (seq === editSeq.current) {
              savedSeq.current = seq;
              apply({ type: "write-ok", target: "folder" });
            }
          } catch (err) {
            apply({ type: "write-failed", target: "folder", error: err });
          }
          return;
        }
        if (modeRef.current === "folder") {
          // Folder known but not reachable / not permitted: browser copy only.
          try {
            const lib = readLibrary();
            const prev = lib[d.id];
            lib[d.id] = { doc: d, savedAt: prev?.savedAt ?? null, fileName: prev?.fileName, dirty: true };
            writeLibrary(lib);
            setActiveDoc(d);
            setLibrary(lib);
            if (seq === editSeq.current) savedSeq.current = seq;
            setStatus((s) => (s.kind === "saving" ? { kind: "needs-permission" } : s));
          } catch (err) {
            apply({ type: "write-failed", target: "browser", error: err });
          }
          return;
        }
        // Browser-only mode: the browser store is the store; same savedAt guard.
        try {
          const lib = readLibrary();
          const cur = lib[d.id];
          if (decideWrite(loadedSavedAt.current, cur?.savedAt, force) === "conflict" && cur) {
            conflictRef.current = true;
            setConflict({ theirs: cur.doc, savedAt: cur.savedAt! });
            apply({ type: "conflict" });
            return;
          }
          let savedAt = new Date().toISOString();
          if (cur?.savedAt && Date.parse(savedAt) <= Date.parse(cur.savedAt)) {
            savedAt = new Date(Date.parse(cur.savedAt) + 1).toISOString();
          }
          lib[d.id] = { doc: d, savedAt, fileName: cur?.fileName, dirty: true };
          writeLibrary(lib);
          setActiveDoc(d);
          loadedSavedAt.current = savedAt;
          conflictRef.current = false;
          setConflict(null);
          setLibrary(lib);
          broadcast({ type: "saved", id: d.id, savedAt });
          if (seq === editSeq.current) {
            savedSeq.current = seq;
            apply({ type: "write-ok", target: "browser" });
          }
        } catch (err) {
          apply({ type: "write-failed", target: "browser", error: err });
        }
      })();
      writing.current = run;
      try {
        await run;
      } finally {
        if (writing.current === run) writing.current = null;
      }
      if (seq !== editSeq.current && !conflictRef.current) schedule();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, broadcast],
  );

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void persist();
    }, SAVE_DELAY_MS);
  }, [persist]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await persist();
    } else if (writing.current) {
      await writing.current;
    }
  }, [persist]);

  const hasUnsavedEdits = () => editSeq.current !== savedSeq.current;

  const edited = useCallback(
    (next: SermonDocument) => {
      docRef.current = next;
      editSeq.current += 1;
      fileDirty.current = true;
      apply({ type: "edit" });
      if (modeRef.current === "folder") {
        // Automatic browser backup on every keystroke (folder mode only, so a
        // browser-only tab never overwrites another tab's copy unchecked).
        try {
          const lib = readLibrary();
          const prev = lib[next.id];
          lib[next.id] = { doc: next, savedAt: prev?.savedAt ?? null, fileName: prev?.fileName, dirty: true };
          writeLibrary(lib);
          setActiveDoc(next);
        } catch {
          /* quota: the folder write still happens */
        }
      }
      schedule();
    },
    [apply, schedule],
  );

  const onContentChange = useCallback(
    (content: JSONContent) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next: SermonDocument = {
          ...prev,
          content,
          title: extractTitleFromContent(content) ?? prev.title,
          updatedAt: new Date().toISOString(),
        };
        edited(next);
        return next;
      });
    },
    [edited],
  );

  const onNotesChange = useCallback(
    (notes: string) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next: SermonDocument = { ...prev, notes, updatedAt: new Date().toISOString() };
        edited(next);
        return next;
      });
    },
    [edited],
  );

  // Browser-only writes are synchronous, so flush them on close.
  useEffect(() => {
    const onUnload = () => {
      if (timer.current && modeRef.current === "browser") {
        clearTimeout(timer.current);
        void persist();
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [persist]);

  /** Read the latest copy of a sermon from wherever it lives. */
  const readLatest = useCallback(async (id: string) => {
    const lib = readLibrary();
    const entry = lib[id];
    if (folderReadyRef.current && dirRef.current && entry?.fileName) {
      const f = await readFolderFile(dirRef.current, entry.fileName, id);
      if (f) return { doc: f.sermon, savedAt: f.savedAt };
    }
    return entry ? { doc: entry.doc, savedAt: entry.savedAt } : null;
  }, []);

  // Two tabs: hear about saves elsewhere.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SYNC_CHANNEL);
    channel.current = ch;
    ch.onmessage = async (e: MessageEvent<SyncMessage>) => {
      const msg = e.data;
      if (msg.tabId === tabId.current) return;
      const presence = presenceAction(msg, tabId.current, docRef.current?.id ?? null);
      if (presence === "warn" || presence === "warn-and-reply") setOpenElsewhere(true);
      if (presence === "clear") setOpenElsewhere(false);
      if (presence === "warn-and-reply") {
        ch.postMessage({ type: "here", id: msg.id, tabId: tabId.current } satisfies SyncMessage);
      }
      if (msg.type === "opened" || msg.type === "here" || msg.type === "closed") return;
      setLibrary(readLibrary());
      const d = docRef.current;
      if (!d || !isStaleFor(msg, tabId.current, d.id, loadedSavedAt.current)) return;
      if (msg.type === "deleted") return; // next save re-creates the file
      try {
        const latest = await readLatest(d.id);
        if (!latest) return;
        if (!hasUnsavedEdits() && !timer.current && !writing.current) {
          showDoc(latest.doc, latest.savedAt);
          apply({ type: "write-ok", target: folderReadyRef.current ? "folder" : "browser" });
        } else {
          conflictRef.current = true;
          setConflict({ theirs: latest.doc, savedAt: latest.savedAt ?? new Date().toISOString() });
          apply({ type: "conflict" });
        }
      } catch {
        /* folder unreachable: the next write reports it */
      }
    };
    if (docRef.current) ch.postMessage({ type: "opened", id: docRef.current.id, tabId: tabId.current } satisfies SyncMessage);
    const onHide = () => {
      if (docRef.current) ch.postMessage({ type: "closed", id: docRef.current.id, tabId: tabId.current } satisfies SyncMessage);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      ch.close();
      channel.current = null;
    };
  }, [apply, readLatest, showDoc]);

  // Ask the browser to keep local data (ST2/ST15). Refusal strengthens the browser-only banner.
  useEffect(() => {
    const st = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!st?.persist) return;
    let live = true;
    void (async () => {
      try {
        const already = st.persisted ? await st.persisted() : false;
        const ok = already || (await st.persist());
        if (live) setPersisted(ok);
      } catch {
        if (live) setPersisted(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const keepMine = useCallback(() => {
    conflictRef.current = false;
    setConflict(null);
    apply({ type: "edit" });
    void persist(true);
  }, [apply, persist]);

  const loadTheirs = useCallback(() => {
    if (!conflict) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    showDoc(conflict.theirs, conflict.savedAt);
    try {
      cacheSermon({ ...(readLibrary()[conflict.theirs.id] ?? {}), doc: conflict.theirs, savedAt: conflict.savedAt }, { active: true });
    } catch {
      /* ignore */
    }
    setLibrary(readLibrary());
    apply({ type: "write-ok", target: folderReadyRef.current ? "folder" : "browser" });
  }, [apply, conflict, showDoc]);

  const chooseFolder = useCallback(async () => {
    setFirstRunError(null);
    let dir: DirHandleLike;
    try {
      dir = await pickSermonsFolder();
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setFirstRunError("That folder couldn't be used. Try another folder.");
      }
      return;
    }
    try {
      if ((await requestFolderPermission(dir)) !== "granted") {
        setFirstRunError("The app needs permission to save in that folder.");
        return;
      }
      await flush();
      if (docRef.current) {
        try {
          setActiveDoc(docRef.current);
        } catch {
          /* ignore */
        }
      }
      await saveFolderHandle(dir);
      lsSet(STORAGE_MODE_KEY, "folder");
      await connectFolder(dir);
      setMenuOpen(false);
    } catch (err) {
      setFirstRunError("That folder couldn't be used. Try another folder.");
      if (modeRef.current !== "first-run") apply({ type: "write-failed", target: "folder", error: err });
    }
  }, [apply, connectFolder, flush]);

  const allowAccess = useCallback(async () => {
    const dir = dirRef.current;
    if (!dir) return chooseFolder();
    try {
      if ((await requestFolderPermission(dir)) === "granted") {
        await flush();
        await connectFolder(dir);
      }
    } catch (err) {
      apply({ type: "write-failed", target: "folder", error: err });
    }
  }, [apply, chooseFolder, connectFolder, flush]);

  const useBrowser = useCallback(() => {
    lsSet(STORAGE_MODE_KEY, "browser");
    startBrowserMode();
  }, [startBrowserMode]);

  const openSermon = useCallback(
    async (id: string) => {
      if (docRef.current?.id === id) return;
      setBusy(true);
      try {
        await flush();
        const latest = await readLatest(id);
        if (latest) {
          showDoc(latest.doc, latest.savedAt);
          apply({ type: "write-ok", target: folderReadyRef.current ? "folder" : "browser" });
        }
      } catch (err) {
        apply({ type: "write-failed", target: "folder", error: err });
      } finally {
        setBusy(false);
      }
    },
    [apply, flush, readLatest, showDoc],
  );

  const onCreate = useCallback(async () => {
    setBusy(true);
    try {
      await flush();
      const d = blankSermon();
      d.presentationSettings = docRef.current?.presentationSettings ?? d.presentationSettings;
      showDoc(d, null);
      editSeq.current += 1;
      apply({ type: "edit" });
      await persist();
    } finally {
      setBusy(false);
    }
  }, [apply, flush, persist, showDoc]);

  const onDelete = useCallback(
    async (id: string) => {
      const entry = readLibrary()[id];
      const title = entry?.doc.title || "this sermon";
      if (!window.confirm(`Delete “${title}”?`)) return;
      setBusy(true);
      try {
        if (docRef.current?.id === id && timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        if (folderReadyRef.current && dirRef.current && entry?.fileName) {
          await removeSermonFile(dirRef.current, entry.fileName);
        }
        const lib = uncacheSermon(id);
        setLibrary(lib);
        broadcast({ type: "deleted", id });
        if (docRef.current?.id === id) {
          const next = newest(lib);
          if (next) {
            showDoc(next, lib[next.id]?.savedAt ?? null);
            apply({ type: "write-ok", target: folderReadyRef.current ? "folder" : "browser" });
          } else {
            await onCreate();
          }
        }
      } catch (err) {
        apply({ type: "write-failed", target: folderReadyRef.current ? "folder" : "browser", error: err });
      } finally {
        setBusy(false);
      }
    },
    [apply, broadcast, onCreate, showDoc],
  );

  /** Every sermon, freshest copy (folder when available, else browser copy). */
  const allSermons = useCallback(async (): Promise<SermonDocument[]> => {
    await flush();
    if (folderReadyRef.current && dirRef.current) {
      const r = await syncFolderAndCache(dirRef.current, readLibrary(), newSermonId);
      try {
        writeLibrary(r.library);
      } catch {
        /* ignore */
      }
      setLibrary(r.library);
      return Object.values(r.library).map((e) => e.doc);
    }
    const lib = readLibrary();
    if (docRef.current) lib[docRef.current.id] = { ...(lib[docRef.current.id] ?? { savedAt: null }), doc: docRef.current };
    return Object.values(lib).map((e) => e.doc);
  }, [flush]);

  const onBackup = useCallback(async () => {
    setMenuOpen(false);
    try {
      const docs = await allSermons();
      const text = serializeBackupFile(docs);
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      lsSet(LAST_BACKUP_KEY, new Date().toISOString());
      refreshReminder();
    } catch (err) {
      setMessage({
        title: "Back up",
        message: "The backup couldn't be made. Your sermons are unchanged.",
        details: [err instanceof Error ? err.message : String(err)],
      });
    }
  }, [allSermons, refreshReminder]);

  const onRestoreFile = useCallback(
    async (file: File) => {
      restoreOpenDirty.current = hasUnsavedEdits() || !!timer.current || conflictRef.current;
      try {
        const backup = parseRestoreFile(await file.text());
        const preview = previewRestore(await allSermons(), backup);
        setRestoreChoices({});
        setRestore({ backup, preview });
      } catch (err) {
        if (err instanceof SermonFileError) {
          setMessage({ title: "Restore", message: err.message, details: err.details });
        } else {
          setMessage({ title: "Restore", message: "This file couldn't be read, so nothing was restored." });
        }
      }
    },
    [allSermons],
  );

  const applyRestore = useCallback(async () => {
    if (!restore) return;
    setBusy(true);
    try {
      const openDirty =
        restoreOpenDirty.current || hasUnsavedEdits() || !!timer.current || conflictRef.current;
      await flush();
      const open = docRef.current;
      const existing = await allSermons();
      const plan = planRestore(existing, restore.backup, restoreChoices, newSermonId);
      const writes = [...plan.toWrite];
      // Replacing the open sermon while it has unsaved edits: keep those edits as their own sermon.
      if (open && openDirty && plan.replaced.includes(open.id)) {
        writes.push({ ...open, id: newSermonId(), title: `${open.title || "Untitled sermon"} (my edits)` });
      }
      const lib = readLibrary();
      const names = new Set(Object.values(lib).map((e) => e.fileName).filter((n): n is string => !!n));
      // All-or-nothing (ST20/ST11): temp files first, renamed only when every write succeeded.
      if (folderReadyRef.current && dirRef.current) {
        const items = writes.map((d) => {
          const fileName = lib[d.id]?.fileName ?? uniqueFileName(d.title, names);
          names.add(fileName);
          return { fileName, doc: d };
        });
        const saved = await writeSermonFilesAtomically(dirRef.current, items);
        for (const it of items) lib[it.doc.id] = { doc: it.doc, savedAt: saved[it.fileName], fileName: it.fileName };
      } else {
        for (const d of writes) lib[d.id] = { doc: d, savedAt: new Date().toISOString(), dirty: true };
      }
      writeLibrary(lib); // one setItem: all or nothing in browser mode
      setLibrary(lib);
      broadcast({ type: "restored" });
      if (open && plan.replaced.includes(open.id)) {
        showDoc(lib[open.id].doc, lib[open.id].savedAt);
      }
      apply({ type: "write-ok", target: folderReadyRef.current ? "folder" : "browser" });
      setRestore(null);
      const parts = [`Restored ${writes.length} ${writes.length === 1 ? "sermon" : "sermons"}.`];
      if (plan.keptBoth.length) parts.push(`${plan.keptBoth.length} kept as separate "(restored)" copies.`);
      setMessage({ title: "Restore", message: parts.join(" ") });
    } catch (err) {
      setMessage({
        title: "Restore",
        message:
          err instanceof RestoreWriteError
            ? `Nothing was restored. ${err.message} Your sermons are unchanged; try again.`
            : "Nothing was restored. The restore couldn't finish; your sermons are unchanged, try again.",
        details: [err instanceof RestoreWriteError ? String((err.cause as Error)?.message ?? err.cause) : err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setBusy(false);
    }
  }, [allSermons, apply, broadcast, flush, restore, restoreChoices, showDoc]);

  const onSaveToPc = useCallback(async () => {
    setMenuOpen(false);
    const d = docRef.current;
    if (!d) return;
    try {
      const r = await saveTextToPc(serializeSermonFile(d), sermonFileName(d.title || "Untitled sermon"));
      if (r !== "cancelled") fileDirty.current = false;
    } catch (err) {
      setMessage({
        title: "Save to PC",
        message: "The sermon couldn't be saved to your PC. It is still safe here; try again.",
        details: [err instanceof Error ? err.message : String(err)],
      });
    }
  }, []);

  const loadOpenedSermon = useCallback(
    async (d: SermonDocument) => {
      setConfirmOpen(null);
      setBusy(true);
      try {
        await flush();
        showDoc(d, readLibrary()[d.id]?.savedAt ?? null);
        fileDirty.current = false;
        editSeq.current += 1;
        apply({ type: "edit" });
        await persist();
      } finally {
        setBusy(false);
      }
    },
    [apply, flush, persist, showDoc],
  );

  const onOpenFile = useCallback(
    async (file: File) => {
      let d: SermonDocument;
      try {
        d = parseSermonFile(await file.text()).sermon;
      } catch (err) {
        if (err instanceof SermonFileError) {
          setMessage({ title: "Open", message: err.message, details: err.details });
        } else {
          setMessage({ title: "Open", message: "This file couldn't be read, so nothing was opened." });
        }
        return;
      }
      // Pending autosaves are flushed before loading; only edits not in a saved
      // .sermon file (or an unresolved conflict) need the warning.
      if (fileDirty.current || conflictRef.current) {
        setConfirmOpen(d);
        return;
      }
      await loadOpenedSermon(d);
    },
    [loadOpenedSermon],
  );

  const triggerOpen = useCallback(() => {
    setMenuOpen(false);
    openFileInput.current?.click();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void onSaveToPc();
      } else if (k === "o") {
        e.preventDefault();
        triggerOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSaveToPc, triggerOpen]);

  const listItems = useMemo(() => {
    const items = Object.values(library).map((e) => ({
      id: e.doc.id,
      title: e.doc.title,
      updatedAt: e.doc.updatedAt,
      conflictCopy: isConflictCopyId(e.doc.id),
    }));
    if (doc) {
      const i = items.findIndex((s) => s.id === doc.id);
      const cur = { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, conflictCopy: isConflictCopyId(doc.id) };
      if (i >= 0) items[i] = cur;
      else items.unshift(cur);
    }
    return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [library, doc]);

  const outline = useMemo(() => extractOutline(doc?.content), [doc?.content]);

  // "Not saved, retrying": a failed write is retried every 5 s until it lands.
  useEffect(() => {
    if (status.kind !== "error") return;
    const id = window.setTimeout(() => void persist(), 5000);
    return () => window.clearTimeout(id);
  }, [status, persist]);

  if (mode === "first-run") {
    return (
      <FirstRunScreen
        folderApi={folderApi}
        onChooseFolder={() => void chooseFolder()}
        onUseBrowser={useBrowser}
        error={firstRunError}
      />
    );
  }

  if (!doc || mode === "loading") {
    return (
      <div className={styles.boot} data-edit-mode="">
        Loading sermon…
      </div>
    );
  }

  const action = statusAction(status);
  const display = statusDisplay(status, { shown: statusShown, savedAt });
  const onAction = () => {
    if (action === "choose-folder") void chooseFolder();
    else if (action === "allow-access") void allowAccess();
    else if (action === "retry") void persist();
  };

  return (
    <div className={styles.shell} data-edit-mode="">
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.modeBadge}>Editing</span>
          <h1 className={styles.docTitle}>{doc.title || "Untitled sermon"}</h1>
        </div>
        <div className={styles.actions}>
          <span
            className={styles.saved}
            aria-live="polite"
            data-testid="save-status"
            data-status={status.kind}
            data-tone={display.tone}
            data-empty={display.text ? undefined : ""}
            data-saved={isSaved(status) ? "true" : "false"}
            title={display.label || undefined}
            aria-label={display.label || undefined}
          >
            <span className={styles.savedText}>{display.text}</span>
          </span>
          {action ? (
            <button type="button" className={styles.retryBtn} onClick={onAction}>
              {ACTION_LABELS[action]}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.fileBtn}
            aria-label="Save to PC (Ctrl+S)"
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="save-to-pc"
            onClick={() => void onSaveToPc()}
          >
            Save to PC
          </button>
          <button
            type="button"
            className={styles.fileBtn}
            aria-label="Open a sermon file from PC (Ctrl+O)"
            aria-keyshortcuts="Control+O Meta+O"
            data-testid="open-file"
            onClick={triggerOpen}
          >
            Open
          </button>
          <input
            ref={openFileInput}
            type="file"
            accept=".sermon,.json,application/json"
            hidden
            data-testid="open-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onOpenFile(f);
            }}
          />
          <div className={styles.menu}>
            <button
              type="button"
              className={styles.menuBtn}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              Document
            </button>
            {menuOpen ? (
              <div role="menu" className={styles.menuList} aria-label="Document">
                <p className={styles.menuNote}>
                  {folderReady
                    ? `Saving to folder “${dirRef.current?.name ?? "Sermons"}”`
                    : mode === "folder"
                      ? "Folder not available, saving in this browser"
                      : "Saving in this browser"}
                </p>
                <button type="button" role="menuitem" onClick={() => void onBackup()}>
                  Back up…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    fileInput.current?.click();
                  }}
                >
                  Restore…
                </button>
                {folderApi ? (
                  <button type="button" role="menuitem" onClick={() => void chooseFolder()}>
                    {mode === "folder" ? "Change Sermons folder…" : "Choose Sermons folder…"}
                  </button>
                ) : null}
              </div>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept=".sermon-backup,.sermon,.json,application/json"
              hidden
              data-testid="restore-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onRestoreFile(f);
              }}
            />
          </div>
          <Link
            href="/preach?calibrate=1"
            className={styles.exportLink}
            title="Document setup and export (opens Preach with Calibration)"
          >
            Export…
          </Link>
          <Link href="/preach" className={styles.preachBtn}>
            Enter Preaching
          </Link>
        </div>
      </header>

      {conflict ? <ConflictPrompt onKeepMine={keepMine} onLoadTheirs={loadTheirs} /> : null}
      {openElsewhere ? <OpenElsewhereBanner /> : null}
      {mode === "browser" ? <BrowserOnlyBanner persisted={persisted} onBackup={() => void onBackup()} /> : null}
      {showReminder ? (
        <BackupBanner
          onBackup={() => void onBackup()}
          onDismiss={() => {
            lsSet(REMINDER_DISMISSED_KEY, new Date().toISOString());
            setShowReminder(false);
          }}
        />
      ) : null}

      <div className={styles.main}>
        <aside className={styles.sidebar} aria-label="Study chrome">
          <SermonList
            sermons={listItems}
            activeId={doc.id}
            onSelect={(id) => void openSermon(id)}
            onCreate={() => void onCreate()}
            onDelete={(id) => void onDelete(id)}
            disabled={busy}
          />
          <OutlineNav items={outline} />
          <FindBar editor={editor} />
          <NotesPanel value={doc.notes} onChange={onNotesChange} />
        </aside>

        <main className={styles.editorPane}>
          <SermonEditor
            key={editorKey || doc.id}
            content={doc.content}
            onChange={onContentChange}
            onEditorReady={setEditor}
          />
        </main>
      </div>

      {restore ? (
        <RestorePreviewDialog
          preview={restore.preview}
          busy={busy}
          choices={restoreChoices}
          onChoice={(id, c) => setRestoreChoices((m) => ({ ...m, [id]: c }))}
          openId={doc.id}
          openHasUnsavedEdits={restoreOpenDirty.current || hasUnsavedEdits() || !!conflict}
          onApply={() => void applyRestore()}
          onCancel={() => setRestore(null)}
        />
      ) : null}
      {confirmOpen ? (
        <ConfirmDialog
          title="Replace unsaved changes?"
          message="Opening will replace unsaved changes. Continue?"
          confirmLabel="Open"
          testId="open-confirm"
          onConfirm={() => void loadOpenedSermon(confirmOpen)}
          onCancel={() => setConfirmOpen(null)}
        />
      ) : null}
      {message ? <MessageDialog {...message} onClose={() => setMessage(null)} /> : null}
    </div>
  );
}
