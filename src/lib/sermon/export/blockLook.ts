/**
 * Effective block-builder look for Preach and every export: built-in type
 * defaults (quote / illustration, as Edit draws them) < sermon.globalStyles
 * for the block type < the block's own attrs.style / attrs.spacing.
 *
 * `undefined` means "no builder styling at all": renderers then take their
 * legacy path, so sermons without styles export byte-identically.
 * Pure data, browser-safe.
 */
import type { BlockAlign, BlockEffect, BlockFontId, BlockShadow, BlockSpacing, BlockStyle, BlockType, GlobalStyles } from "../blockStyle";

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
  shadow?: BlockShadow;
  effect?: BlockEffect;
  /** CSS px as in Edit (96 per inch). */
  spacing: BlockSpacing;
}

/** CSS box-shadow as Edit draws it (`blockCss`): offset, blur, colour, opacity. */
export interface BlockShadowPaint {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}

/** Matches the named presets in the builder style panel / `blockCss`. */
export const BLOCK_SHADOW_PAINT: Record<Exclude<BlockShadow, "none">, BlockShadowPaint> = {
  soft: { offsetX: 0, offsetY: 1, blur: 3, color: "#000000", opacity: 0.16 },
  medium: { offsetX: 0, offsetY: 4, blur: 12, color: "#000000", opacity: 0.18 },
  strong: { offsetX: 0, offsetY: 8, blur: 24, color: "#000000", opacity: 0.22 },
};

export function blockShadowPaint(shadow?: BlockShadow | null): BlockShadowPaint | undefined {
  if (!shadow || shadow === "none") return undefined;
  return BLOCK_SHADOW_PAINT[shadow];
}

/** pptxgenjs shape shadow: type outer, blur/offset in points, angle 0° = right, 90° = down. */
export function pptxShadowOptions(
  paint: BlockShadowPaint,
  pxToPt: (px: number) => number,
): { type: "outer"; blur: number; offset: number; angle: number; color: string; opacity: number } {
  const dist = Math.hypot(paint.offsetX, paint.offsetY);
  const deg = dist === 0 ? 0 : (Math.atan2(paint.offsetY, paint.offsetX) * 180) / Math.PI;
  const angle = ((deg % 360) + 360) % 360;
  return {
    type: "outer",
    blur: pxToPt(paint.blur),
    offset: pxToPt(dist),
    angle,
    color: paint.color.replace(/^#/, "").toUpperCase(),
    opacity: paint.opacity,
  };
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
  type: BlockType | "verseSnippet",
  attrs: { style?: unknown; spacing?: unknown } | null | undefined,
  globals?: GlobalStyles | null,
): BlockLook | undefined {
  const b = type === "verseSnippet" ? undefined : BUILTIN[type];
  const g = type === "verseSnippet" ? undefined : globals?.[type];
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
export function lookAlign(look: BlockLook | undefined, fallback: "left" | "center" | "right" | "justify"): "left" | "center" | "right" {
  const a = look?.align ?? fallback;
  return a === "center" || a === "right" ? a : "left";
}

/** Preach page view can honour justify (CSS); raster exports use lookAlign. */
export function cssAlign(look: BlockLook | undefined, fallback: "left" | "center" | "right" | "justify"): "left" | "center" | "right" | "justify" {
  const a = look?.align ?? fallback;
  return a === "center" || a === "right" || a === "justify" ? a : "left";
}
