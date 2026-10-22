/**
 * Block builder adapter: the ONLY place that knows how per-block style and
 * spacing are stored in TipTap JSON. Backend owns the final field names
 * (UX slice-1: block.style / block.spacing / sermon.globalStyles / Section
 * {columns, children}); if they change, change FIELD below only.
 *
 * Rule: empty = global. A block with no overrides carries NO builder attrs in
 * saved JSON, so existing sermons serialize byte-identically.
 */
import type { JSONContent } from "@tiptap/core";

export const FIELD = { style: "blockStyle", spacing: "blockSpacing" } as const;

export interface BlockStyle {
  font?: string;
  size?: number; // pt
  weight?: 400 | 700;
  italic?: boolean;
  color?: string;
  highlight?: string;
  background?: string;
  borderLeft?: string; // hex | "none"; 3px solid
  align?: "left" | "center" | "right" | "justify";
}
export interface BlockSpacing {
  mt?: number; mb?: number; pt?: number; pr?: number; pb?: number; pl?: number;
}
export type GlobalStyles = Record<string, { style?: BlockStyle; spacing?: BlockSpacing }>;

/** Node types that accept per-block style/spacing. */
export const STYLED_TYPES = [
  "title", "heading", "paragraph", "scripture", "quote", "illustration", "section",
];

export const APPROVED_FONTS = [
  "Georgia", "Times New Roman", "Garamond", "Palatino", "Book Antiqua",
  "Arial", "Helvetica", "Verdana", "Calibri", "Atkinson Hyperlegible",
];

export const SPACING_MIN = 0;
export const SPACING_MAX = 64;
const HEX = /^#[0-9a-fA-F]{6}$/;

export function clampSpacing(n: unknown): number | undefined {
  const v = Number(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(SPACING_MIN, Math.min(SPACING_MAX, Math.round(v)));
}

/** Drop undefined/empty keys; returns null when nothing is set. */
export function compact<T extends object>(o: T | null | undefined): T | null {
  if (!o) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : null;
}

export function sanitizeStyle(s: BlockStyle | null | undefined): BlockStyle | null {
  if (!s) return null;
  const c = (x?: string) => (x && HEX.test(x) ? x : undefined);
  return compact<BlockStyle>({
    font: s.font && APPROVED_FONTS.includes(s.font) ? s.font : undefined,
    size: s.size && s.size >= 6 && s.size <= 72 ? Math.round(s.size) : undefined,
    weight: s.weight && [400, 700].includes(s.weight) ? s.weight : undefined,
    italic: typeof s.italic === "boolean" ? s.italic : undefined,
    color: c(s.color), highlight: c(s.highlight), background: c(s.background),
    borderLeft: s.borderLeft === "none" ? "none" : c(s.borderLeft),
    align: s.align && ["left", "center", "right", "justify"].includes(s.align) ? s.align : undefined,
  });
}

export function sanitizeSpacing(s: BlockSpacing | null | undefined): BlockSpacing | null {
  if (!s) return null;
  return compact<BlockSpacing>({
    mt: clampSpacing(s.mt), mb: clampSpacing(s.mb), pt: clampSpacing(s.pt),
    pr: clampSpacing(s.pr), pb: clampSpacing(s.pb), pl: clampSpacing(s.pl),
  });
}

/** Merge block override over global (block wins). */
export function effective<T extends object>(global?: T | null, own?: T | null): T {
  return { ...(global ?? {}), ...(own ?? {}) } as T;
}

/** CSS declarations for a block. Empty input → "" (renders identically). */
export function blockCss(style?: BlockStyle | null, spacing?: BlockSpacing | null): string {
  const d: string[] = [];
  const s = style ?? {};
  if (s.font) d.push(`font-family: "${s.font}"`);
  if (s.size) d.push(`font-size: ${s.size}pt`);
  if (s.weight) d.push(`font-weight: ${s.weight}`);
  if (s.italic !== undefined) d.push(`font-style: ${s.italic ? "italic" : "normal"}`);
  if (s.color) d.push(`color: ${s.color}`);
  if (s.background) d.push(`background-color: ${s.background}`);
  if (s.highlight) d.push(`--block-highlight: ${s.highlight}`);
  if (s.borderLeft) d.push(s.borderLeft === "none" ? "border-left: none" : `border-left: 3px solid ${s.borderLeft}`);
  if (s.align) d.push(`text-align: ${s.align}`);
  const p = spacing ?? {};
  const px = (k: keyof BlockSpacing, prop: string) => {
    if (p[k] !== undefined) d.push(`${prop}: ${p[k]}px`);
  };
  px("mt", "margin-top"); px("mb", "margin-bottom");
  px("pt", "padding-top"); px("pr", "padding-right");
  px("pb", "padding-bottom"); px("pl", "padding-left");
  return d.join("; ");
}

/**
 * Remove builder attrs that are at their default (null/empty) from TipTap
 * JSON, so a sermon opened and saved without edits is unchanged.
 */
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
