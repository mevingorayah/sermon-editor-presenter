"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import styles from "./SermonEditor.module.css";
import { TEXT_COLORS, HIGHLIGHT_PRESETS, normalizeHex, readRecentColors, rememberColor } from "@/lib/writing/colors";
import {
  WRITING_FONTS,
  SYSTEM_FONTS,
  SERIF_FONTS,
  SANS_FONTS,
  writingFontId,
  writingFontById,
} from "@/lib/writing/fontCatalog";
import {
  LETTER_SPACING,
  LINE_SPACING,
  SPACING_BLOCK_TYPES,
  clampLetterSpacing,
  clampLineSpacing,
  letterSpacingCss,
  lineSpacingCss,
  parseSpacingNumber,
} from "@/lib/writing/spacing";

export { TEXT_COLORS, HIGHLIGHT_PRESETS };

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

function selectionIsWholeBlocks(editor: Editor): boolean {
  const { empty, $from, $to } = editor.state.selection;
  if (empty) return true;
  return $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size;
}

function applyBlockOrMark(
  editor: Editor,
  attr: "letterSpacing" | "lineSpacing",
  value: string | null,
) {
  if (selectionIsWholeBlocks(editor)) {
    const { from, to } = editor.state.selection;
    const { tr } = editor.state;
    let changed = false;
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if ((SPACING_BLOCK_TYPES as readonly string[]).includes(node.type.name)) {
        if (node.attrs[attr] !== value) {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: value });
          changed = true;
        }
      }
    });
    if (changed) editor.view.dispatch(tr);
    editor.chain().focus().run();
    return;
  }
  editor.chain().focus().setMark("textStyle", { [attr]: value }).run();
}

function blockAttr(editor: Editor, attr: string): string {
  for (const t of SPACING_BLOCK_TYPES) {
    if (t === "heading" ? editor.isActive("heading") : editor.isActive(t)) {
      const v = editor.getAttributes(t)[attr];
      if (typeof v === "string" && v) return v;
      if (typeof v === "number") return String(v);
    }
  }
  return "";
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
      highlightColor: (ed.getAttributes("highlight").color as string) || "",
      highlightPreset: (ed.getAttributes("highlight").preset as string) || "",
      alignLeft: ed.isActive({ textAlign: "left" }),
      alignCenter: ed.isActive({ textAlign: "center" }),
      alignRight: ed.isActive({ textAlign: "right" }),
      alignJustify: ed.isActive({ textAlign: "justify" }),
      fontFamily: (ed.getAttributes("textStyle").fontFamily as string) || "",
      color: (ed.getAttributes("textStyle").color as string) || "",
      letterSpacing:
        ((ed.getAttributes("textStyle").letterSpacing as string) || "") ||
        blockAttr(ed, "letterSpacing"),
      lineSpacing:
        ((ed.getAttributes("textStyle").lineSpacing as string) || "") ||
        blockAttr(ed, "lineSpacing"),
    }),
  });

  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const colorWrapRef = useRef<HTMLDivElement>(null);
  const highlightWrapRef = useRef<HTMLDivElement>(null);
  const colorMenuId = useId();
  const highlightMenuId = useId();
  const colorTriggerRef = useRef<HTMLButtonElement>(null);
  const highlightTriggerRef = useRef<HTMLButtonElement>(null);
  const [textRecent, setTextRecent] = useState<string[]>([]);
  const [hlRecent, setHlRecent] = useState<string[]>([]);

  useEffect(() => {
    setTextRecent(readRecentColors("text"));
    setHlRecent(readRecentColors("highlight"));
  }, []);

  useEffect(() => {
    if (!colorOpen && !highlightOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (colorOpen && colorWrapRef.current && !colorWrapRef.current.contains(t)) {
        setColorOpen(false);
      }
      if (highlightOpen && highlightWrapRef.current && !highlightWrapRef.current.contains(t)) {
        setHighlightOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (colorOpen) {
        setColorOpen(false);
        colorTriggerRef.current?.focus();
      }
      if (highlightOpen) {
        setHighlightOpen(false);
        highlightTriggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [colorOpen, highlightOpen]);

  const fontId = writingFontId(state.fontFamily);
  const currentColor = state.color || "";
  const underlineColor = currentColor || "#1a1814";
  const letterVal = parseSpacingNumber(state.letterSpacing);
  const lineVal = parseSpacingNumber(state.lineSpacing);

  const onFontChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const opt = writingFontById(e.target.value);
      if (!opt) return;
      editor.chain().focus().setFontFamily(opt.stack).run();
    },
    [editor],
  );

  const applyColor = useCallback(
    (value: string | null, opts?: { recent?: boolean }) => {
      if (value === null) {
        editor.chain().focus().unsetColor().run();
      } else {
        const hex = normalizeHex(value) ?? value;
        editor.chain().focus().setColor(hex).run();
        if (opts?.recent !== false) setTextRecent(rememberColor("text", hex));
      }
      setColorOpen(false);
    },
    [editor],
  );

  const applyHighlight = useCallback(
    (value: string | null, preset?: string | null, opts?: { recent?: boolean }) => {
      if (value === null) {
        editor.chain().focus().unsetHighlight().run();
      } else {
        const hex = normalizeHex(value) ?? value;
        editor.chain().focus().setHighlight({ color: hex, preset: preset ?? null } as { color: string }).run();
        if (opts?.recent !== false) setHlRecent(rememberColor("highlight", hex));
      }
      setHighlightOpen(false);
    },
    [editor],
  );

  const onLetter = useCallback(
    (raw: string) => {
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      applyBlockOrMark(editor, "letterSpacing", letterSpacingCss(clampLetterSpacing(n)));
    },
    [editor],
  );

  const onLine = useCallback(
    (raw: string) => {
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return;
      applyBlockOrMark(editor, "lineSpacing", lineSpacingCss(clampLineSpacing(n)));
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
        <div className={styles.colorGroup} ref={highlightWrapRef}>
          <button
            ref={highlightTriggerRef}
            type="button"
            className={`${styles.toolBtn} ${styles.toolBtnHighlight}${
              state.highlight || highlightOpen ? ` ${styles.toolBtnActive}` : ""
            }`}
            aria-label="Highlight"
            title="Highlight"
            aria-pressed={state.highlight}
            aria-haspopup="listbox"
            aria-expanded={highlightOpen}
            aria-controls={highlightMenuId}
            onClick={() => {
              setColorOpen(false);
              setHighlightOpen((o) => !o);
            }}
          >
            ▮
          </button>
          {highlightOpen ? (
            <ColorMenu
              id={highlightMenuId}
              label="Highlight palette"
              current={state.highlightColor}
              presets={HIGHLIGHT_PRESETS.map((c) => ({
                id: c.id,
                label: c.label,
                value: c.value,
              }))}
              recent={hlRecent}
              defaultLabel="None"
              defaultActive={!state.highlight}
              onDefault={() => applyHighlight(null)}
              onPick={(value, id) => applyHighlight(value, id)}
              onCustom={(hex) => applyHighlight(hex, null)}
            />
          ) : null}
        </div>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Alignment">
        {(
          [
            ["left", "Align left", state.alignLeft],
            ["center", "Align center", state.alignCenter],
            ["right", "Align right", state.alignRight],
            ["justify", "Justify", state.alignJustify],
          ] as const
        ).map(([kind, label, active]) => (
          <button
            key={kind}
            type="button"
            className={`${styles.toolBtn}${active ? ` ${styles.toolBtnActive}` : ""}`}
            aria-label={label}
            title={label}
            aria-pressed={active}
            onClick={() => editor.chain().focus().setTextAlign(kind).run()}
          >
            <AlignIcon kind={kind} />
          </button>
        ))}
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Font">
        <label className={styles.fontLabel}>
          <span className="visually-hidden">Font</span>
          <select
            className={styles.fontSelect}
            value={WRITING_FONTS.some((f) => f.id === fontId) ? fontId : "sans"}
            aria-label="Font family"
            title="Font"
            onChange={onFontChange}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <optgroup label="System">
              {SYSTEM_FONTS.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                  {f.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Serif">
              {SERIF_FONTS.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                  {f.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Sans">
              {SANS_FONTS.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.stack }}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <div className={styles.toolDivider} aria-hidden="true" />

      <div className={styles.toolGroup} role="group" aria-label="Spacing">
        <label className={styles.spacingLabel}>
          <span className={styles.spacingName}>Letter</span>
          <input
            type="number"
            className={styles.spacingInput}
            min={LETTER_SPACING.min}
            max={LETTER_SPACING.max}
            step={LETTER_SPACING.step}
            value={letterVal ?? 0}
            aria-label="Letter spacing (em)"
            title="Letter spacing (−0.05 to 0.30 em)"
            data-testid="letter-spacing"
            onChange={(e) => onLetter(e.target.value)}
          />
        </label>
        <label className={styles.spacingLabel}>
          <span className={styles.spacingName}>Line</span>
          <input
            type="number"
            className={styles.spacingInput}
            min={LINE_SPACING.min}
            max={LINE_SPACING.max}
            step={LINE_SPACING.step}
            value={lineVal ?? ""}
            placeholder="—"
            aria-label="Line spacing"
            title="Line spacing (1.0 to 2.5)"
            data-testid="line-spacing"
            onChange={(e) => onLine(e.target.value)}
          />
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
          ref={colorTriggerRef}
          type="button"
          className={`${styles.toolBtn} ${styles.colorTrigger}${
            colorOpen ? ` ${styles.toolBtnActive}` : ""
          }`}
          aria-label="Text color"
          title="Text color"
          aria-haspopup="listbox"
          aria-expanded={colorOpen}
          aria-controls={colorMenuId}
          onClick={() => {
            setHighlightOpen(false);
            setColorOpen((o) => !o);
          }}
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
          <ColorMenu
            id={colorMenuId}
            label="Color palette"
            current={currentColor}
            presets={TEXT_COLORS.map((c) => ({ id: c.id, label: c.label, value: c.value }))}
            recent={textRecent}
            defaultLabel="Default"
            defaultActive={!currentColor}
            onDefault={() => applyColor(null)}
            onPick={(value) => applyColor(value)}
            onCustom={(hex) => applyColor(hex)}
          />
        ) : null}
      </div>
    </>
  );
}

function ColorMenu({
  id,
  label,
  current,
  presets,
  recent,
  defaultLabel,
  defaultActive,
  onDefault,
  onPick,
  onCustom,
}: {
  id: string;
  label: string;
  current: string;
  presets: { id: string; label: string; value: string }[];
  recent: string[];
  defaultLabel: string;
  defaultActive: boolean;
  onDefault: () => void;
  onPick: (value: string, id: string) => void;
  onCustom: (hex: string) => void;
}) {
  const [hex, setHex] = useState("");
  const parsed = normalizeHex(hex);
  const currentN = normalizeHex(current) ?? current.trim().toUpperCase();

  return (
    <div id={id} className={styles.swatchMenu} role="listbox" aria-label={label}>
      <button
        type="button"
        role="option"
        aria-selected={defaultActive}
        className={`${styles.swatch} ${styles.swatchDefault}${
          defaultActive ? ` ${styles.swatchActive}` : ""
        }`}
        title={defaultLabel}
        aria-label={defaultLabel}
        onClick={onDefault}
      >
        {defaultLabel}
      </button>
      {presets.map((c) => {
        const selected = currentN === normalizeHex(c.value);
        return (
          <button
            key={c.id}
            type="button"
            role="option"
            aria-selected={selected}
            className={`${styles.swatch}${selected ? ` ${styles.swatchActive}` : ""}`}
            title={c.label}
            aria-label={c.label}
            style={{ background: c.value }}
            onClick={() => onPick(c.value, c.id)}
          >
            {selected ? <span className={styles.swatchCheck} aria-hidden="true">✓</span> : null}
          </button>
        );
      })}
      {recent.length ? (
        <div className={styles.recentRow} role="group" aria-label="Recent colours">
          <span className={styles.recentLabel}>Recent</span>
          {recent.map((c) => {
            const selected = currentN === c;
            return (
              <button
                key={c}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.swatch}${selected ? ` ${styles.swatchActive}` : ""}`}
                title={c}
                aria-label={`Recent ${c}`}
                style={{ background: c }}
                onClick={() => onCustom(c)}
              />
            );
          })}
        </div>
      ) : null}
      <div className={styles.hexRow}>
        <label className={styles.hexLabel}>
          <span className={styles.recentLabel}>Custom</span>
          <input
            type="text"
            className={styles.hexInput}
            value={hex}
            placeholder="#A8201A"
            aria-label="Custom hex colour"
            data-testid={`${id}-hex`}
            spellCheck={false}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && parsed) {
                e.preventDefault();
                onCustom(parsed);
              }
            }}
          />
        </label>
        <span
          className={styles.hexSwatch}
          style={{ background: parsed ?? "transparent" }}
          aria-hidden="true"
        />
        <button
          type="button"
          className={styles.hexApply}
          disabled={!parsed}
          aria-label="Apply custom colour"
          title={parsed ? `Apply ${parsed}` : "Enter 3 or 6 hex digits, e.g. #A8201A"}
          onClick={() => parsed && onCustom(parsed)}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
