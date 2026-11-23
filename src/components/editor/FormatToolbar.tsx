"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
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
import { blockAtSelection, setBlockAttrsAt } from "@/components/builder/blockOps";
import { FIELD, sanitizeStyle, type BlockStyle } from "@/lib/builder/blockAttrs";
import { FONT_SIZE_MAX_PT, FONT_SIZE_MIN_PT } from "@/lib/sermon/blockStyle";

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
      width="18"
      height="18"
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
  /** Right Formatting panel toggle (far right of the top bar). */
  formattingOpen?: boolean;
  onToggleFormatting?: () => void;
}

/**
 * Compact one-row top bar (Edit layout spec 3): Style, Undo/Redo, Font,
 * Size, Alignment, Spacing, Colour, then "⋯" overflow and the Formatting
 * toggle at the far right.
 */
export function FormatToolbar({ editor, formattingOpen, onToggleFormatting }: FormatToolbarProps) {
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
      blockStyle: currentBlockStyle(ed),
      blockPos: blockAtSelection(ed)?.pos ?? -1,
      blockSize: ((blockAtSelection(ed)?.node.attrs[FIELD.style] as BlockStyle | null)?.size as number | undefined) ?? 0,
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

  const blockSize = state.blockSize;
  const [sizeDraft, setSizeDraft] = useState("");
  useEffect(() => {
    setSizeDraft(blockSize ? String(blockSize) : "");
  }, [blockSize, state.blockPos]);
  const onSize = (raw: string) => {
    setSizeDraft(raw);
    const b = blockAtSelection(editor);
    if (!b) return;
    const own = (b.node.attrs[FIELD.style] as BlockStyle | null) ?? {};
    if (raw.trim() === "") {
      setBlockAttrsAt(editor, b.pos, { [FIELD.style]: sanitizeStyle({ ...own, size: undefined }) });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < FONT_SIZE_MIN_PT || n > FONT_SIZE_MAX_PT) return;
    setBlockAttrsAt(editor, b.pos, { [FIELD.style]: sanitizeStyle({ ...own, size: n }) });
  };

  const align = useMenu();
  const spacing = useMenu();
  const more = useMenu();
  const alignKind: AlignKind = state.alignCenter
    ? "center"
    : state.alignRight
      ? "right"
      : state.alignJustify
        ? "justify"
        : "left";

  const groups: { id: string; label: string; node: ReactNode }[] = [
    {
      id: "style",
      label: "Block style",
      node: (
        <label className={styles.fontLabel}>
          <span className="visually-hidden">Style</span>
          <select
            className={`${styles.fontSelect} ${styles.styleSelect}`}
            aria-label="Style"
            title="Style"
            value={state.blockStyle}
            onChange={(e) => applyBlockStyle(editor, e.target.value)}
          >
            <option value="" disabled hidden>
              —
            </option>
            {STYLE_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ),
    },
    {
      id: "history",
      label: "History",
      node: (
        <>
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
        </>
      ),
    },
    {
      id: "font",
      label: "Font",
      node: (
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
      ),
    },
    {
      id: "size",
      label: "Size",
      node: (
        <input
          type="number"
          className={styles.sizeInput}
          min={FONT_SIZE_MIN_PT}
          max={FONT_SIZE_MAX_PT}
          step={1}
          value={sizeDraft}
          placeholder="pt"
          disabled={state.blockPos < 0}
          aria-label="Font size (pt)"
          title={`Block text size (${FONT_SIZE_MIN_PT}–${FONT_SIZE_MAX_PT} pt)`}
          data-testid="font-size"
          onChange={(e) => onSize(e.target.value)}
        />
      ),
    },
    {
      id: "align",
      label: "Alignment",
      node: (
        <div className={styles.colorGroup} ref={align.ref}>
          <button
            type="button"
            className={`${styles.toolBtn}${align.open ? ` ${styles.toolBtnActive}` : ""}`}
            aria-label={`Alignment: ${ALIGN_LABEL[alignKind]}`}
            title="Alignment"
            aria-haspopup="true"
            aria-expanded={align.open}
            data-testid="align-trigger"
            onClick={() => align.setOpen(!align.open)}
          >
            <AlignIcon kind={alignKind} />
          </button>
          {align.open ? (
            <div className={styles.popover} role="group" aria-label="Alignment options">
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
                  onClick={() => {
                    editor.chain().focus().setTextAlign(kind).run();
                    align.setOpen(false);
                  }}
                >
                  <AlignIcon kind={kind} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "spacing",
      label: "Spacing",
      node: (
        <div className={styles.colorGroup} ref={spacing.ref}>
          <button
            type="button"
            className={`${styles.toolBtn}${spacing.open ? ` ${styles.toolBtnActive}` : ""}`}
            aria-label="Spacing"
            title="Letter and line spacing"
            aria-haspopup="dialog"
            aria-expanded={spacing.open}
            data-testid="spacing-trigger"
            onClick={() => spacing.setOpen(!spacing.open)}
          >
            <SpacingIcon />
          </button>
          {spacing.open ? (
            <div className={`${styles.popover} ${styles.spacingPopover}`} role="dialog" aria-label="Spacing">
              <label className={styles.spacingLabel}>
                <span className={styles.spacingName}>Letter</span>
                <input
                  type="range"
                  className={styles.spacingRange}
                  min={LETTER_SPACING.min}
                  max={LETTER_SPACING.max}
                  step={LETTER_SPACING.step}
                  value={letterVal ?? 0}
                  aria-label="Letter spacing slider"
                  onChange={(e) => onLetter(e.target.value)}
                />
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
                  type="range"
                  className={styles.spacingRange}
                  min={LINE_SPACING.min}
                  max={LINE_SPACING.max}
                  step={LINE_SPACING.step}
                  value={lineVal ?? LINE_SPACING.min}
                  aria-label="Line spacing slider"
                  onChange={(e) => onLine(e.target.value)}
                />
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
          ) : null}
        </div>
      ),
    },
    {
      id: "colour",
      label: "Colour",
      node: (
        <>
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
          <div className={styles.colorGroup} ref={colorWrapRef}>
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
        </>
      ),
    },
  ];

  // "⋯" overflow: groups move into the menu starting from the right; the
  // row never wraps. Widths are measured while a group sits in the row.
  const rowRef = useRef<HTMLDivElement>(null);
  const widths = useRef<Record<string, number>>({});
  const [inlineCount, setInlineCount] = useState(groups.length);
  const groupCount = groups.length;
  const fit = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    row.querySelectorAll<HTMLElement>("[data-tool-group]").forEach((el) => {
      if (el.closest("[data-overflow-menu]")) return;
      widths.current[el.dataset.toolGroup!] = el.offsetWidth;
    });
    const tail = row.querySelector<HTMLElement>("[data-toolbar-tail]");
    const moreBtn = row.querySelector<HTMLElement>("[data-more-btn]");
    const cs = getComputedStyle(row);
    const gap = parseFloat(cs.columnGap) || 0;
    const avail =
      row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (tail?.offsetWidth ?? 0) - gap;
    const divider = 1 + gap * 2 + 4;
    const ids = groups.map((g) => g.id);
    const total = (n: number) =>
      ids.slice(0, n).reduce((sum, id, i) => sum + (widths.current[id] ?? 120) + (i ? divider : 0), 0);
    if (total(ids.length) <= avail) {
      setInlineCount(ids.length);
      return;
    }
    const moreW = (moreBtn?.offsetWidth || 44) + divider;
    let n = ids.length - 1;
    while (n > 0 && total(n) + moreW > avail) n -= 1;
    setInlineCount(n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupCount]);
  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(() => fit());
    if (rowRef.current) ro.observe(rowRef.current);
    return () => ro.disconnect();
  }, [fit]);
  useEffect(() => {
    if (inlineCount >= groups.length) more.setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inlineCount]);

  const renderGroup = (g: (typeof groups)[number]) => (
    <div key={g.id} className={styles.toolGroup} role="group" aria-label={g.label} data-tool-group={g.id}>
      {g.node}
    </div>
  );
  const inline = groups.slice(0, inlineCount);
  const overflow = groups.slice(inlineCount);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Text formatting" ref={rowRef} data-testid="top-bar" data-compact-chrome="">
      {inline.map((g, i) => (
        <Fragment key={g.id}>
          {i ? <div className={styles.toolDivider} aria-hidden="true" /> : null}
          {renderGroup(g)}
        </Fragment>
      ))}
      {overflow.length ? (
        <>
          <div className={styles.toolDivider} aria-hidden="true" />
          <div className={styles.colorGroup} ref={more.ref}>
            <button
              type="button"
              className={`${styles.toolBtn}${more.open ? ` ${styles.toolBtnActive}` : ""}`}
              aria-label="More tools"
              title="More tools"
              aria-haspopup="true"
              aria-expanded={more.open}
              data-more-btn=""
              data-testid="more-tools"
              onClick={() => more.setOpen(!more.open)}
            >
              ⋯
            </button>
            {more.open ? (
              <div
                className={`${styles.popover} ${styles.overflowMenu}`}
                role="group"
                aria-label="More tools"
                data-overflow-menu=""
              >
                {overflow.map(renderGroup)}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <div className={styles.toolbarSpacer} />
      <div className={styles.toolbarTail} data-toolbar-tail="">
        {onToggleFormatting ? (
          <button
            type="button"
            className={`${styles.toolBtn} ${styles.formattingToggle}${formattingOpen ? ` ${styles.toolBtnActive}` : ""}`}
            aria-pressed={!!formattingOpen}
            aria-controls="formatting-panel"
            data-testid="formatting-toggle"
            onClick={onToggleFormatting}
          >
            Formatting
          </button>
        ) : null}
      </div>
    </div>
  );
}

type AlignKind = "left" | "center" | "right" | "justify";
const ALIGN_LABEL: Record<AlignKind, string> = { left: "Left", center: "Center", right: "Right", justify: "Justify" };

/** Top-bar Style dropdown (replaces the Title/H1/H2/Body/Scripture/Verse snippet buttons). */
const STYLE_OPTIONS = [
  ["title", "Title"],
  ["heading1", "H1"],
  ["heading2", "H2"],
  ["paragraph", "Body"],
  ["scripture", "Scripture"],
  ["verseSnippet", "Verse snippet"],
] as const;

function currentBlockStyle(ed: Editor): string {
  if (ed.isActive("verseSnippet")) return "verseSnippet";
  if (ed.isActive("scripture")) return "scripture";
  if (ed.isActive("title")) return "title";
  if (ed.isActive("heading", { level: 1 })) return "heading1";
  if (ed.isActive("heading", { level: 2 })) return "heading2";
  if (ed.isActive("paragraph")) return "paragraph";
  return "";
}

/** Same commands as the old block-type buttons. */
function applyBlockStyle(editor: Editor, v: string) {
  if (v === "title") editor.chain().focus().setNode("title").run();
  else if (v === "heading1") editor.chain().focus().toggleHeading({ level: 1 }).run();
  else if (v === "heading2") editor.chain().focus().toggleHeading({ level: 2 }).run();
  else if (v === "paragraph") editor.chain().focus().setParagraph().run();
  else if (v === "scripture")
    editor.chain().focus().insertContent({ type: "scripture", attrs: { citation: "" }, content: [] }).run();
  else if (v === "verseSnippet") {
    // Insert after the current block so a selected atom is not replaced.
    const $from = editor.state.selection.$from;
    const depth = $from.depth || 1;
    let at = $from.after(depth);
    if (at == null || at < 0) at = editor.state.doc.content.size;
    editor
      .chain()
      .focus()
      .insertContentAt(at, { type: "verseSnippet", attrs: { ref: "", translation: "LSG", texts: {} } })
      .run();
  }
}

/** Popover open state that closes on outside click or Escape. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLElement>("button")?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function SpacingIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false" className={styles.alignIcon}>
      <path d="M3 4h14M3 16h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 6.5v7M7.8 8.5 10 6.3l2.2 2.2M7.8 11.5 10 13.7l2.2-2.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
