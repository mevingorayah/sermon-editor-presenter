import { APP_METRIC_CHARS as METRIC_CHARS, APP_WIDTHS } from "./appFontMetrics";
import { APP_COVERAGE, FALLBACK_WIDTHS } from "./appFontCoverage";
import { exportFontId, fontCategory, type ApprovedFontId, type FontFamilyId } from "./fonts";

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
  const st = style.bold && style.italic ? "BoldItalic" : style.bold ? "Bold" : style.italic ? "Italic" : "Regular";
  return `${exportFontId(id)}-${st}`;
}

/**
 * Family names inside the export files. Lora, Merriweather and Playfair
 * Display have an OFL Reserved Font Name, so their instanced (modified)
 * files use a neutral name; Lato ships unmodified.
 */
export const EXPORT_FAMILY: Record<ApprovedFontId, string> = {
  literata: "Literata Export",
  lora: "Sermon Export Serif A",
  merriweather: "Sermon Export Serif B",
  "playfair-display": "Sermon Export Serif C",
  "source-serif-4": "Source Serif 4 Export",
  inter: "Inter Export",
  "open-sans": "Open Sans Export",
  lato: "Lato",
  montserrat: "Montserrat Export",
  "nunito-sans": "Nunito Sans Export",
  "jetbrains-mono": "JetBrains Mono Export",
};

/**
 * Per-glyph fallback: characters an export font lacks (e.g. "↑" in Lora) are
 * measured and drawn in the bundled symbol font (DejaVu Sans, free licence),
 * never as a missing-glyph box. Regular/Bold only; italic keeps the upright.
 */
export const FALLBACK_FAMILY = "DejaVu Sans";
/** Office face for fallback runs in PPTX (ships with Windows and macOS Office). */
export const FALLBACK_OFFICE_FACE = "Segoe UI Symbol";
export function fallbackFontName(style: { bold?: boolean } = {}): string {
  return style.bold ? "symbols-fallback-Bold" : "symbols-fallback-Regular";
}

const coverageCache = new Map<string, Array<[number, number]>>();
function coverage(name: string): Array<[number, number]> {
  let r = coverageCache.get(name);
  if (!r) {
    r = (APP_COVERAGE[name] ?? "").split(",").filter(Boolean).map((t) => {
      const [a, b] = t.split("-");
      return [parseInt(a, 36), parseInt(b ?? a, 36)] as [number, number];
    });
    coverageCache.set(name, r);
  }
  return r;
}
function covers(name: string, cp: number): boolean {
  const r = coverage(name);
  if (r.length === 0) return true; // unknown font: never split
  let lo = 0;
  let hi = r.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < r[mid][0]) hi = mid - 1;
    else if (cp > r[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * True when `ch` must come from the fallback font in this style: the export
 * font lacks it and the fallback has it. Spaces (handled by safeGlyphs),
 * controls, combining marks and astral chars stay in the run's font.
 */
export function needsFallback(ch: string, style: { font: FontFamilyId; bold?: boolean; italic?: boolean }): boolean {
  const cp = ch.codePointAt(0)!;
  if (cp < 0x80 || cp > 0xffff || /[\s\p{M}\p{C}]/u.test(ch)) return false;
  return !covers(exportFontName(style.font, style), cp) && covers(fallbackFontName(style), cp);
}

/** Split text into [text, fallback?] pieces by glyph coverage. */
export function splitByCoverage(text: string, style: { font: FontFamilyId; bold?: boolean; italic?: boolean }): Array<{ text: string; fallback: boolean }> {
  const out: Array<{ text: string; fallback: boolean }> = [];
  for (const ch of text) {
    const fb = needsFallback(ch, style);
    const last = out[out.length - 1];
    if (last && last.fallback === fb) last.text += ch;
    else out.push({ text: ch, fallback: fb });
  }
  return out;
}

const fbCache = new Map<string, Map<number, number>>();
function fallbackWidth(cp: number, bold: boolean): number | undefined {
  const name = fallbackFontName({ bold });
  let m = fbCache.get(name);
  if (!m) {
    m = new Map();
    for (const t of (FALLBACK_WIDTHS[name] ?? "").split(",")) {
      if (!t) continue;
      const [c, w] = t.split(":");
      m.set(parseInt(c, 36), parseInt(w, 36));
    }
    fbCache.set(name, m);
  }
  return m.get(cp);
}

/** Default measurer: the export fonts' real advance widths (pure table). */
export const afmMeasurer: TextMeasurer = (text, sizePx, style) => {
  const name = exportFontName(style.font, style);
  const widths = APP_WIDTHS[name];
  let memo = cache.get(name);
  if (!memo) cache.set(name, (memo = new Map()));
  let units = 0;
  for (const ch of text) {
    if (needsFallback(ch, style)) {
      const w = fallbackWidth(ch.codePointAt(0)!, !!style.bold);
      if (w !== undefined) { units += w; continue; }
    }
    units += charWidth(ch, widths, memo);
  }
  return (units / 1000) * sizePx;
};
export const appFontMeasurer = afmMeasurer;

/**
 * CSS families for the PNG renderer: the export instances first (registered
 * with fontconfig from assets/fonts in both Dockerfiles), same widths as above.
 */
export function metricCompatibleCss(id: FontFamilyId): string {
  const fam = `"${EXPORT_FAMILY[exportFontId(id)]}"`;
  switch (fontCategory(id)) {
    case "mono": return `${fam}, "Liberation Mono", monospace`;
    case "serif": return `${fam}, "Liberation Serif", serif`;
    case "sans":
    default: return `${fam}, "Liberation Sans", sans-serif`;
  }
}

/**
 * Office faces for PPTX/DOCX (viewers don't have Literata/Inter). Each is no
 * wider than its export font, so the pre-broken, non-wrapping PPTX lines
 * never overflow; they just sit slightly narrower.
 */
export function metricCompatibleOffice(id: FontFamilyId): string {
  switch (fontCategory(id)) {
    case "mono": return "Courier New";
    case "serif": return "Times New Roman";
    case "sans":
    default: return "Calibri"; // Arial is about as wide as Inter; Calibri is safely narrower
  }
}

/** Shown next to the PowerPoint export option. */
export const PPTX_FONT_NOTICE = "PowerPoint uses standard fonts, so line breaks may differ slightly";
