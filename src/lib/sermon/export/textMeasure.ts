import { AFM_WIDTHS, METRIC_CHARS } from "./fontMetrics";
import { pdfkitFont, type FontFamilyId } from "./fonts";

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
  if (i !== undefined) w = widths[i];
  else if (SPACE_LIKE.test(ch)) w = widths[0];
  else if (/\p{M}/u.test(ch)) w = 0; // combining mark
  else {
    // Accented Latin letters (é, à, ç, Ê …) have their base letter's advance
    // in these fonts; strip the accent and measure the base.
    const base = ch.normalize("NFD").replace(/\p{M}/gu, "");
    const j = base.length === 1 ? INDEX.get(base) : undefined;
    // Anything else (Greek, Hebrew …): a wide-ish fallback so we never overflow.
    w = j !== undefined ? widths[j] : Math.max(widths[INDEX.get("n")!], 600);
  }
  memo.set(ch, w);
  return w;
}

/** Default measurer: Adobe Core 14 metrics (Helvetica/Times/Courier families). */
export const afmMeasurer: TextMeasurer = (text, sizePx, style) => {
  const name = pdfkitFont(style.font, style);
  const widths = AFM_WIDTHS[name];
  let memo = cache.get(name);
  if (!memo) cache.set(name, (memo = new Map()));
  let units = 0;
  for (const ch of text) units += charWidth(ch, widths, memo);
  return (units / 1000) * sizePx;
};

/**
 * Font faces that share the default measurer's metrics, for renderers.
 * PNG (SVG via fontconfig) uses the Liberation families, which ship in both
 * Dockerfiles; PPTX/DOCX use the Office faces with the same metrics.
 */
export function metricCompatibleCss(id: FontFamilyId): string {
  switch (id) {
    case "mono": return '"Liberation Mono", "Courier New", Courier, monospace';
    case "serif": return '"Liberation Serif", "Times New Roman", Times, serif';
    case "sans":
    default: return '"Liberation Sans", Arial, Helvetica, sans-serif';
  }
}

export function metricCompatibleOffice(id: FontFamilyId): string {
  switch (id) {
    case "mono": return "Courier New";
    case "serif": return "Times New Roman";
    case "sans":
    default: return "Arial";
  }
}
