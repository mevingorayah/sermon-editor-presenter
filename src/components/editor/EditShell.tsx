"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Editor, JSONContent } from "@tiptap/react";
import {
  extractTitleFromContent,
  loadDocument,
  resolveActiveDocument,
  saveDocument,
  sermonToDocument,
} from "@/lib/documentStore";
import { extractOutline } from "@/lib/outline";
import {
  autosaveContent,
  createSermon,
  deleteSermon,
  getSermon,
  isServerSermonId,
  listSermons,
  updateSermon,
} from "@/lib/sermonApi";
import {
  AutosaveController,
  classifySaveError,
  type AutosaveStatus,
  type SaveFailureKind,
} from "@/lib/autosave/autosaveController";
import type { Sermon } from "@/lib/sermon/types";
import type { SermonDocument } from "@/types/document";
import type { GlobalStyles } from "@/lib/sermon/blockStyle";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";
import { SermonEditor } from "./SermonEditor";
import { OutlineNav } from "./OutlineNav";
import { FindBar } from "./FindBar";
import { NotesPanel } from "./NotesPanel";
import { SermonList } from "./SermonList";
import styles from "./EditShell.module.css";

type SaveStatus =
  | "saved-server"
  | "saved-local"
  | "saving"
  | "offline"
  | "restoring"
  | "retrying"
  | "failed-network"
  | "failed-server";

/** States that a local keystroke must not paper over with "Saved locally". */
const STICKY_STATUSES: ReadonlySet<SaveStatus> = new Set<SaveStatus>([
  "offline",
  "restoring",
  "retrying",
  "failed-network",
  "failed-server",
]);

function toSaveStatus(s: AutosaveStatus): SaveStatus {
  switch (s.kind) {
    case "saving":
      return "saving";
    case "saved":
      return "saved-server";
    case "restoring":
      return "restoring";
    case "offline":
      return "offline";
    case "retrying":
      return "retrying";
    case "failed":
      return failedStatus(s.reason);
  }
}

function failedStatus(reason: SaveFailureKind): SaveStatus {
  return reason === "network" ? "failed-network" : "failed-server";
}

const STATUS_LABELS: Record<SaveStatus, string> = {
  saving: "Saving…",
  "saved-server": "Saved to server",
  "saved-local": "Saved locally",
  offline: "Offline — saved locally",
  restoring: "Restoring on server…",
  retrying: "Save failed — retrying…",
  "failed-network": "Offline — saved locally",
  "failed-server": "Couldn’t save to server — saved locally",
};

function toListItems(sermons: Sermon[]) {
  return sermons.map((s) => ({
    id: s.id,
    title: s.meta.title,
    updatedAt: s.meta.updatedAt,
  }));
}

export function EditShell() {
  const [doc, setDoc] = useState<SermonDocument | null>(null);
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [status, setStatus] = useState<SaveStatus>("saving");
  const [busy, setBusy] = useState(false);
  /**
   * Remounts the editor only on real doc switches — not when autosave re-keys
   * the same doc to a new server id (local-* promotion / 404 recovery), so the
   * writer keeps focus, selection and undo history.
   */
  const [editorKey, setEditorKey] = useState("");

  const docRef = useRef<SermonDocument | null>(null);
  /** lost/local id → server id, so a stale docRef can never PATCH a gone id. */
  const rekeyMap = useRef(new Map<string, string>());
  const onlineRef = useRef(true);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveActiveDocument();
        if (cancelled) return;
        onlineRef.current = resolved.source === "server";
        setDoc(resolved.doc);
        setEditorKey(resolved.doc.id);
        setSermons(resolved.sermons);
        setStatus(resolved.source === "server" ? "saved-server" : "offline");
      } catch {
        // Never white-screen /edit — fall back to a local seed doc.
        if (cancelled) return;
        const fallback = loadDocument();
        setDoc(fallback);
        setEditorKey(fallback.id);
        setSermons([]);
        onlineRef.current = false;
        setStatus("offline");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const next = await listSermons();
      setSermons(next);
      onlineRef.current = true;
      return next;
    } catch (err) {
      // Only a failed fetch means offline; an HTTP error here says nothing
      // about the autosave state, so leave the indicator alone.
      if (classifySaveError(err) === "network") {
        onlineRef.current = false;
        setStatus("offline");
      }
      return null;
    }
  }, []);

  const applyLocal = useCallback((next: SermonDocument) => {
    setDoc(next);
    setEditorKey(next.id);
    docRef.current = next;
    saveDocument(next);
  }, []);

  const autosave = useMemo(
    () =>
      new AutosaveController({
        getDoc: () => {
          const d = docRef.current;
          const mapped = d ? rekeyMap.current.get(d.id) : undefined;
          return d && mapped ? { ...d, id: mapped } : d;
        },
        rekeyDoc: (fromId, toId, updatedAt) => {
          const current = docRef.current;
          if (!current || current.id !== fromId) return null;
          rekeyMap.current.set(fromId, toId);
          const rekeyed: SermonDocument = { ...current, id: toId, updatedAt };
          // Local copy is re-keyed in place (single cached doc + active-id),
          // so there is never an orphan under the lost id.
          docRef.current = rekeyed;
          saveDocument(rekeyed);
          setDoc((prev) => {
            if (!prev || prev.id !== fromId) return prev;
            const next = { ...prev, id: toId };
            saveDocument(next);
            return next;
          });
          return rekeyed;
        },
        save: {
          content: (d) =>
            autosaveContent(d.id, {
              content: d.content,
              title: extractTitleFromContent(d.content) ?? d.title,
            }),
          // "notes" kind also carries sermon.globalStyles (same PATCH).
          notes: (d) =>
            updateSermon(d.id, {
              notes: d.notes,
              ...(d.globalStyles ? { globalStyles: d.globalStyles } : {}),
            }),
        },
        create: (input) => createSermon(input),
        get: (id) => getSermon(id),
        onStatus: (next) => setStatus(toSaveStatus(next)),
        onSaved: () => {
          // Local content always wins; the server echo only proves durability.
          void refreshList();
        },
      }),
    [refreshList],
  );

  // cancel (not dispose) so a StrictMode effect re-run keeps the controller usable.
  useEffect(() => () => autosave.cancel(), [autosave]);

  // Coming back online: retry anything still queued (or a failed save).
  useEffect(() => {
    const onOnline = () => {
      if (autosave.hasPending) void autosave.retryNow();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [autosave]);

  const onContentChange = useCallback(
    (content: JSONContent) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const titleFromBlock = extractTitleFromContent(content);
        const next: SermonDocument = {
          ...prev,
          content,
          title: titleFromBlock ?? prev.title,
          updatedAt: new Date().toISOString(),
        };
        saveDocument(next);
        docRef.current = next;
        autosave.request("content");
        setStatus((s) => (STICKY_STATUSES.has(s) ? s : "saved-local"));
        return next;
      });
    },
    [autosave],
  );

  const onNotesChange = useCallback(
    (notes: string) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next: SermonDocument = {
          ...prev,
          notes,
          updatedAt: new Date().toISOString(),
        };
        saveDocument(next);
        docRef.current = next;
        autosave.request("notes");
        setStatus((s) => (STICKY_STATUSES.has(s) ? s : "saved-local"));
        return next;
      });
    },
    [autosave],
  );

  const onGlobalStylesChange = useCallback(
    (globalStyles: GlobalStyles) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next: SermonDocument = {
          ...prev,
          globalStyles,
          updatedAt: new Date().toISOString(),
        };
        saveDocument(next);
        docRef.current = next;
        autosave.request("notes");
        setStatus((s) => (STICKY_STATUSES.has(s) ? s : "saved-local"));
        return next;
      });
    },
    [autosave],
  );

  const openSermon = useCallback(
    async (id: string) => {
      if (docRef.current?.id === id) return;
      if (!isServerSermonId(id)) return;
      setBusy(true);
      try {
        autosave.cancel();
        const sermon = await getSermon(id);
        const next = sermonToDocument(sermon, docRef.current);
        applyLocal(next);
        onlineRef.current = true;
        setStatus("saved-server");
        await refreshList();
      } catch {
        onlineRef.current = false;
        setStatus("offline");
      } finally {
        setBusy(false);
      }
    },
    [applyLocal, autosave, refreshList],
  );

  const onCreate = useCallback(async () => {
    setBusy(true);
    try {
      autosave.cancel();
      const sermon = await createSermon({
        title: "Untitled sermon",
        content: { type: "doc", content: [{ type: "title", content: [] }] },
        notes: "",
      });
      const next = sermonToDocument(sermon);
      applyLocal(next);
      onlineRef.current = true;
      setStatus("saved-server");
      await refreshList();
    } catch {
      // Offline: spin up a local-only draft.
      const now = new Date().toISOString();
      const localDraft: SermonDocument = {
        id: `local-${now.replace(/[^0-9]/g, "").slice(0, 14)}`,
        title: "Untitled sermon",
        updatedAt: now,
        content: { type: "doc", content: [{ type: "title", content: [] }] },
        presentationSettings:
          docRef.current?.presentationSettings ?? {
            ...DEFAULT_PRESENTATION_SETTINGS,
          },
        notes: "",
      };
      applyLocal(localDraft);
      onlineRef.current = false;
      setStatus("offline");
    } finally {
      setBusy(false);
    }
  }, [applyLocal, autosave, refreshList]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!isServerSermonId(id)) return;
      if (typeof window !== "undefined") {
        const title =
          sermons.find((s) => s.id === id)?.meta.title ?? "this sermon";
        if (!window.confirm(`Delete “${title}”?`)) return;
      }
      setBusy(true);
      // Drop queued saves for the doc being deleted so autosave's 404 recovery
      // can never resurrect it.
      if (docRef.current?.id === id) autosave.cancel();
      try {
        await deleteSermon(id);
        onlineRef.current = true;
        const remaining = (await refreshList()) ?? [];
        if (docRef.current?.id === id) {
          if (remaining.length > 0) {
            const sermon = await getSermon(remaining[0].id);
            applyLocal(sermonToDocument(sermon));
            setStatus("saved-server");
          } else {
            await onCreate();
          }
        } else {
          setStatus("saved-server");
        }
      } catch {
        onlineRef.current = false;
        setStatus("offline");
      } finally {
        setBusy(false);
      }
    },
    [applyLocal, autosave, onCreate, refreshList, sermons],
  );

  const listItems = useMemo(() => {
    const items = toListItems(sermons);
    if (doc && !items.some((s) => s.id === doc.id)) {
      items.unshift({
        id: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt,
      });
    }
    return items;
  }, [sermons, doc]);

  const outline = useMemo(
    () => extractOutline(doc?.content),
    [doc?.content],
  );

  const statusLabel = STATUS_LABELS[status];
  const canRetry = status === "failed-network" || status === "failed-server";

  if (!doc) {
    return (
      <div className={styles.boot} data-edit-mode="">
        Loading sermon…
      </div>
    );
  }

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
            data-status={status}
          >
            {statusLabel}
          </span>
          {canRetry ? (
            <button
              type="button"
              className={styles.retryBtn}
              onClick={() => void autosave.retryNow()}
            >
              Retry
            </button>
          ) : null}
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

      <div className={styles.main}>
        <aside className={styles.sidebar} aria-label="Study chrome">
          <SermonList
            sermons={listItems}
            activeId={doc.id}
            onSelect={openSermon}
            onCreate={onCreate}
            onDelete={onDelete}
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
            globalStyles={doc.globalStyles}
            onGlobalStylesChange={onGlobalStylesChange}
          />
        </main>
      </div>
    </div>
  );
}
