/**
 * Block builder editor adapter. Field names, types and validation come from
 * Backend (`@/lib/sermon` → blockStyle.ts, PR #30); this file only adds what
 * the editor needs on top: font labels, CSS rendering and stripping
 * default (null) attrs so untouched sermons save byte-identically.
 */
import type { JSONContent } from "@tiptap/core";
import {
  BLOCK_FONT_IDS, normalizeFontId, STYLABLE_NODE_TYPES, blockSpacingSchema, blockStyleSchema,
  SPACING_MIN_PX, SPACING_MAX_PX,
  type BlockFontId, type BlockSpacing, type BlockStyle, type GlobalStyles,
} from "../sermon/blockStyle";

export type { BlockSpacing, BlockStyle, GlobalStyles };
export { SPACING_MIN_PX as SPACING_MIN, SPACING_MAX_PX as SPACING_MAX };

export const FIELD = { style: "style", spacing: "spacing" } as const;
export const STYLED_TYPES = Array.from(STYLABLE_NODE_TYPES);

export const FONT_LABELS: Record<BlockFontId, string> = {
  lora: "Lora", merriweather: "Merriweather", "playfair-display": "Playfair Display",
  "source-serif-4": "Source Serif 4", literata: "Literata", inter: "Inter",
  "open-sans": "Open Sans", lato: "Lato", montserrat: "Montserrat", "nunito-sans": "Nunito Sans",
  "jetbrains-mono": "JetBrains Mono",
};
export const APPROVED_FONTS = BLOCK_FONT_IDS;
const SERIF = new Set(["lora", "merriweather", "playfair-display", "source-serif-4", "literata"]);

/** Drop undefined/"" keys (null kept: borderLeft null = "no border"). */
function compact(o: object | null | undefined): Record<string, unknown> | null {
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** Valid style or null (= global). Invalid keys are dropped one by one. */
export function sanitizeStyle(s: Partial<BlockStyle> | null | undefined): BlockStyle | null {
  const c = compact(s);
  if (!c) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    const r = blockStyleSchema.safeParse({ [k]: k === "font" ? normalizeFontId(v) : v });
    if (r.success) Object.assign(out, r.data);
  }
  return Object.keys(out).length ? (out as BlockStyle) : null;
}

export function sanitizeSpacing(s: Partial<BlockSpacing> | null | undefined): BlockSpacing | null {
  const c = compact(s);
  if (!c) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    const n = Math.max(SPACING_MIN_PX, Math.min(SPACING_MAX_PX, Math.round(Number(v))));
    const r = blockSpacingSchema.safeParse({ [k]: n });
    if (r.success) Object.assign(out, r.data);
  }
  return Object.keys(out).length ? (out as BlockSpacing) : null;
}

/** CSS declarations for a block. Empty input → "" (renders identically). */
export function blockCss(style?: BlockStyle | null, spacing?: BlockSpacing | null): string {
  const d: string[] = [];
  const s = style ?? {};
  if (s.font) d.push(`font-family: "${FONT_LABELS[s.font]}", ${s.font === "jetbrains-mono" ? "monospace" : SERIF.has(s.font) ? "serif" : "sans-serif"}`);
  if (s.size) d.push(`font-size: ${s.size}pt`);
  if (s.weight) d.push(`font-weight: ${s.weight}`);
  if (s.italic !== undefined) d.push(`font-style: ${s.italic ? "italic" : "normal"}`);
  if (s.color) d.push(`color: ${s.color}`);
  if (s.background) d.push(`background-color: ${s.background}`);
  if (s.highlight) d.push(`background-image: linear-gradient(${s.highlight}, ${s.highlight})`);
  if (s.borderLeft === null) d.push("border-left: none");
  else if (s.borderLeft) d.push(`border-left: 3px solid ${s.borderLeft}`);
  if (s.align) d.push(`text-align: ${s.align}`);
  const p = spacing ?? {};
  const px = (k: keyof BlockSpacing, prop: string) => { if (p[k] !== undefined) d.push(`${prop}: ${p[k]}px`); };
  px("mt", "margin-top"); px("mb", "margin-bottom");
  px("pt", "padding-top"); px("pr", "padding-right");
  px("pb", "padding-bottom"); px("pl", "padding-left");
  return d.join("; ");
}

/** Remove null/empty builder attrs so a sermon saved without edits is unchanged. */
export function stripDefaultBuilderAttrs(node: JSONContent): JSONContent {
  const out: JSONContent = { ...node };
  if (out.attrs) {
    const attrs: Record<string, unknown> = { ...out.attrs };
    for (const k of [FIELD.style, FIELD.spacing]) {
      if (k in attrs && !compact(attrs[k] as object | null)) delete attrs[k];
    }
    if (Object.keys(attrs).length) out.attrs = attrs;
    else delete out.attrs;
  }
  if (out.content) out.content = out.content.map(stripDefaultBuilderAttrs);
  return out;
}
