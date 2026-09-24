"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Editor, JSONContent } from "@tiptap/react";
import {
  extractTitleFromContent,
  promoteLocalDraftToServer,
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
import type { Sermon } from "@/lib/sermon/types";
import type { SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";
import { SermonEditor } from "./SermonEditor";
import { OutlineNav } from "./OutlineNav";
import { FindBar } from "./FindBar";
import { NotesPanel } from "./NotesPanel";
import { SermonList } from "./SermonList";
import styles from "./EditShell.module.css";

type SaveStatus = "saved-server" | "saved-local" | "saving" | "offline";

const CONTENT_DEBOUNCE_MS = 650;
const NOTES_DEBOUNCE_MS = 800;

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

  const docRef = useRef<SermonDocument | null>(null);
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(true);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await resolveActiveDocument();
      if (cancelled) return;
      onlineRef.current = resolved.source === "server";
      setDoc(resolved.doc);
      setSermons(resolved.sermons);
      setStatus(resolved.source === "server" ? "saved-server" : "offline");
    })();
    return () => {
      cancelled = true;
      if (contentTimer.current) clearTimeout(contentTimer.current);
      if (notesTimer.current) clearTimeout(notesTimer.current);
    };
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const next = await listSermons();
      setSermons(next);
      onlineRef.current = true;
      return next;
    } catch {
      onlineRef.current = false;
      setStatus("offline");
      return null;
    }
  }, []);

  const applyLocal = useCallback((next: SermonDocument) => {
    setDoc(next);
    saveDocument(next);
  }, []);

  const queueContentAutosave = useCallback(
    (next: SermonDocument) => {
      if (contentTimer.current) clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(async () => {
        const current = docRef.current;
        if (!current || current.id !== next.id) return;
        setStatus("saving");
        try {
          let working = current;
          // Offline local-* / legacy seed ids must never PATCH the API.
          if (!isServerSermonId(working.id)) {
            working = await promoteLocalDraftToServer(working);
            // Preserve in-flight editor content/title over the POST snapshot.
            working = {
              ...working,
              content: current.content,
              title:
                extractTitleFromContent(current.content) ??
                current.title ??
                working.title,
              notes: current.notes,
              presentationSettings: current.presentationSettings,
            };
            setDoc(working);
            saveDocument(working);
            docRef.current = working;
          }
          const title =
            extractTitleFromContent(working.content) ?? working.title;
          const saved = await autosaveContent(working.id, {
            content: working.content,
            title,
          });
          onlineRef.current = true;
          const merged = sermonToDocument(saved, working);
          // Keep unsaved notes/presentation that may have raced.
          const withLocal: SermonDocument = {
            ...merged,
            notes: working.notes,
            presentationSettings: working.presentationSettings,
            content: working.content,
            title:
              extractTitleFromContent(working.content) ??
              merged.title ??
              working.title,
          };
          setDoc(withLocal);
          saveDocument(withLocal);
          setStatus("saved-server");
          void refreshList();
        } catch {
          onlineRef.current = false;
          setStatus("offline");
        }
      }, CONTENT_DEBOUNCE_MS);
    },
    [refreshList],
  );

  const queueNotesAutosave = useCallback((next: SermonDocument) => {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      const current = docRef.current;
      if (!current || current.id !== next.id) return;
      setStatus("saving");
      try {
        let working = current;
        if (!isServerSermonId(working.id)) {
          working = await promoteLocalDraftToServer(working);
          working = {
            ...working,
            content: current.content,
            title: current.title,
            notes: current.notes,
            presentationSettings: current.presentationSettings,
          };
          setDoc(working);
          saveDocument(working);
          docRef.current = working;
        }
        const saved = await updateSermon(working.id, { notes: working.notes });
        onlineRef.current = true;
        const merged = sermonToDocument(saved, working);
        const withLocal: SermonDocument = {
          ...merged,
          content: working.content,
          presentationSettings: working.presentationSettings,
          title: working.title,
          notes: working.notes,
        };
        setDoc(withLocal);
        saveDocument(withLocal);
        setStatus("saved-server");
      } catch {
        onlineRef.current = false;
        setStatus("offline");
      }
    }, NOTES_DEBOUNCE_MS);
  }, []);

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
        queueContentAutosave(next);
        setStatus((s) => (s === "offline" ? "offline" : "saved-local"));
        return next;
      });
    },
    [queueContentAutosave],
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
        queueNotesAutosave(next);
        setStatus((s) => (s === "offline" ? "offline" : "saved-local"));
        return next;
      });
    },
    [queueNotesAutosave],
  );

  const openSermon = useCallback(
    async (id: string) => {
      if (docRef.current?.id === id) return;
      if (!isServerSermonId(id)) return;
      setBusy(true);
      try {
        if (contentTimer.current) clearTimeout(contentTimer.current);
        if (notesTimer.current) clearTimeout(notesTimer.current);
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
    [applyLocal, refreshList],
  );

  const onCreate = useCallback(async () => {
    setBusy(true);
    try {
      if (contentTimer.current) clearTimeout(contentTimer.current);
      if (notesTimer.current) clearTimeout(notesTimer.current);
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
  }, [applyLocal, refreshList]);

  const onDelete = useCallback(
    async (id: string) => {
      if (!isServerSermonId(id)) return;
      if (typeof window !== "undefined") {
        const title =
          sermons.find((s) => s.id === id)?.meta.title ?? "this sermon";
        if (!window.confirm(`Delete “${title}”?`)) return;
      }
      setBusy(true);
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
    [applyLocal, onCreate, refreshList, sermons],
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

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "saved-server"
        ? "Saved to server"
        : status === "offline"
          ? "Offline — saved locally"
          : "Saved locally";

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
          <span className={styles.saved} aria-live="polite">
            {statusLabel}
          </span>
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
            key={doc.id}
            content={doc.content}
            onChange={onContentChange}
            onEditorReady={setEditor}
          />
        </main>
      </div>
    </div>
  );
}
