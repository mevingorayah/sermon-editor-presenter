"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  FONTS,
  FONT_SIZES_PT,
  BODY_PT,
  HIGHLIGHT_PRESETS,
  TEXT_PRESETS,
  fontFamilyCss,
  fontIdOf,
  fontSizePt,
} from "@/lib/marks/presets";
import { ColorPopover } from "./ColorPopover";
import styles from "./SermonEditor.module.css";

/** @deprecated kept for imports; the 6 presets live in lib/marks/presets. */
export const TEXT_COLORS = TEXT_PRESETS.map((p) => ({ id: p.id, label: p.label, value: p.light }));

const MARKS = [
  { name: "bold", label: "Bold", glyph: "B", keys: "Ctrl/Cmd+B", cls: "markBold" },
  { name: "italic", label: "Italic", glyph: "I", keys: "Ctrl/Cmd+I", cls: "markItalic" },
  { name: "underline", label: "Underline", glyph: "U", keys: "Ctrl/Cmd+U", cls: "markUnderline" },
  { name: "strike", label: "Strikethrough", glyph: "S", keys: "Ctrl/Cmd+Shift+X", cls: "markStrike" },
  { name: "superscript", label: "Superscript", glyph: "x²", keys: "Ctrl/Cmd+.", cls: "" },
  { name: "subscript", label: "Subscript", glyph: "x₂", keys: "Ctrl/Cmd+,", cls: "" },
] as const;
type MarkName = (typeof MARKS)[number]["name"];

function AlignIcon({ kind }: { kind: "left" | "center" | "right" | "justify" }) {
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
        : kind === "right"
          ? [
              [2, 4, 16],
              [6, 8, 12],
              [2, 12, 16],
              [8, 16, 10],
            ]
          : [
              [2, 4, 16],
              [2, 8, 16],
              [2, 12, 16],
              [2, 16, 16],
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
    selector: ({ editor: ed }) => {
      const ts = ed.getAttributes("textStyle");
      const hl = ed.getAttributes("highlight");
      return {
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        underline: ed.isActive("underline"),
        strike: ed.isActive("strike"),
        superscript: ed.isActive("superscript"),
        subscript: ed.isActive("subscript"),
        alignLeft: ed.isActive({ textAlign: "left" }),
        alignCenter: ed.isActive({ textAlign: "center" }),
        alignRight: ed.isActive({ textAlign: "right" }),
        alignJustify: ed.isActive({ textAlign: "justify" }),
        fontFamily: (ts.fontFamily as string) || "",
        fontSize: (ts.fontSize as string) || "",
        color: ((ts.color as string) || "").toUpperCase(),
        colorPreset: (ts.preset as string) || null,
        highlight: ed.isActive("highlight"),
        highlightColor: ((hl.color as string) || "").toUpperCase(),
        highlightPreset: (hl.preset as string) || null,
      };
    },
  });

  const [sizeDraft, setSizeDraft] = useState<string | null>(null);

  const toggle = useCallback(
    (name: MarkName) => {
      const c = editor.chain().focus();
      const cmds = {
        bold: () => c.toggleBold(),
        italic: () => c.toggleItalic(),
        underline: () => c.toggleUnderline(),
        strike: () => c.toggleStrike(),
        superscript: () => c.toggleSuperscript(),
        subscript: () => c.toggleSubscript(),
      } as const;
      cmds[name]().run();
    },
    [editor],
  );

  const fontId = fontIdOf(state.fontFamily) ?? "";
  const sizePt = fontSizePt(state.fontSize);

  const onFontChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      if (!id) editor.chain().focus().unsetFontId().run();
      else editor.chain().focus().setFontId(id).run();
    },
    [editor],
  );

  const applySize = useCallback(
    (raw: string) => {
      setSizeDraft(null);
      if (!raw.trim()) {
        editor.chain().focus().unsetFontSizePt().run();
        return;
      }
      const n = fontSizePt(raw);
      if (n === null) return;
      if (n === BODY_PT) editor.chain().focus().unsetFontSizePt().run();
      else editor.chain().focus().setFontSizePt(n).run();
    },
    [editor],
  );

  const refocus = useCallback(() => editor.commands.focus(), [editor]);

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
        {MARKS.map((m) => (
          <button
            key={m.name}
            type="button"
            className={`${styles.toolBtn}${m.cls ? ` ${styles[m.cls]}` : ""}${state[m.name] ? ` ${styles.toolBtnActive}` : ""}`}
            aria-label={m.label}
            title={`${m.label} (${m.keys})`}
            aria-pressed={state[m.name]}
            data-mark={m.name}
            onClick={() => toggle(m.name)}
          >
            {m.glyph}
          </button>
        ))}
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
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="">Document default</option>
            {(["serif", "sans", "mono"] as const).map((g) => (
              <optgroup key={g} label={g === "serif" ? "Serif" : g === "sans" ? "Sans" : "Code"}>
                {FONTS.filter((f) => f.group === g).map((f) => (
                  <option key={f.id} value={f.id} style={{ fontFamily: fontFamilyCss(f.id) ?? undefined }}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={styles.fontLabel}>
          <span className="visually-hidden">Font size</span>
          <input
            className={styles.sizeInput}
            aria-label="Font size (pt)"
            title="Font size (8–96 pt)"
            list="sermon-font-sizes"
            inputMode="numeric"
            value={sizeDraft ?? String(sizePt ?? BODY_PT)}
            onChange={(e) => setSizeDraft(e.target.value)}
            onBlur={() => sizeDraft !== null && applySize(sizeDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySize(sizeDraft ?? String(sizePt ?? BODY_PT));
              } else if (e.key === "Escape") {
                setSizeDraft(null);
                refocus();
              }
            }}
          />
          <datalist id="sermon-font-sizes">
            {FONT_SIZES_PT.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <ColorPopover
        testId="text-color"
        label="Text colour"
        trigger={
          <>
            <span className={styles.colorLetter} aria-hidden="true">A</span>
            <span
              className={styles.colorUnderline}
              style={{ background: state.color || "#1A1814" }}
              aria-hidden="true"
            />
          </>
        }
        presets={TEXT_PRESETS}
        noneLabel="Default"
        activePreset={state.colorPreset}
        activeColor={state.color}
        allowCustom
        onApply={(color, preset) => {
          if (color === null) editor.chain().focus().unsetColor().setMark("textStyle", { preset: null }).removeEmptyTextStyle().run();
          else editor.chain().focus().setTextColor(color, preset).run();
        }}
      />

      <ColorPopover
        testId="highlight-color"
        label="Highlight"
        trigger={
          <span
            className={styles.highlightLetter}
            aria-hidden="true"
            style={{ background: state.highlightColor || HIGHLIGHT_PRESETS[0].light }}
          >
            ▮
          </span>
        }
        presets={HIGHLIGHT_PRESETS}
        noneLabel="None"
        activePreset={state.highlightPreset}
        activeColor={state.highlight ? state.highlightColor || HIGHLIGHT_PRESETS[0].light : ""}
        onApply={(color, preset) => {
          if (color === null) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().setHighlight({ color, preset } as { color: string }).run();
        }}
      />

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Alignment">
        {(["left", "center", "right", "justify"] as const).map((k) => {
          const key = `align${k[0].toUpperCase()}${k.slice(1)}` as "alignLeft" | "alignCenter" | "alignRight" | "alignJustify";
          const label = k === "justify" ? "Justify" : `Align ${k}`;
          return (
            <button
              key={k}
              type="button"
              className={`${styles.toolBtn}${state[key] ? ` ${styles.toolBtnActive}` : ""}`}
              aria-label={label}
              title={label}
              aria-pressed={state[key]}
              onClick={() => editor.chain().focus().setTextAlign(k).run()}
            >
              <AlignIcon kind={k} />
            </button>
          );
        })}
      </div>
    </>
  );
}
