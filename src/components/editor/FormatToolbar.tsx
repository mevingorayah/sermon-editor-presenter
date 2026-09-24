"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import styles from "./SermonEditor.module.css";

const FONT_SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_SERIF = "ui-serif, Georgia, serif";
const FONT_MONO = "ui-monospace, monospace";

const FONT_OPTIONS = [
  { id: "sans", label: "Sans", value: FONT_SANS },
  { id: "serif", label: "Serif", value: FONT_SERIF },
  { id: "mono", label: "Mono", value: FONT_MONO },
] as const;

/** Soft mid-tones readable on dark edit chrome and light cream. */
export const TEXT_COLORS = [
  { id: "muted", label: "Muted gray", value: "#9a948a" },
  { id: "accent", label: "Accent", value: "#5c4a1f" },
  { id: "red", label: "Soft red", value: "#d47870" },
  { id: "blue", label: "Soft blue", value: "#6a9fc4" },
  { id: "green", label: "Soft green", value: "#6aaa7a" },
] as const;

function normalizeFont(family: string | undefined | null): string {
  return (family ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function activeFontId(fontFamily: string | undefined | null): string {
  const n = normalizeFont(fontFamily);
  if (!n) return "sans";
  if (n.includes("monospace") || n.includes("mono")) return "mono";
  if (n.includes("georgia") || n.includes("ui-serif") || n.includes("serif")) {
    return "serif";
  }
  return "sans";
}

function AlignIcon({ kind }: { kind: "left" | "center" | "right" }) {
  const lines =
    kind === "left"
      ? [
          [2, 4, 16],
          [2, 8, 12],
          [2, 12, 16],
          [2, 16, 10],
        ]
      : kind === "center"
        ? [
            [2, 4, 16],
            [4, 8, 12],
            [2, 12, 16],
            [5, 16, 10],
          ]
        : [
            [2, 4, 16],
            [6, 8, 12],
            [2, 12, 16],
            [8, 16, 10],
          ];
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={styles.alignIcon}
    >
      {lines.map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height="2" rx="1" fill="currentColor" />
      ))}
    </svg>
  );
}

interface FormatToolbarProps {
  editor: Editor;
}

export function FormatToolbar({ editor }: FormatToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
      italic: ed.isActive("italic"),
      highlight: ed.isActive("highlight"),
      alignLeft: ed.isActive({ textAlign: "left" }),
      alignCenter: ed.isActive({ textAlign: "center" }),
      alignRight: ed.isActive({ textAlign: "right" }),
      fontFamily: (ed.getAttributes("textStyle").fontFamily as string) || "",
      color: (ed.getAttributes("textStyle").color as string) || "",
    }),
  });

  const [colorOpen, setColorOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement>(null);
  const colorMenuId = useId();

  useEffect(() => {
    if (!colorOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (
        colorWrapRef.current &&
        !colorWrapRef.current.contains(e.target as Node)
      ) {
        setColorOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setColorOpen(false);
        editor.chain().focus().run();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [colorOpen, editor]);

  const fontId = activeFontId(state.fontFamily);
  const currentColor = state.color || "";
  const underlineColor = currentColor || "#1a1814";

  const onFontChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const opt = FONT_OPTIONS.find((f) => f.id === e.target.value);
      if (!opt) return;
      editor.chain().focus().setFontFamily(opt.value).run();
    },
    [editor],
  );

  const applyColor = useCallback(
    (value: string | null) => {
      if (value === null) {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(value).run();
      }
      setColorOpen(false);
    },
    [editor],
  );

  return (
    <>
      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="History">
        <button
          type="button"
          className={styles.toolBtn}
          aria-label="Undo"
          title="Undo (Ctrl/Cmd+Z)"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          aria-label="Redo"
          title="Redo (Ctrl/Cmd+Shift+Z)"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Inline marks">
        <button
          type="button"
          className={`${styles.toolBtn} ${styles.toolBtnItalic}${
            state.italic ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Italic"
          title="Italic (Ctrl/Cmd+I)"
          aria-pressed={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <button
          type="button"
          className={`${styles.toolBtn} ${styles.toolBtnHighlight}${
            state.highlight ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Highlight"
          title="Highlight"
          aria-pressed={state.highlight}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          ▮
        </button>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Alignment">
        <button
          type="button"
          className={`${styles.toolBtn}${
            state.alignLeft ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Align left"
          title="Align left"
          aria-pressed={state.alignLeft}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignIcon kind="left" />
        </button>
        <button
          type="button"
          className={`${styles.toolBtn}${
            state.alignCenter ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Align center"
          title="Align center"
          aria-pressed={state.alignCenter}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignIcon kind="center" />
        </button>
        <button
          type="button"
          className={`${styles.toolBtn}${
            state.alignRight ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Align right"
          title="Align right"
          aria-pressed={state.alignRight}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          <AlignIcon kind="right" />
        </button>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Font">
        <label className={styles.fontLabel}>
          <span className="visually-hidden">Font</span>
          <select
            className={styles.fontSelect}
            value={fontId}
            aria-label="Font family"
            title="Font"
            onChange={onFontChange}
            onMouseDown={(e) => {
              // Keep selection; focus returns after change via chain().focus()
              e.stopPropagation();
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div
        className={`${styles.toolGroup} ${styles.colorGroup}`}
        role="group"
        aria-label="Text color"
        ref={colorWrapRef}
      >
        <button
          type="button"
          className={`${styles.toolBtn} ${styles.colorTrigger}${
            colorOpen ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Text color"
          title="Text color"
          aria-haspopup="listbox"
          aria-expanded={colorOpen}
          aria-controls={colorMenuId}
          onClick={() => setColorOpen((o) => !o)}
        >
          <span className={styles.colorLetter} aria-hidden="true">
            A
          </span>
          <span
            className={styles.colorUnderline}
            style={{ background: underlineColor }}
            aria-hidden="true"
          />
        </button>
        {colorOpen ? (
          <div
            id={colorMenuId}
            className={styles.swatchMenu}
            role="listbox"
            aria-label="Color palette"
          >
            <button
              type="button"
              role="option"
              aria-selected={!currentColor}
              className={`${styles.swatch} ${styles.swatchDefault}${
                !currentColor ? ` ${styles.swatchActive}` : ""
              }`}
              title="Default"
              aria-label="Default color"
              onClick={() => applyColor(null)}
            >
              Default
            </button>
            {TEXT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={currentColor === c.value}
                className={`${styles.swatch}${
                  currentColor === c.value ? ` ${styles.swatchActive}` : ""
                }`}
                title={c.label}
                aria-label={c.label}
                style={{ background: c.value }}
                onClick={() => applyColor(c.value)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
