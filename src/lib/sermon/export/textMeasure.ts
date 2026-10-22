import { APP_METRIC_CHARS as METRIC_CHARS, APP_WIDTHS } from "./appFontMetrics";
import type { FontFamilyId } from "./fonts";

/** Style that affects glyph widths. */
export interface MeasureStyle {
  font: FontFamilyId;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Width in px of `text` at `sizePx` in `style`. Injectable: Preach can pass
 * a canvas-based measurer, but the default below is pure and deterministic
 * (no DOM, no Node), so server and browser get identical breaks.
 */
export type TextMeasurer = (text: string, sizePx: number, style: MeasureStyle) => number;

const INDEX = new Map<string, number>();
for (let i = 0; i < METRIC_CHARS.length; i++) {
  if (!INDEX.has(METRIC_CHARS[i])) INDEX.set(METRIC_CHARS[i], i);
}
const SPACE_LIKE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000\t]/;
const cache = new Map<string, Map<string, number>>();

function charWidth(ch: string, widths: readonly number[], memo: Map<string, number>): number {
  const hit = memo.get(ch);
  if (hit !== undefined) return hit;
  let w: number;
  const i = INDEX.get(ch);
  if (i !== undefined && widths[i] >= 0) w = widths[i];
  else if (SPACE_LIKE.test(ch)) w = widths[0];
  else if (/\p{M}/u.test(ch)) w = 0; // combining mark
  else {
    // Accented Latin letters (é, à, ç, Ê …) have their base letter's advance
    // in these fonts; strip the accent and measure the base.
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    const j = base.length === 1 ? INDEX.get(base) : undefined;
    // Anything else (Greek, Hebrew …): a wide-ish fallback so we never overflow.
    w = j !== undefined && widths[j] >= 0 ? widths[j] : Math.max(widths[INDEX.get("n")!], 600);
  }
  memo.set(ch, w);
  return w;
}

/**
 * Export font for a family + style: static Literata / Inter / JetBrains Mono
 * instances in assets/fonts/export. PDF embeds these files, PNG renders them
 * by family name via fontconfig, and the measurer below uses their widths.
 */
export function exportFontName(id: FontFamilyId, style: { bold?: boolean; italic?: boolean } = {}): string {
  const fam = id === "mono" ? "JetBrainsMonoExport" : id === "sans" ? "InterExport" : "LiterataExport";
  const st = style.bold && style.italic ? "BoldItalic" : style.bold ? "Bold" : style.italic ? "Italic" : "Regular";
  return `${fam}-${st}`;
}

/** Default measurer: the export fonts' real advance widths (pure table). */
export const afmMeasurer: TextMeasurer = (text, sizePx, style) => {
  const name = exportFontName(style.font, style);
  const widths = APP_WIDTHS[name];
  let memo = cache.get(name);
  if (!memo) cache.set(name, (memo = new Map()));
  let units = 0;
  for (const ch of text) units += charWidth(ch, widths, memo);
  return (units / 1000) * sizePx;
};
export const appFontMeasurer = afmMeasurer;

/**
 * CSS families for the PNG renderer: the export instances first (registered
 * with fontconfig from assets/fonts in both Dockerfiles), same widths as above.
 */
export function metricCompatibleCss(id: FontFamilyId): string {
  switch (id) {
    case "mono": return '"JetBrains Mono Export", "JetBrains Mono", "Liberation Mono", monospace';
    case "serif": return '"Literata Export", Literata, "Liberation Serif", serif';
    case "sans":
    default: return '"Inter Export", Inter, "Liberation Sans", sans-serif';
  }
}

/**
 * Office faces for PPTX/DOCX (viewers don't have Literata/Inter). Each is no
 * wider than its export font, so the pre-broken, non-wrapping PPTX lines
 * never overflow; they just sit slightly narrower.
 */
export function metricCompatibleOffice(id: FontFamilyId): string {
  switch (id) {
    case "mono": return "Courier New";
    case "serif": return "Times New Roman";
    case "sans":
    default: return "Calibri"; // Arial is about as wide as Inter; Calibri is safely narrower
  }
}
