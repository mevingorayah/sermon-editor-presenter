/**
 * Effective block-builder look for Preach and every export: built-in type
 * defaults (quote / illustration, as Edit draws them) < sermon.globalStyles
 * for the block type < the block's own attrs.style / attrs.spacing.
 *
 * `undefined` means "no builder styling at all": renderers then take their
 * legacy path, so sermons without styles export byte-identically.
 * Pure data, browser-safe.
 */
import type { BlockAlign, BlockFontId, BlockSpacing, BlockStyle, BlockType, GlobalStyles } from "../blockStyle";

export interface BlockLook {
  font?: BlockFontId;
  /** Raw stored size in pt (renderers clamp to the 24 pt floor). */
  sizePt?: number;
  weight?: 400 | 700;
  italic?: boolean;
  color?: string;
  /** Text highlight behind every line of the block. */
  highlight?: string;
  /** Box fill (padding area). */
  background?: string;
  /** Left rule colour; null = explicitly none. */
  borderLeft?: string | null;
  align?: BlockAlign;
  /** CSS px as in Edit (96 per inch). */
  spacing: BlockSpacing;
}

/** Edit's left rule width (globals.css / blockCss: 3px solid). */
export const BORDER_LEFT_CSS_PX = 3;
/** Edit's gap between section columns (1rem). */
export const SECTION_GAP_CSS_PX = 16;

/** Built-in looks for the new block types (globals.css .sermon-quote / .sermon-illustration). */
const BUILTIN: Partial<Record<BlockType, { style: BlockStyle; spacing: BlockSpacing }>> = {
  quote: { style: { italic: true, borderLeft: "#BDBDBD" }, spacing: { mt: 12, mb: 12, pl: 16 } },
  illustration: { style: { background: "#F6F3EA" }, spacing: { mt: 12, mb: 12, pt: 8, pb: 8, pl: 12, pr: 12 } },
  section: { style: {}, spacing: { mt: 12, mb: 12 } },
};

function clean<T extends object>(o: T | null | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!o || typeof o !== "object") return out;
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Merge the three layers; undefined when nothing at all is set. */
export function resolveBlockLook(
  type: BlockType,
  attrs: { style?: unknown; spacing?: unknown } | null | undefined,
  globals?: GlobalStyles | null,
): BlockLook | undefined {
  const b = BUILTIN[type];
  const g = globals?.[type];
  const style: BlockStyle = { ...clean(b?.style), ...clean(g?.style), ...clean(attrs?.style as BlockStyle) };
  const spacing: BlockSpacing = { ...clean(b?.spacing), ...clean(g?.spacing), ...clean(attrs?.spacing as BlockSpacing) };
  if (!Object.keys(style).length && !Object.keys(spacing).length) return undefined;
  const { size, ...rest } = style;
  return { ...rest, ...(size !== undefined ? { sizePt: size } : {}), spacing };
}

/** Bold / italic for a block: its look wins over the role (headings bold, Scripture italic). */
export function lookRole(
  role: { bold: boolean; italic: boolean },
  look?: BlockLook,
): { bold: boolean; italic: boolean } {
  if (!look) return role;
  return {
    bold: look.weight !== undefined ? look.weight === 700 : role.bold,
    italic: look.italic !== undefined ? look.italic : role.italic,
  };
}

/** Export alignment (justify is drawn left-aligned: lines are placed one by one). */
export function lookAlign(look: BlockLook | undefined, fallback: "left" | "center" | "right"): "left" | "center" | "right" {
  const a = look?.align;
  return a === "center" || a === "right" || a === "left" ? a : a === "justify" ? "left" : fallback;
}
