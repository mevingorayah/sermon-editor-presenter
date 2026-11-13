"use client";

import type { Editor } from "@tiptap/react";
import { useState } from "react";
import {
  changeBlockTypeAt, collectBlocks, setBlockAttrsAt, setSectionColumns, TYPE_LABEL,
} from "./blockOps";
import {
  APPROVED_FONTS, FIELD, FONT_LABELS, SPACING_MAX, SPACING_MIN, sanitizeSpacing, sanitizeStyle,
  type BlockSpacing, type BlockStyle, type GlobalStyles,
} from "@/lib/builder/blockAttrs";
import { BLOCK_EFFECTS, BLOCK_SHADOWS } from "@/lib/sermon/blockStyle";
import styles from "./BlockBuilder.module.css";

const SWATCHES = [
  { label: "Ink", value: "#1A1A1A" }, { label: "Muted", value: "#595959" },
  { label: "Soft red", value: "#8F3A3A" }, { label: "Soft blue", value: "#376080" },
  { label: "Soft green", value: "#336640" },
];
const HIGHLIGHTS = [
  { label: "Yellow", value: "#FFF176" }, { label: "Amber", value: "#FFE0A3" },
  { label: "Mint", value: "#D6F5E3" }, { label: "Sky", value: "#DCEBFA" },
];

type Tab = "content" | "style" | "spacing";

interface Props {
  editor: Editor;
  pos: number | null;
  globalStyles: GlobalStyles;
  onGlobalStylesChange: (g: GlobalStyles) => void;
  /** Tablet bottom sheet: close control (hidden on wide layouts via CSS). */
  onCloseSheet?: () => void;
}

function Reset({ show, onClick, label }: { show: boolean; onClick: () => void; label: string }) {
  if (!show) return <span className={styles.globalTag}>Global</span>;
  return <button type="button" className={styles.reset} aria-label={`Reset ${label} to global`} onClick={onClick}>↺</button>;
}

export function StylePanel({ editor, pos, globalStyles, onGlobalStylesChange, onCloseSheet }: Props) {
  const [tab, setTab] = useState<Tab>("style");
  const block = pos !== null ? collectBlocks(editor).find((b) => b.pos === pos) : undefined;
  if (!block || pos === null) {
    return (
      <aside className={styles.right} aria-label="Block settings" data-testid="style-sheet" data-open="false">
        <p className={styles.empty}>Select a block to style it.</p>
      </aside>
    );
  }
  const type = block.node.type.name;
  const own: BlockStyle = (block.node.attrs[FIELD.style] as BlockStyle) ?? {};
  const sp: BlockSpacing = (block.node.attrs[FIELD.spacing] as BlockSpacing) ?? {};
  const glob = globalStyles[type as keyof GlobalStyles] ?? {};

  const setStyle = (k: keyof BlockStyle, v: unknown) =>
    setBlockAttrsAt(editor, pos, { [FIELD.style]: sanitizeStyle({ ...own, [k]: v === "" ? undefined : v } as BlockStyle) });
  const setSp = (k: keyof BlockSpacing, v: unknown) =>
    setBlockAttrsAt(editor, pos, { [FIELD.spacing]: sanitizeSpacing({ ...sp, [k]: v === "" ? undefined : Number(v) }) });

  const colourRow = (k: "color" | "highlight" | "background" | "borderLeft", label: string, list = SWATCHES) => (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.swatches} role="group" aria-label={label}>
        {list.map((s) => (
          <button key={s.value} type="button" className={styles.swatch} style={{ background: s.value }}
            aria-label={`${label} ${s.label}`} aria-pressed={own[k] === s.value}
            onClick={() => setStyle(k, s.value)} />
        ))}
        <input className={styles.hex} aria-label={`${label} custom hex`} placeholder={(glob.style?.[k] as string | undefined) ?? "#RRGGBB"}
          defaultValue={(own[k] as string | undefined) ?? ""} key={`${pos}-${k}-${own[k] ?? ""}`}
          onBlur={(e) => setStyle(k, e.target.value.trim())} />
      </div>
      <Reset show={own[k] !== undefined} label={label} onClick={() => setStyle(k, undefined)} />
    </div>
  );

  return (
    <aside className={styles.right} aria-label="Block settings" data-testid="style-sheet" data-open="true">
      <div className={styles.sheetBar}>
        <span className={styles.sheetHandle} aria-hidden />
        <h2 className={styles.panelTitle}>{TYPE_LABEL[type] ?? type}</h2>
        {onCloseSheet ? (
          <button type="button" className={styles.sheetClose} aria-label="Close block settings" onClick={onCloseSheet}>
            Close
          </button>
        ) : null}
      </div>
      <div role="tablist" aria-label="Block settings tabs" className={styles.tabs}>
        {(["content", "style", "spacing"] as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={styles.tab}
            onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === "content" && (
        <div role="tabpanel" aria-label="Content">
          {block.node.isTextblock && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Type</span>
              <select className={styles.input} value={type}
                onChange={(e) => changeBlockTypeAt(editor, pos, e.target.value, e.target.value === "heading" ? { level: 1 } : {})}>
                {["title", "heading", "paragraph", "scripture", "quote", "illustration"].map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
          )}
          {type === "heading" && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Heading level</span>
              <select className={styles.input} value={block.node.attrs.level}
                onChange={(e) => setBlockAttrsAt(editor, pos, { level: Number(e.target.value) })}>
                <option value={1}>1 (point)</option><option value={2}>2 (subpoint)</option>
              </select>
            </label>
          )}
          {type === "scripture" && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Scripture reference</span>
              <input className={styles.input} defaultValue={block.node.attrs.citation ?? ""} key={`cit-${pos}`}
                onBlur={(e) => setBlockAttrsAt(editor, pos, { citation: e.target.value })} />
            </label>
          )}
          {type === "section" && (
            <fieldset className={styles.field}>
              <legend className={styles.fieldLabel}>Columns</legend>
              <div role="group" aria-label="Section columns" className={styles.swatches}>
                {([1, 2, 3] as const).map((n) => (
                  <button key={n} type="button" className={styles.panelBtn}
                    aria-pressed={Number(block.node.attrs.columns) === n}
                    onClick={() => setSectionColumns(editor, pos, n)}>
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {tab === "style" && (
        <div role="tabpanel" aria-label="Style">
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Font</span>
            <select className={styles.input} aria-label="Font" value={own.font ?? ""} onChange={(e) => setStyle("font", e.target.value)}>
              <option value="">{glob.style?.font ? `Global (${FONT_LABELS[glob.style.font]})` : "Global"}</option>
              {APPROVED_FONTS.map((f) => <option key={f} value={f}>{FONT_LABELS[f]}</option>)}
            </select>
            <Reset show={own.font !== undefined} label="font" onClick={() => setStyle("font", undefined)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Size (pt)</span>
            <input type="number" min={8} max={96} className={styles.input} aria-label="Size"
              placeholder={glob.style?.size ? String(glob.style.size) : "Global"}
              value={own.size ?? ""} onChange={(e) => setStyle("size", e.target.value ? Number(e.target.value) : undefined)} />
            <Reset show={own.size !== undefined} label="size" onClick={() => setStyle("size", undefined)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Weight</span>
            <select className={styles.input} aria-label="Weight" value={own.weight ?? ""} onChange={(e) => setStyle("weight", e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Global</option>
              {[[400, "Regular"], [700, "Bold"]].map(([w, l]) => <option key={w} value={w}>{l}</option>)}
            </select>
            <Reset show={own.weight !== undefined} label="weight" onClick={() => setStyle("weight", undefined)} />
          </label>
          <div className={styles.checkField}>
            <label className={styles.checkRow}>
              <input type="checkbox" className={styles.check} checked={!!own.italic}
                onChange={(e) => setStyle("italic", e.target.checked)} />
              <span>Italic</span>
            </label>
            <Reset show={own.italic !== undefined} label="italic" onClick={() => setStyle("italic", undefined)} />
          </div>
          {colourRow("color", "Text colour")}
          {colourRow("highlight", "Highlight", HIGHLIGHTS)}
          {colourRow("background", "Background", HIGHLIGHTS)}
          {colourRow("borderLeft", "Left border")}
          <button type="button" className={styles.panelBtn} aria-pressed={own.borderLeft === null} onClick={() => setStyle("borderLeft", null)}>No left border</button>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Align</span>
            <div role="group" aria-label="Block align" className={styles.swatches}>
              {(["left", "center", "right", "justify"] as const).map((a) => (
                <button key={a} type="button" className={styles.panelBtn} aria-pressed={own.align === a}
                  onClick={() => setStyle("align", a)}>{a}</button>
              ))}
            </div>
            <Reset show={own.align !== undefined} label="align" onClick={() => setStyle("align", undefined)} />
          </div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Shadow</span>
            <select className={styles.input} aria-label="Shadow" value={own.shadow ?? ""} onChange={(e) => setStyle("shadow", e.target.value)}>
              <option value="">Global</option>
              {BLOCK_SHADOWS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            <Reset show={own.shadow !== undefined} label="shadow" onClick={() => setStyle("shadow", undefined)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Effect</span>
            <select className={styles.input} aria-label="Effect" value={own.effect ?? ""} onChange={(e) => setStyle("effect", e.target.value)}>
              <option value="">Global</option>
              {BLOCK_EFFECTS.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
            <Reset show={own.effect !== undefined} label="effect" onClick={() => setStyle("effect", undefined)} />
          </label>
        </div>
      )}

      {tab === "spacing" && (
        <div role="tabpanel" aria-label="Spacing">
          {([
            ["mt", "Margin top"], ["mb", "Margin bottom"], ["pt", "Padding top"],
            ["pr", "Padding right"], ["pb", "Padding bottom"], ["pl", "Padding left"],
          ] as [keyof BlockSpacing, string][]).map(([k, label]) => (
            <label key={k} className={styles.field}>
              <span className={styles.fieldLabel}>{label}</span>
              <input type="range" min={SPACING_MIN} max={SPACING_MAX} aria-label={label} className={styles.range}
                value={sp[k] ?? glob.spacing?.[k] ?? 0} onChange={(e) => setSp(k, e.target.value)} />
              <span className={styles.value}>{sp[k] ?? "Global"}</span>
              <Reset show={sp[k] !== undefined} label={label} onClick={() => setSp(k, "")} />
            </label>
          ))}
        </div>
      )}

      <button type="button" className={styles.saveGlobal}
        onClick={() => onGlobalStylesChange({ ...globalStyles, [type]: { style: { ...glob.style, ...own }, spacing: { ...glob.spacing, ...sp } } })}>
        Save as global style for {TYPE_LABEL[type] ?? type}
      </button>
    </aside>
  );
}
