import { snapshotLineSpacing } from "./frames";
import type { CalibratedSnapshot } from "@/types/document";
import { citationDisplay, styledBlocksFromSnapshot, titleTextFromSnapshot, type BlockColumn, type StyledBlock } from "./contentWalk";
import { effectiveBlockSizePt } from "../blockStyle";
import { BORDER_LEFT_CSS_PX, SECTION_GAP_CSS_PX, lookRole, type BlockLook } from "./blockLook";
import { DEFAULT_MARGINS, resolveMargins } from "./margins";
import { PAGE_LIMITS, clamp, pngFrameSize, pxPerInch, pxPerPt, resolvePage, type PageInput, type PageSpec } from "./frames";
import type { FontFamilyId } from "./fonts";
import { afmMeasurer, type MeasureStyle, type TextMeasurer } from "./textMeasure";

/**
 * Shared, pure (client-safe, no sharp) page layout for PNG (and later PPTX)
 * export. UI UX ruling: these pages are the source of truth, not the PDF's
 * breaks. Backend's buildPngPages renders `layoutPngPages()`; the Export
 * button uses `countPngPages()` to say "Images (N pages, .zip)".
 *
 * Line breaks use real glyph widths (see textMeasure.ts): pure data, no DOM
 * or Node APIs, so Preach can import this module in the browser and get the
 * exact same breaks as the server.
 */

export {
  PAGE_FORMATS, PAGE_ORIENTATIONS, MIN_TEXT_PT, allPageSpecs, frameSizeInches, isPaperPage, pageSpecFromTarget,
  pngFrameSize, pngFrameWidthInches, pxPerInch, pxPerPt, resolvePage,
  PRESET_PAGE_FORMATS, PAPER_PAGE_FORMATS, fitToCustom, CUSTOM_UNITS, CUSTOM_PAGE_LIMITS, customPageError, customSizeToInches, pageGeometry, fitScreenLabel, DEFAULT_PAGE,
  type CustomPageSize, type FitPageSpec, type CustomPageUnit, type ResolvedPage,
  type PageFormat, type PageInput, type PageOrientation, type PageSpec,
} from "./frames";
export { afmMeasurer, type MeasureStyle, type TextMeasurer } from "./textMeasure";

/** UI UX: PNG/PPTX body text is at least 24 pt. */
export const MIN_BODY_PT = 24;
const BASE_BODY_PX = 20;

/**
 * Scale applied to every size, gap and line box so body text is ≥ 24 pt
 * (16:9: 24pt × 2px = 48px → ×2.4). Never shrinks.
 */
export function pngTypeScale(target: PageInput): number {
  const pt = Math.max(MIN_BODY_PT, resolvePage(target).textSizePt);
  return Math.max(1, (pt * pxPerPt(target)) / BASE_BODY_PX);
}

function roleSize(type: StyledBlock["type"]): { size: number; gap: number } {
  switch (type) {
    case "Title": return { size: 42, gap: 28 };
    case "H1": return { size: 30, gap: 18 };
    case "H2": return { size: 24, gap: 14 };
    case "Caption": return { size: 16, gap: 12 };
    default: return { size: 20, gap: 12 };
  }
}

/** A block as the layout sees it: plain text plus its role. */
export interface LayoutBlock {
  type: StyledBlock["type"];
  /** Plain text of the block (runs joined). */
  text: string;
  citation?: string;
  /** When true, the citation is a top bar (verse snippets), not a right-aligned caption. */
  verseBar?: boolean;
  /**
   * Optional style runs whose texts concatenate to `text`; they set the font
   * family / bold / italic used to measure each character. Without runs the
   * whole block is measured in the role's default style (sans).
   */
  runs?: ReadonlyArray<{ text: string; fontFamily?: FontFamilyId; bold?: boolean; italic?: boolean; letterSpacing?: string; lineSpacing?: string }>;
  letterSpacing?: string;
  lineSpacing?: string;
  /** Block-builder look (size, weight, spacing, box…); absent = legacy layout. */
  look?: BlockLook;
  /** Section column the block sits in. */
  column?: BlockColumn;
}

/** Options shared by the layout entry points. */
export interface LayoutOptions {
  /** Text measurer; defaults to the pure `afmMeasurer`. */
  measure?: TextMeasurer;
  /**
   * Space after each paragraph in points (0–48, default 20). When omitted
   * the older role-proportional gaps are used (legacy snapshots).
   */
  paragraphSpacingPt?: number;
}

/** Headings are drawn bold, Scripture italic (same in every renderer). */
export function roleStyle(type: StyledBlock["type"]): { bold: boolean; italic: boolean } {
  return { bold: type === "Title" || type === "H1" || type === "H2", italic: type === "Scripture" };
}

/** One placed line. `start`/`end` are char offsets into the block's `text`. */
export interface PngPageLine {
  blockIndex: number;
  kind: "text" | "citation";
  /** Line index within the block (citation: the line count). */
  lineIndex: number;
  start: number;
  end: number;
  /** Top of the line box in px; the baseline is `y + size`. */
  y: number;
  size: number;
  lineHeight: number;
  /** Styled / column blocks only: left edge and width of the line's text box. */
  x?: number;
  width?: number;
}

/** A filled box and/or left rule behind a styled block or section (px). */
export interface PngBox {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  border?: string;
  borderWidth: number;
}

export interface PngPage {
  lines: PngPageLine[];
  /** Present only when a page has styled boxes (drawn before the text). */
  boxes?: PngBox[];
}

export interface PngFrame {
  width: number;
  height: number;
  /** Left edge of the text column (margin + binder gutter). */
  left: number;
  contentWidth: number;
  top: number;
  bottom: number;
}

const CITATION_SIZE = 16;
const CITATION_LH = 26;
const HEADINGS = new Set<StyledBlock["type"]>(["Title", "H1", "H2"]);

/** Frame geometry for a target (same numbers as png.ts). */
export function pngFrame(target: PageInput, margins?: CalibratedSnapshot["margins"]): PngFrame {
  const { width, height } = pngFrameSize(target);
  const m = resolveMargins(margins ?? DEFAULT_MARGINS, target);
  const ppi = pxPerInch(target); // margins are real inches on the frame (not rounded)
  const px = (inches: number) => inches * ppi;
  const left = px(m.left) + px(m.binderGutter);
  const right = px(m.right);
  return { width, height, left, contentWidth: width - left - right, top: px(m.top), bottom: height - px(m.bottom) };
}

/** A measured segment of a block: [start, end) in one style. */
export interface StyleSegment {
  start: number;
  end: number;
  style: MeasureStyle;
}

/** Style segments for a block (role style merged with each run). */
export function blockSegments(b: LayoutBlock): StyleSegment[] {
  const role = lookRole(roleStyle(b.type), b.look);
  if (!b.runs || b.runs.length === 0 || b.runs.map((r) => r.text).join("") !== b.text) {
    return [{ start: 0, end: b.text.length, style: { font: "sans", ...role } }];
  }
  const out: StyleSegment[] = [];
  let at = 0;
  for (const r of b.runs) {
    out.push({
      start: at,
      end: at + r.text.length,
      style: { font: r.fontFamily ?? "sans", bold: role.bold || !!r.bold, italic: role.italic || !!r.italic },
    });
    at += r.text.length;
  }
  return out;
}

/** Width in px of text[start, end) across style segments. */
export function measureRange(
  text: string,
  start: number,
  end: number,
  size: number,
  segments: readonly StyleSegment[],
  measure: TextMeasurer = afmMeasurer,
): number {
  let w = 0;
  for (const seg of segments) {
    const a = Math.max(start, seg.start);
    const b = Math.min(end, seg.end);
    if (a < b) w += measure(text.slice(a, b), size, seg.style);
  }
  return w;
}

/**
 * Break opportunities: lines break only at breaking spaces. NBSP (U+00A0),
 * figure space (U+2007) and narrow NBSP (U+202F) never break, and a run that
 * starts with closing punctuation (/ » ] ) . , ; : ! ? …) stays on the previous
 * word's line even after a normal space ("esklav. »]" never breaks before »).
 * Returns [start, end) of each unbreakable word, trailing spaces excluded.
 */
const BREAK_SPACE = "[ \\t\\n\\r\\f\\v\\u1680\\u2000-\\u2006\\u2008-\\u200a\\u2028\\u2029\\u205f\\u3000]";
const WORD_RE = new RegExp(`(?:(?!${BREAK_SPACE})[\\s\\S])+`, "g");
const CLOSING = /^[»\]\)\}.,;:!?…›”’/]/;
export function breakWords(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(WORD_RE)) {
    const a = m.index ?? 0;
    const z = a + m[0].length;
    if (out.length && CLOSING.test(m[0])) out[out.length - 1][1] = z;
    else out.push([a, z]);
  }
  return out;
}

/**
 * Wrap text into [start, end) line ranges by measured width. Trailing spaces
 * never count against the width; a single word wider than the line (long
 * French compounds on half-Letter) is split between characters so nothing
 * ever overflows the frame.
 */
export function wrapLineRanges(
  text: string,
  size: number,
  maxWidth: number,
  segments?: readonly StyleSegment[],
  measure: TextMeasurer = afmMeasurer,
  /** false: never break inside a word; an oversized word gets its own line. */
  splitWords = true,
): Array<[number, number]> {
  const segs = segments ?? [{ start: 0, end: text.length, style: { font: "sans" as const } }];
  const width = (a: number, b: number) => measureRange(text, a, b, size, segs, measure);
  const out: Array<[number, number]> = [];
  let lineStart = 0;
  let open = false;
  for (const [tokStart, wordEnd] of breakWords(text)) {
    if (open && width(lineStart, wordEnd) > maxWidth) {
      out.push([lineStart, tokStart]);
      lineStart = tokStart;
    }
    open = true;
    // Oversized word: break between characters (code points).
    while (splitWords && width(lineStart, wordEnd) > maxWidth) {
      let cut = lineStart;
      for (const ch of text.slice(lineStart, wordEnd)) {
        const next = cut + ch.length;
        if (next > lineStart && cut > lineStart && width(lineStart, next) > maxWidth) break;
        cut = next;
      }
      if (cut >= wordEnd) break;
      // Only reached when the word is wider than the column even at 24 pt.
      // Break after "/", "…", "–", "—" or closing punctuation (the mark stays
      // at the end of the first line, e.g. "suppléments/" | "compléments",
      // "l’ensemble :" | "Mo", from a missing space after a no-break one) rather than cut
      // inside a word. A hyphen is never a break ("Jésus-Christ" stays whole).
      let soft = -1;
      for (let k = cut - 1; k > lineStart && soft < 0; k--) {
        if ("/…–—:;,.?!»)]".includes(text[k])) soft = k;
      }
      if (soft > lineStart) cut = soft + 1;
      out.push([lineStart, cut]);
      lineStart = cut;
    }
  }
  out.push([lineStart, text.length]);
  return out;
}

/**
 * Shared PNG/PPTX page layout (UI UX ruling):
 * 1. A page never breaks inside a line.
 * 2. Scripture stays on one page with its citation; if it cannot fit on an
 *    empty page, it splits between lines and the citation stays with the
 *    last line.
 * 3. A heading (Title/H1/H2) is never left at the bottom of a page: it moves
 *    to the next page unless the following block's first two lines fit
 *    under it (keep-with-next).
 * 4. Each Scripture block starts a new page (never after earlier text);
 *    headings directly before it move with it.
 * Sizes: body ≥ 24 pt via pngTypeScale(); renderers must draw each line with
 * its `size` / `lineHeight` from here, never their own constants.
 */

function parseLineSpacing(raw: string | number | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

/** Block or run line-spacing, else the document value (already clamped by the caller). */
function blockLineHeight(b: LayoutBlock, fallback: number): number {
  const fromRuns = (b.runs ?? []).map((r) => parseLineSpacing(r.lineSpacing)).find((n) => n != null);
  const n = fromRuns ?? parseLineSpacing(b.lineSpacing) ?? fallback;
  return n;
}

export function layoutPngPages(
  blocks: readonly LayoutBlock[],
  target: PageInput,
  lineHeight: number,
  margins?: CalibratedSnapshot["margins"],
  opts: LayoutOptions = {},
): PngPage[] {
  const f = pngFrame(target, margins);
  lineHeight = clamp(lineHeight, PAGE_LIMITS.lineSpacing);
  const avail = f.bottom - f.top;
  const pages: PngPage[] = [{ lines: [] }];
  let y = f.top;
  const page = () => pages[pages.length - 1];
  const newPage = () => {
    pages.push({ lines: [] });
    y = f.top;
  };
  /** Break first unless the page is empty or `h` still fits. */
  const ensure = (h: number) => {
    if (y > f.top && y + h > f.bottom) newPage();
  };

  const k = pngTypeScale(target);
  const minPx = MIN_BODY_PT * pxPerPt(target); // nothing on a page is smaller than 24 pt
  const citeSize = Math.max(CITATION_SIZE * k, minPx);
  const citeLh = Math.max(CITATION_LH * k, citeSize * (CITATION_LH / CITATION_SIZE));
  const measure = opts.measure ?? afmMeasurer;
  const cssPx = pxPerInch(target) / 96; // Edit's CSS px are 1/96 in
  const sectionGap = SECTION_GAP_CSS_PX * cssPx;

  /** Size, line breaks and box geometry of one block placed in [colX, colX + colW]. */
  const prepare = (b: LayoutBlock, colX: number, colW: number) => {
    const styled = !!b.look || !!b.column;
    const sp = b.look?.spacing ?? {};
    const borderW = b.look?.borderLeft ? BORDER_LEFT_CSS_PX * cssPx : 0;
    let padL = (sp.pl ?? 0) * cssPx + borderW;
    let padR = (sp.pr ?? 0) * cssPx;
    if (padL + padR > colW / 2 && padL + padR > 0) {
      const sc = colW / 2 / (padL + padR);
      padL *= sc;
      padR *= sc;
    }
    let pt = (sp.pt ?? 0) * cssPx;
    let pb = (sp.pb ?? 0) * cssPx;
    if (pt + pb > avail / 4 && pt + pb > 0) {
      const sc = avail / 4 / (pt + pb);
      pt *= sc;
      pb *= sc;
    }
    const mt = Math.min((sp.mt ?? 0) * cssPx, avail / 4);
    const width = colW - padL - padR;
    const base = roleSize(b.type);
    const r = {
      size: b.look?.sizePt !== undefined
        ? effectiveBlockSizePt({ size: b.look.sizePt }, null, MIN_BODY_PT) * pxPerPt(target)
        : Math.max(base.size * k, minPx),
      gap: sp.mb !== undefined
        ? Math.min(sp.mb * cssPx, avail / 4)
        : opts.paragraphSpacingPt === undefined
          ? base.gap * k
          : clamp(opts.paragraphSpacingPt, PAGE_LIMITS.paragraphSpacingPt) * pxPerPt(target),
    };
    const segs = blockSegments(b);
    // Fit: one line never taller than the content box.
    r.size = Math.max(minPx, Math.min(r.size, (avail - pt - pb) / lineHeight));
    const heading = HEADINGS.has(b.type);
    if (heading) {
      // UX heading rule: break only between words (Jésus-Christ stays whole);
      // a word wider than the column shrinks this heading only (min 24 pt).
      let widest = 0;
      for (const [a, z] of breakWords(b.text)) {
        widest = Math.max(widest, measureRange(b.text, a, z, r.size, segs, measure));
      }
      if (widest > width) r.size = Math.max(minPx, r.size * (width / widest) * 0.999);
    }
    const blockLh = blockLineHeight(b, lineHeight);
    const lh = r.size * blockLh;
    // Body breaks only between words; a lone word wider than the column
    // shrinks just its own line to fit. Headings split a word only if it is
    // still wider than the column at 24 pt.
    let ranges = wrapLineRanges(b.text, r.size, width, segs, opts.measure, heading);
    const lineW = ([a, z]: [number, number], size: number) =>
      measureRange(b.text, a, a + b.text.slice(a, z).trimEnd().length, size, segs, measure);
    let sizes = ranges.map((rg) => {
      const w = lineW(rg, r.size);
      return w > width ? Math.max(minPx, r.size * (width / w) * 0.999) : r.size;
    });
    if (ranges.some((rg, i) => lineW(rg, sizes[i]) > width + 0.5)) {
      // A lone word wider than the column even at 24 pt: split only that
      // line, at 24 pt (soft breaks after / … – — first). Re-wrapping the
      // whole block with splitting split every line mid-word at large sizes.
      const nr: Array<[number, number]> = [];
      const ns: number[] = [];
      ranges.forEach((rg, i) => {
        if (lineW(rg, sizes[i]) <= width + 0.5) {
          nr.push(rg);
          ns.push(sizes[i]);
          return;
        }
        const sub = rg[0];
        for (const [a, z] of wrapLineRanges(b.text.slice(sub, rg[1]), minPx, width,
          segs.map((g) => ({ ...g, start: g.start - sub, end: g.end - sub })), opts.measure, true)) {
          nr.push([a + sub, z + sub]);
          ns.push(minPx);
        }
      });
      ranges = nr;
      sizes = ns;
    }
    // Citation: shrink to fit the column (min 24 pt).
    let cSize = citeSize;
    let cLh = citeLh;
    if (b.citation) {
      const cw = measure(citationDisplay(b).text, cSize, { font: "serif" });
      if (cw > width) {
        const k2 = Math.max(minPx / cSize, (width / cw) * 0.999);
        cSize *= k2;
        cLh *= k2;
      }
    }
    const cite = b.citation ? cLh : 0;
    return {
      b, r, lh, ranges, sizes, cite, cSize, cLh, styled, x: colX + padL, w: width,
      boxX: colX, boxW: colW, borderW, pt, pb, mt,
      height: pt + ranges.length * lh + cite + pb,
    };
  };
  type Prepared = ReturnType<typeof prepare>;

  const prepared: Prepared[] = new Array(blocks.length);
  const sideBySide = new Set<number>();
  const groups = new Map<number, number[]>();
  function sectionHeight(idx: number[]): number {
    const cols = new Map<number, number>();
    for (const bi of idx) {
      const p = prepared[bi];
      const ci = blocks[bi].column!.index;
      const prev = cols.get(ci);
      cols.set(ci, prev === undefined ? p.height : prev + p.mt + p.height);
      const last = idx.filter((x) => blocks[x].column!.index === ci).at(-1);
      if (bi !== last) cols.set(ci, cols.get(ci)! + p.r.gap);
    }
    return Math.max(0, ...cols.values());
  }
  for (let i = 0; i < blocks.length; i++) {
    const c = blocks[i].column;
    if (!c) {
      prepared[i] = prepare(blocks[i], f.left, f.contentWidth);
      continue;
    }
    let j = i;
    while (j < blocks.length && blocks[j].column?.section === c.section) j++;
    const idx = Array.from({ length: j - i }, (_, n) => i + n);
    const n = c.count;
    const colW = (f.contentWidth - sectionGap * (n - 1)) / n;
    let ok = n > 1 && colW >= minPx * 8;
    if (ok) {
      for (const bi of idx) {
        const ci = blocks[bi].column!.index;
        prepared[bi] = prepare(blocks[bi], f.left + ci * (colW + sectionGap), colW);
      }
      ok = sectionHeight(idx) <= avail;
    }
    if (ok) {
      idx.forEach((bi) => sideBySide.add(bi));
      groups.set(i, idx);
    } else {
      for (const bi of idx) prepared[bi] = prepare(blocks[bi], f.left, f.contentWidth);
    }
    i = j - 1;
  }

  /**
   * Keep-with-next needs: a heading, the headings after it, and the first
   * two lines of the block that follows (one, if two never fit on a page)
   * on one page. Real headings are long and wrap; at large sizes they plus
   * two lines (or even alone) can be taller than the page, which left them
   * at the page bottom or split across pages. Shrink such a heading (floor
   * 24 pt) until the group fits; last block first so chains see final sizes.
   */
  const oneLine = new Set<number>(); // blocks whose headings + 2 lines never fit
  const followLines = (i: number): number => {
    const n = prepared[i];
    if (!n) return 0;
    if (sideBySide.has(i)) return n.lh;
    if (oneLine.has(i)) return n.pt + n.lh;
    const two = n.pt + Math.min(2, n.ranges.length) * n.lh + n.pb;
    return two <= avail ? two : n.pt + n.lh + n.pb;
  };
  /** One 5% step down (floor 24 pt) for heading `p`; false at the floor. */
  const shrinkHeading = (p: Prepared): boolean => {
    if (p.r.size <= minPx) return false;
    const segs = blockSegments(p.b);
    p.r.size = Math.max(minPx, p.r.size * 0.95);
    p.lh = p.r.size * lineHeight;
    // Same rule as above: words stay whole unless one is wider than the
    // column even at 24 pt (the heading already fits its widest word).
    p.ranges = wrapLineRanges(p.b.text, p.r.size, p.w, segs, opts.measure, true);
    p.sizes = p.ranges.map(([a, z]) => {
      const w = measureRange(p.b.text, a, a + p.b.text.slice(a, z).trimEnd().length, p.r.size, segs, measure);
      return w > p.w ? Math.max(minPx, p.r.size * (p.w / w) * 0.999) : p.r.size;
    });
    p.height = p.pt + p.ranges.length * p.lh + p.cite + p.pb;
    return true;
  };
  for (let i = prepared.length - 1; i >= 0; i--) {
    if (sideBySide.has(i)) continue;
    const p = prepared[i];
    if (!HEADINGS.has(p.b.type)) continue;
    let j = i + 1;
    while (j < prepared.length && HEADINGS.has(prepared[j].b.type) && !sideBySide.has(j)) j++;
    const rest = () => {
      let r = followLines(j);
      for (let k = i + 1; k < j; k++) r += prepared[k].height + prepared[k].r.gap;
      return r;
    };
    const fits = () => p.pt + p.ranges.length * p.lh + p.pb + p.r.gap + rest() <= avail;
    // This heading first, then the headings chained under it.
    while (!fits() && shrinkHeading(p));
    for (let k = i + 1; k < j && !fits(); k++) while (!fits() && shrinkHeading(prepared[k]));
    // Still too tall at the floor (huge type on small pages): keep one line
    // with the headings, then tighten the spaces under them rather than
    // strand them.
    if (!fits()) oneLine.add(j);
    for (let k = j - 1; k >= i && !fits(); k--) {
      const over = p.pt + p.ranges.length * p.lh + p.pb + p.r.gap + rest() - avail;
      prepared[k].r.gap = Math.max(0, prepared[k].r.gap - over);
    }
  }

  const startsScripturePage = prepared.map((p, i) => {
    if (sideBySide.has(i)) return false; // sections are placed whole
    if (i > 0 && HEADINGS.has(prepared[i - 1].b.type)) return false; // chain started earlier
    let j = i;
    while (j < prepared.length && HEADINGS.has(prepared[j].b.type) && !sideBySide.has(j)) j++;
    return !sideBySide.has(j) && prepared[j]?.b.type === "Scripture";
  });

  /** Height that must follow a heading on the same page. */
  const leadOf = (i: number): number => {
    const n = prepared[i];
    if (!n) return 0;
    if (sideBySide.has(i)) return groups.has(i) ? sectionHeight(groups.get(i)!) : n.lh;
    if (HEADINGS.has(n.b.type)) return n.pt + n.ranges.length * n.lh + n.pb + n.r.gap + leadOf(i + 1);
    // Keep-with-next: the first two lines of what follows (or all, if shorter;
    // one if two lines never fit on a page). Scripture is placed whole when
    // it fits under its headings, else it flows from right under them.
    return followLines(i);
  };

  /**
   * Keep-with-next fallback: the page just broke before block `bi`'s first
   * line; move heading lines left at the bottom of the previous page onto the
   * new one, when they fit there with that line.
   */
  const carryHeadings = (bi: number) => {
    const prev = pages[pages.length - 2];
    let n = 0;
    while (n < prev.lines.length && HEADINGS.has(prepared[prev.lines[prev.lines.length - 1 - n].blockIndex].b.type)) n++;
    if (n === 0 || n === prev.lines.length) return;
    const moved = prev.lines.splice(prev.lines.length - n, n);
    const shift = moved[0].y - f.top;
    let end = 0;
    for (const l of moved) {
      l.y -= shift;
      end = l.y + l.lineHeight;
    }
    const last = prepared[moved[n - 1].blockIndex];
    const gap = last.r.gap + last.pb;
    if (end + gap + prepared[bi].pt + prepared[bi].lh > f.bottom) {
      prev.lines.push(...moved.map((l) => ({ ...l, y: l.y + shift })));
      return;
    }
    page().lines.unshift(...moved);
    y = end + gap;
  };

  const lineOf = (p: Prepared, bi: number, kind: PngPageLine["kind"], li: number, start: number, end: number, at: number, size: number, lh: number): PngPageLine => ({
    blockIndex: bi, kind, lineIndex: li, start, end, y: at, size, lineHeight: lh,
    ...(p.styled ? { x: p.x, width: p.w } : {}),
  });
  const sectionBoxes: Array<{ page: number; box: PngBox }> = [];

  for (let bi = 0; bi < prepared.length; bi++) {
    const p = prepared[bi];

    if (groups.has(bi)) {
      // Side-by-side section: placed whole on one page.
      const idx = groups.get(bi)!;
      const sl = blocks[bi].column!.sectionLook;
      const smt = Math.min((sl?.spacing.mt ?? 0) * cssPx, avail / 4);
      const smb = Math.min((sl?.spacing.mb ?? 0) * cssPx, avail / 4);
      const h = sectionHeight(idx);
      if (y > f.top) y += smt;
      ensure(h);
      const top = y;
      const cy = new Map<number, number>();
      for (const i of idx) {
        const q = prepared[i];
        const ci = blocks[i].column!.index;
        let at = cy.has(ci) ? cy.get(ci)! + q.mt : top;
        at += q.pt;
        const emitCite = () => {
          if (!q.b.citation) return;
          page().lines.push(lineOf(q, i, "citation", q.ranges.length, 0, q.b.citation.length, at, q.cSize, q.cLh));
          at += q.cLh;
        };
        if (q.b.verseBar) emitCite();
        q.ranges.forEach(([s, e], li) => {
          page().lines.push(lineOf(q, i, "text", li, s, e, at, q.sizes[li], q.lh));
          at += q.lh;
        });
        if (!q.b.verseBar) emitCite();
        cy.set(ci, at + q.pb + q.r.gap);
      }
      if (sl?.background || sl?.borderLeft) {
        sectionBoxes.push({
          page: pages.length - 1,
          box: { x: f.left, y: top, w: f.contentWidth, h, fill: sl.background, border: sl.borderLeft ?? undefined, borderWidth: sl.borderLeft ? BORDER_LEFT_CSS_PX * cssPx : 0 },
        });
      }
      y = top + h + smb;
      bi = idx[idx.length - 1];
      continue;
    }

    const push = (kind: PngPageLine["kind"], li: number, start: number, end: number, size: number, lh: number) => {
      page().lines.push(lineOf(p, bi, kind, li, start, end, y, size, lh));
      y += lh;
    };
    const textH = p.pt + p.ranges.length * p.lh + p.pb;

    // Rule 4: Scripture (with the headings directly before it) starts a page.
    if (startsScripturePage[bi] && y > f.top) newPage();
    if (p.mt && y > f.top) y += p.mt;

    if (HEADINGS.has(p.b.type)) {
      // Rule 3: the heading moves with the start of what follows (bounded by a page).
      ensure(Math.min(textH + p.r.gap + leadOf(bi + 1), avail));
    } else if (p.b.type === "Scripture" && p.height <= avail) {
      // Rule 2: whole block + citation together, unless the headings it
      // follows already start this page and the whole block cannot join them:
      // then it flows under them (keep-with-next wins over keeping it whole).
      const underHeadings = bi > 0 && HEADINGS.has(prepared[bi - 1].b.type) && page().lines.length > 0
        && page().lines.every((l) => HEADINGS.has(prepared[l.blockIndex].b.type));
      if (!underHeadings) ensure(p.height);
    }

    if (p.b.verseBar && p.b.citation) {
      const before = pages.length;
      ensure(p.pt + p.cite + (p.ranges.length ? p.lh : 0) + (p.ranges.length <= 1 ? p.pb : 0));
      if (pages.length > before && !HEADINGS.has(p.b.type)) carryHeadings(bi);
      y += p.pt;
      push("citation", p.ranges.length, 0, p.b.citation.length, p.cSize, p.cLh);
    }
    p.ranges.forEach(([s, e], li) => {
      const last = li === p.ranges.length - 1;
      const first = li === 0;
      // Rule 2 (oversized Scripture): last line keeps its citation.
      const before = pages.length;
      const firstPad = first && !p.b.verseBar ? p.pt : 0;
      ensure(firstPad + (last && p.cite && !p.b.verseBar ? p.lh + p.cite : p.lh) + (last ? p.pb : 0));
      if (first && pages.length > before && !HEADINGS.has(p.b.type)) carryHeadings(bi);
      if (first && !p.b.verseBar) y += p.pt;
      push("text", li, s, e, p.sizes[li], p.lh);
    });
    if (p.b.citation && !p.b.verseBar) {
      ensure(p.cite + p.pb);
      push("citation", p.ranges.length, 0, p.b.citation.length, p.cSize, p.cLh);
    }
    y += p.pb + p.r.gap;
  }

  // Boxes (fill / left rule) behind styled blocks, per page, from the placed
  // lines (so keep-with-next moves are respected). Never past the frame.
  pages.forEach((pg, pi) => {
    const boxes: PngBox[] = sectionBoxes.filter((s) => s.page === pi).map((s) => s.box);
    const spans = new Map<number, { y0: number; y1: number; first: boolean; last: boolean }>();
    for (const l of pg.lines) {
      const q = prepared[l.blockIndex];
      if (!q.b.look?.background && !q.b.look?.borderLeft) continue;
      const isFirst = q.b.verseBar
        ? (q.b.citation ? l.kind === "citation" : l.kind === "text" && l.lineIndex === 0)
        : l.kind === "text" && l.lineIndex === 0;
      const isLast = q.b.verseBar
        ? (l.kind === "text" && l.lineIndex === q.ranges.length - 1) || (!q.ranges.length && l.kind === "citation")
        : l.kind === "citation" || (!q.b.citation && l.lineIndex === q.ranges.length - 1);
      const sp = spans.get(l.blockIndex) ?? { y0: l.y, y1: l.y + l.lineHeight, first: false, last: false };
      sp.y0 = Math.min(sp.y0, l.y);
      sp.y1 = Math.max(sp.y1, l.y + l.lineHeight);
      sp.first ||= isFirst;
      sp.last ||= isLast;
      spans.set(l.blockIndex, sp);
    }
    for (const [i, sp] of spans) {
      const q = prepared[i];
      const y0 = Math.max(0, sp.y0 - (sp.first ? q.pt : 0));
      const y1 = Math.min(f.height, sp.y1 + (sp.last ? q.pb : 0));
      boxes.push({
        x: q.boxX, y: y0, w: q.boxW, h: y1 - y0,
        fill: q.b.look!.background, border: q.b.look!.borderLeft ?? undefined, borderWidth: q.borderW,
      });
    }
    if (boxes.length) pg.boxes = boxes;
  });
  return pages;
}

/** Page count for blocks (Backend / label). */
export function pngPageCount(
  blocks: readonly LayoutBlock[],
  target: PageInput,
  lineHeight: number,
  margins?: CalibratedSnapshot["margins"],
  opts: LayoutOptions = {},
): number {
  return layoutPngPages(blocks, target, lineHeight, margins, opts).length;
}

/** StyledBlocks → LayoutBlocks (plain text per block). */
export function toLayoutBlocks(blocks: readonly StyledBlock[]): LayoutBlock[] {
  return blocks.map((b) => ({
    type: b.type,
    citation: b.citation,
    ...(b.verseBar ? { verseBar: true } : {}),
    text: b.runs.map((r) => r.text).join(""),
    runs: b.runs.map((r) => ({
      text: r.text,
      fontFamily: r.fontFamily,
      bold: r.bold,
      italic: r.italic,
      letterSpacing: r.letterSpacing,
      lineSpacing: r.lineSpacing,
    })),
    letterSpacing: b.letterSpacing,
    lineSpacing: b.lineSpacing,
    ...(b.look ? { look: b.look } : {}),
    ...(b.column ? { column: b.column } : {}),
  }));
}

/** Page count for a calibrated snapshot (drives the Export label). */
export function countPngPages(snapshot: CalibratedSnapshot, opts: LayoutOptions = {}): number {
  return layoutSnapshot(snapshot, opts).pages.length;
}

/** Everything a renderer (PNG, PPTX, PDF, Preach page view) needs for a snapshot. */
export interface SnapshotLayout {
  target: PageSpec;
  frame: PngFrame;
  styled: StyledBlock[];
  blocks: LayoutBlock[];
  pages: PngPage[];
}

/** Lay out a calibrated snapshot exactly as every export does. */
export function layoutSnapshot(snapshot: CalibratedSnapshot, opts: LayoutOptions = {}): SnapshotLayout {
  const target = pageSpecFromSnapshot(snapshot);
  // Preach role fonts: sermon text defaults to sans, Scripture to Literata.
  // A stored font mark (fontExplicit) is kept. Exports use the same mapping.
  let styled = styledBlocksFromSnapshot(snapshot).map((b) => ({
    ...b,
    runs: b.runs.map((r) =>
      r.fontExplicit ? r : { ...r, fontFamily: b.type === "Scripture" ? "literata" as const : "sans" as const },
    ),
  }));
  if (!styled.length) {
    styled = [{ type: "Title", align: "left", runs: [{ text: titleTextFromSnapshot(snapshot), fontFamily: "sans" }] }];
  }
  const blocks = toLayoutBlocks(styled);
  const pages = layoutPngPages(blocks, target, snapshotLineSpacing(snapshot), snapshot.margins, {
    paragraphSpacingPt: snapshot.paragraphSpacingPt,
    ...opts,
  });
  return { target, frame: pngFrame(target, snapshot.margins), styled, blocks, pages };
}

/** Export button label for PNG: single image vs a zip of pages. */
export function pngExportLabel(pages: number): string {
  return pages > 1 ? `Images (${pages} pages, .zip)` : "Image (.png)";
}

/**
 * The page a snapshot asks for: its legacy `target` plus the optional
 * per-sermon `format` / `orientation` / `textSizePt` overrides.
 */
export function pageSpecFromSnapshot(
  snapshot: Pick<CalibratedSnapshot, "target"> & Partial<Pick<CalibratedSnapshot, "pageFormat" | "orientation" | "textSizePt" | "customPage" | "pageSpec">>,
): PageSpec {
  if (snapshot.pageSpec?.kind === "fit") {
    // Fit-to-screen wins: the device's measured CSS px, as custom px at 96 dpi.
    return resolvePage({ ...snapshot.pageSpec, orientation: snapshot.pageSpec.orientation ?? snapshot.orientation, textSizePt: snapshot.textSizePt });
  }
  const base = resolvePage(String(snapshot.target));
  return resolvePage({
    format: snapshot.pageFormat ?? base.format,
    orientation: snapshot.orientation ?? base.orientation,
    textSizePt: snapshot.textSizePt ?? base.textSizePt,
    ...(snapshot.customPage ? { custom: snapshot.customPage } : {}),
  });
}
