"use client";

import {
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  TRANSLATIONS,
  VERSE_SNIPPET_FONT_FAMILY,
  bibleGatewayUrl,
  currentPassageText,
  getPassage,
  isBundledTranslation,
  isPasteTranslation,
  normalizeAttrs,
  withTranslationText,
} from "@/lib/sermon/verseSnippet";
import styles from "./VerseSnippet.module.css";

/**
 * Edit chrome for the self-contained `verseSnippet` node.
 * The block builder can wrap this node later; this view does not depend on it.
 */
export function VerseSnippetView({ node, updateAttributes, selected }: NodeViewProps) {
  const attrs = normalizeAttrs(node.attrs);
  const { ref, translation, texts } = attrs;
  const passage = currentPassageText(attrs);
  const [pendingRef, setPendingRef] = useState(ref);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const lastFetched = useRef<string>("");
  const refInputId = useId();
  const translationId = useId();
  const pasteId = useId();

  useEffect(() => {
    setPendingRef(ref);
  }, [ref]);

  const applyPassage = useCallback(
    (nextRef: string, nextTranslation: string, text: string, resolvedRef?: string) => {
      updateAttributes({
        ref: resolvedRef ?? nextRef,
        translation: nextTranslation,
        texts: withTranslationText(texts, nextTranslation, text),
      });
    },
    [texts, updateAttributes],
  );

  const fetchBundled = useCallback(
    async (nextRef: string, nextTranslation: string, reason: "auto" | "refresh") => {
      const key = `${nextRef}::${nextTranslation}`;
      if (!nextRef.trim() || !isBundledTranslation(nextTranslation)) return;
      if (reason === "auto" && lastFetched.current === key) return;
      setBusy(true);
      setStatus(reason === "refresh" ? "Refreshing…" : "Loading…");
      try {
        const result = await getPassage(nextRef, nextTranslation);
        lastFetched.current = key;
        if (result?.text) {
          applyPassage(nextRef, nextTranslation, result.text, nextRef);
          setStatus("");
        } else {
          setStatus(
            "No passage found for this reference in the bundled text.",
          );
        }
      } catch {
        setStatus("The passage could not be loaded.");
      } finally {
        setBusy(false);
      }
    },
    [applyPassage],
  );

  // Auto-fill bundled text when the node has a reference but no stored text.
  useEffect(() => {
    if (!ref.trim()) return;
    if (!isBundledTranslation(translation)) return;
    if (texts[translation]) return;
    void fetchBundled(ref, translation, "auto");
    // Only when this node first needs a fill; fetchBundled identity is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, translation]);

  const commitRef = useCallback(
    (value: string, refresh: boolean) => {
      const next = value;
      if (next !== ref) {
        updateAttributes({ ref: next });
      }
      if (refresh && isBundledTranslation(translation) && next.trim()) {
        lastFetched.current = "";
        void fetchBundled(next, translation, "refresh");
      }
    },
    [fetchBundled, ref, translation, updateAttributes],
  );

  const onTranslationChange = useCallback(
    (next: string) => {
      updateAttributes({ translation: next });
      setStatus("");
      if (isBundledTranslation(next) && ref.trim() && !texts[next]) {
        lastFetched.current = "";
        void fetchBundled(ref, next, "auto");
      }
    },
    [fetchBundled, ref, texts, updateAttributes],
  );

  const onPaste = useCallback(
    (value: string) => {
      // Store exactly what the writer pasted, including whitespace.
      updateAttributes({
        texts: withTranslationText(texts, translation, value),
      });
    },
    [texts, translation, updateAttributes],
  );

  const gateway = isPasteTranslation(translation)
    ? bibleGatewayUrl(ref || pendingRef, translation)
    : null;

  const stop = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <NodeViewWrapper
      as="div"
      className={styles.wrap}
      data-verse-snippet=""
      data-ref={ref}
      data-translation={translation}
      data-selected={selected ? "true" : "false"}
      contentEditable={false}
      onMouseDown={stop}
      onKeyDown={stop}
    >
      <div className={styles.bar} role="group" aria-label="Verse snippet">
        <label className={styles.field} htmlFor={refInputId}>
          <span className="visually-hidden">Reference</span>
          <input
            id={refInputId}
            type="text"
            className={styles.refInput}
            value={pendingRef}
            placeholder="Jean 3:16"
            aria-label="Reference"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setPendingRef(e.target.value)}
            onBlur={() => commitRef(pendingRef, pendingRef.trim() !== ref.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRef(pendingRef, true);
              }
            }}
          />
        </label>
        <label className={styles.field} htmlFor={translationId}>
          <span className="visually-hidden">Translation</span>
          <select
            id={translationId}
            className={styles.translationSelect}
            value={translation}
            aria-label="Translation"
            onChange={(e) => onTranslationChange(e.target.value)}
          >
            <optgroup label="Bundled (offline)">
              {TRANSLATIONS.filter((t) => t.kind === "bundled").map((t) => (
                <option key={t.id} value={t.id} title={t.title}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Paste from Bible Gateway">
              {TRANSLATIONS.filter((t) => t.kind === "paste").map((t) => (
                <option key={t.id} value={t.id} title={t.title}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          type="button"
          className={styles.refresh}
          aria-label="Refresh passage"
          disabled={busy || !pendingRef.trim() || !isBundledTranslation(translation)}
          onClick={() => {
            lastFetched.current = "";
            commitRef(pendingRef, true);
          }}
        >
          Refresh
        </button>
      </div>
      <div className={styles.body} style={{ fontFamily: VERSE_SNIPPET_FONT_FAMILY }}>
        {isPasteTranslation(translation) ? (
          <div className={styles.pasteTools}>
            {gateway ? (
              <a
                className={styles.gateway}
                href={gateway}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open on Bible Gateway
              </a>
            ) : (
              <span className={styles.empty}>
                Enter a reference to open this verse on Bible Gateway.
              </span>
            )}
            <label className={styles.field} htmlFor={pasteId} style={{ width: "100%" }}>
              <span className="visually-hidden">Paste passage</span>
              <textarea
                id={pasteId}
                className={styles.paste}
                aria-label="Paste passage"
                placeholder="Paste the passage here. It is saved exactly as pasted."
                value={texts[translation] ?? ""}
                onChange={(e) => onPaste(e.target.value)}
              />
            </label>
          </div>
        ) : passage ? (
          <p className={styles.quote}>{passage}</p>
        ) : (
          <p className={styles.empty}>
            Enter a reference and press Refresh to load the bundled LSG 1910 or WEB text.
          </p>
        )}
        {status ? (
          <p className={styles.status} role="status">
            {status}
          </p>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
