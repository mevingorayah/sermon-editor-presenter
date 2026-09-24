"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { JSONContent } from "@tiptap/react";
import { loadDocument, saveDocument } from "@/lib/documentStore";
import { extractOutline } from "@/lib/outline";
import type { SermonDocument } from "@/types/document";
import { SermonEditor } from "./SermonEditor";
import { OutlineNav } from "./OutlineNav";
import { FindBar } from "./FindBar";
import { NotesPanel } from "./NotesPanel";
import styles from "./EditShell.module.css";

export function EditShell() {
  const [doc, setDoc] = useState<SermonDocument | null>(null);
  const [findQuery, setFindQuery] = useState("");

  useEffect(() => {
    setDoc(loadDocument());
  }, []);

  const persist = useCallback((next: SermonDocument) => {
    setDoc(next);
    saveDocument(next);
  }, []);

  const onContentChange = useCallback(
    (content: JSONContent) => {
      setDoc((prev) => {
        if (!prev) return prev;
        const next = { ...prev, content, updatedAt: new Date().toISOString() };
        saveDocument(next);
        return next;
      });
    },
    [],
  );

  const outline = useMemo(
    () => extractOutline(doc?.content),
    [doc?.content],
  );

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
            Autosaved locally
          </span>
          <Link href="/preach" className={styles.preachBtn}>
            Enter Preaching
          </Link>
        </div>
      </header>

      <div className={styles.main}>
        <aside className={styles.sidebar} aria-label="Study chrome">
          <OutlineNav items={outline} />
          <FindBar onQueryChange={setFindQuery} />
          {findQuery ? (
            <p className={styles.findHint}>
              Find stub — matching “{findQuery}” is not highlighted yet.
            </p>
          ) : null}
          <NotesPanel
            value={doc.notes}
            onChange={(notes) => persist({ ...doc, notes })}
          />
        </aside>

        <main className={styles.editorPane}>
          <SermonEditor content={doc.content} onChange={onContentChange} />
        </main>
      </div>
    </div>
  );
}
