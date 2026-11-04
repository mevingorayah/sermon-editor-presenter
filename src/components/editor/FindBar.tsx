"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Editor } from "@tiptap/react";
import type { SearchAndReplaceStorage } from "@/extensions/SearchAndReplace";
import styles from "./FindBar.module.css";

interface FindBarProps {
  editor: Editor | null;
}

function readFindStorage(editor: Editor | null): SearchAndReplaceStorage {
  if (!editor) {
    return {
      query: "",
      caseSensitive: false,
      matches: [],
      currentIndex: -1,
    };
  }
  return editor.storage.searchAndReplace;
}

export function FindBar({ editor }: FindBarProps) {
  const findId = useId();
  const replaceId = useId();
  const caseId = useId();
  const findInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [lastReplaced, setLastReplaced] = useState(0);

  const syncFromEditor = useCallback(() => {
    const storage = readFindStorage(editor);
    setMatchCount(storage.matches.length);
    setCurrentIndex(storage.currentIndex);
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      setMatchCount(0);
      setCurrentIndex(-1);
      return;
    }
    syncFromEditor();
    const onTx = () => syncFromEditor();
    editor.on("transaction", onTx);
    return () => {
      editor.off("transaction", onTx);
    };
  }, [editor, syncFromEditor]);

  // Cmd/Ctrl+F focuses find (Edit shell only — this component is not mounted on /preach).
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const applyQuery = useCallback(
    (next: string) => {
      setQuery(next);
      editor?.commands.setFindQuery(next);
    },
    [editor],
  );

  const onFindKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      editor?.commands.clearFind();
      findInputRef.current?.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        editor?.commands.findPrevious();
      } else {
        editor?.commands.findNext();
      }
    }
  };

  const onReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      findInputRef.current?.focus();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      editor?.commands.replaceFind(replaceWith);
    }
  };

  const matchLabel =
    matchCount === 0
      ? query
        ? "No matches"
        : ""
      : `${currentIndex + 1} of ${matchCount}`;

  return (
    <div className={styles.root} role="search" aria-label="Find and replace">
      <div className={styles.row}>
        <label className={styles.label} htmlFor={findId}>
          Find
        </label>
        <span className={styles.count} aria-live="polite">
          {matchLabel}
        </span>
      </div>
      <input
        ref={findInputRef}
        id={findId}
        type="search"
        className={styles.input}
        placeholder="Find in sermon…"
        value={query}
        onChange={(e) => applyQuery(e.target.value)}
        onKeyDown={onFindKeyDown}
        autoComplete="off"
      />

      <label className={styles.label} htmlFor={replaceId}>
        Replace
      </label>
      <input
        id={replaceId}
        type="text"
        className={styles.input}
        placeholder="Replace with…"
        value={replaceWith}
        onChange={(e) => setReplaceWith(e.target.value)}
        onKeyDown={onReplaceKeyDown}
        autoComplete="off"
      />

      <label className={styles.caseToggle} htmlFor={caseId}>
        <input
          id={caseId}
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => {
            const next = e.target.checked;
            setCaseSensitive(next);
            editor?.commands.setFindCaseSensitive(next);
          }}
        />
        Case sensitive
      </label>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btn}
          disabled={!editor || matchCount === 0}
          onClick={() => editor?.commands.findPrevious()}
          aria-label="Previous match"
        >
          Prev
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!editor || matchCount === 0}
          onClick={() => editor?.commands.findNext()}
          aria-label="Next match"
        >
          Next
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!editor || matchCount === 0}
          onClick={() => editor?.commands.replaceFind(replaceWith)}
        >
          Replace
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!editor || matchCount === 0}
          onClick={() => {
            const n = matchCount;
            if (editor?.commands.replaceAllFind(replaceWith)) setLastReplaced(n);
          }}
          aria-label={`Replace all ${matchCount} matches`}
          data-testid="find-replace-all"
        >
          {matchCount > 0 ? `All (${matchCount})` : "All"}
        </button>
      </div>

      {lastReplaced > 0 && (
        <p className={styles.hint} role="status" data-testid="find-replaced">
          Replaced {lastReplaced}.{" "}
          <button
            type="button"
            className={styles.btn}
            aria-label="Undo replace all"
            onClick={() => {
              editor?.chain().focus().undo().run();
              setLastReplaced(0);
            }}
          >
            Undo
          </button>
        </p>
      )}

      <p className={styles.hint}>
        ⌘/Ctrl+F · Enter next · Shift+Enter prev · Esc clear. Searches document
        text (not Scripture citation fields).
      </p>
    </div>
  );
}
