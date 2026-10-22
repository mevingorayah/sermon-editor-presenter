import { snapshotLineSpacing } from "./frames";
import type { CalibratedSnapshot } from "@/types/document";
import { styledBlocksFromSnapshot, titleTextFromSnapshot, type StyledBlock } from "./contentWalk";
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
  /**
   * Optional style runs whose texts concatenate to `text`; they set the font
   * family / bold / italic used to measure each character. Without runs the
   * whole block is measured in the role's default style (sans).
   */
  runs?: ReadonlyArray<{ text: string; fontFamily?: FontFamilyId; bold?: boolean; italic?: boolean }>;
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
}

export interface PngPage {
  lines: PngPageLine[];
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
  const role = roleStyle(b.type);
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
  const prepared = blocks.map((b) => {
    const base = roleSize(b.type);
    const r = {
      size: Math.max(base.size * k, minPx),
      gap: opts.paragraphSpacingPt === undefined
        ? base.gap * k
        : clamp(opts.paragraphSpacingPt, PAGE_LIMITS.paragraphSpacingPt) * pxPerPt(target),
    };
    const segs = blockSegments(b);
    const measure = opts.measure ?? afmMeasurer;
    // Fit: one line never taller than the content box.
    r.size = Math.max(minPx, Math.min(r.size, avail / lineHeight));
    const heading = HEADINGS.has(b.type);
    if (heading) {
      // UX heading rule: break only between words (Jésus-Christ stays whole);
      // a word wider than the column shrinks this heading only (min 24 pt).
      let widest = 0;
      for (const [a, z] of breakWords(b.text)) {
        widest = Math.max(widest, measureRange(b.text, a, z, r.size, segs, measure));
      }
      if (widest > f.contentWidth) r.size = Math.max(minPx, r.size * (f.contentWidth / widest) * 0.999);
    }
    const lh = r.size * lineHeight;
    // Body breaks only between words; a lone word wider than the column
    // shrinks just its own line to fit. Headings split a word only if it is
    // still wider than the column at 24 pt.
    let ranges = wrapLineRanges(b.text, r.size, f.contentWidth, segs, opts.measure, heading);
    const lineW = ([a, z]: [number, number], size: number) =>
      measureRange(b.text, a, a + b.text.slice(a, z).trimEnd().length, size, segs, measure);
    let sizes = ranges.map((rg) => {
      const w = lineW(rg, r.size);
      return w > f.contentWidth ? Math.max(minPx, r.size * (f.contentWidth / w) * 0.999) : r.size;
    });
    if (ranges.some((rg, i) => lineW(rg, sizes[i]) > f.contentWidth + 0.5)) {
      // A lone word wider than the column even at 24 pt: split only that
      // line, at 24 pt (soft breaks after / … – — first). Re-wrapping the
      // whole block with splitting split every line mid-word at large sizes.
      const nr: Array<[number, number]> = [];
      const ns: number[] = [];
      ranges.forEach((rg, i) => {
        if (lineW(rg, sizes[i]) <= f.contentWidth + 0.5) {
          nr.push(rg);
          ns.push(sizes[i]);
          return;
        }
        const sub = rg[0];
        for (const [a, z] of wrapLineRanges(b.text.slice(sub, rg[1]), minPx, f.contentWidth,
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
      const cw = measure(b.citation.toLocaleUpperCase("fr"), cSize, { font: "serif" });
      if (cw > f.contentWidth) {
        const k2 = Math.max(minPx / cSize, (f.contentWidth / cw) * 0.999);
        cSize *= k2;
        cLh *= k2;
      }
    }
    const cite = b.citation ? cLh : 0;
    return { b, r, lh, ranges, sizes, cite, cSize, cLh, height: ranges.length * lh + cite };
  });

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
    if (oneLine.has(i)) return n.lh;
    const two = Math.min(2, n.ranges.length) * n.lh;
    return two <= avail ? two : n.lh;
  };
  const measure = opts.measure ?? afmMeasurer;
  /** One 5% step down (floor 24 pt) for heading `p`; false at the floor. */
  const shrinkHeading = (p: (typeof prepared)[number]): boolean => {
    if (p.r.size <= minPx) return false;
    const segs = blockSegments(p.b);
    p.r.size = Math.max(minPx, p.r.size * 0.95);
    p.lh = p.r.size * lineHeight;
    // Same rule as above: words stay whole unless one is wider than the
    // column even at 24 pt (the heading already fits its widest word).
    p.ranges = wrapLineRanges(p.b.text, p.r.size, f.contentWidth, segs, opts.measure, true);
    p.sizes = p.ranges.map(([a, z]) => {
      const w = measureRange(p.b.text, a, a + p.b.text.slice(a, z).trimEnd().length, p.r.size, segs, measure);
      return w > f.contentWidth ? Math.max(minPx, p.r.size * (f.contentWidth / w) * 0.999) : p.r.size;
    });
    p.height = p.ranges.length * p.lh;
    return true;
  };
  for (let i = prepared.length - 1; i >= 0; i--) {
    const p = prepared[i];
    if (!HEADINGS.has(p.b.type)) continue;
    let j = i + 1;
    while (j < prepared.length && HEADINGS.has(prepared[j].b.type)) j++;
    const rest = () => {
      let r = followLines(j);
      for (let k = i + 1; k < j; k++) r += prepared[k].height + prepared[k].r.gap;
      return r;
    };
    const fits = () => p.ranges.length * p.lh + p.r.gap + rest() <= avail;
    // This heading first, then the headings chained under it.
    while (!fits() && shrinkHeading(p));
    for (let k = i + 1; k < j && !fits(); k++) while (!fits() && shrinkHeading(prepared[k]));
    // Still too tall at the floor (huge type on small pages): keep one line
    // with the headings, then tighten the spaces under them rather than
    // strand them.
    if (!fits()) oneLine.add(j);
    for (let k = j - 1; k >= i && !fits(); k--) {
      const over = p.ranges.length * p.lh + p.r.gap + rest() - avail;
      prepared[k].r.gap = Math.max(0, prepared[k].r.gap - over);
    }
  }

  const startsScripturePage = prepared.map((p, i) => {
    if (i > 0 && HEADINGS.has(prepared[i - 1].b.type)) return false; // chain started earlier
    let j = i;
    while (j < prepared.length && HEADINGS.has(prepared[j].b.type)) j++;
    return prepared[j]?.b.type === "Scripture";
  });

  /** Height that must follow a heading on the same page. */
  const leadOf = (i: number): number => {
    const n = prepared[i];
    if (!n) return 0;
    if (HEADINGS.has(n.b.type)) return n.ranges.length * n.lh + n.r.gap + leadOf(i + 1);
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
    const gap = prepared[moved[n - 1].blockIndex].r.gap;
    if (end + gap + prepared[bi].lh > f.bottom) {
      prev.lines.push(...moved.map((l) => ({ ...l, y: l.y + shift })));
      return;
    }
    page().lines.unshift(...moved);
    y = end + gap;
  };

  prepared.forEach((p, bi) => {
    const push = (kind: PngPageLine["kind"], li: number, start: number, end: number, size: number, lh: number) => {
      page().lines.push({ blockIndex: bi, kind, lineIndex: li, start, end, y, size, lineHeight: lh });
      y += lh;
    };
    const textH = p.ranges.length * p.lh;

    // Rule 4: Scripture (with the headings directly before it) starts a page.
    if (startsScripturePage[bi] && y > f.top) newPage();

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

    p.ranges.forEach(([s, e], li) => {
      const last = li === p.ranges.length - 1;
      // Rule 2 (oversized Scripture): last line keeps its citation.
      const before = pages.length;
      ensure(last && p.cite ? p.lh + p.cite : p.lh);
      if (li === 0 && pages.length > before && !HEADINGS.has(p.b.type)) carryHeadings(bi);
      push("text", li, s, e, p.sizes[li], p.lh);
    });
    if (p.b.citation) {
      ensure(p.cite);
      push("citation", p.ranges.length, 0, p.b.citation.length, p.cSize, p.cLh);
    }
    y += p.r.gap;
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
    text: b.runs.map((r) => r.text).join(""),
    runs: b.runs.map((r) => ({ text: r.text, fontFamily: r.fontFamily, bold: r.bold, italic: r.italic })),
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
  // Body text is serif (as in Edit) unless the writer picked a font.
  let styled = styledBlocksFromSnapshot(snapshot).map((b) => ({
    ...b,
    runs: b.runs.map((r) => (r.fontExplicit ? r : { ...r, fontFamily: "serif" as const })),
  }));
  if (!styled.length) {
    styled = [{ type: "Title", align: "left", runs: [{ text: titleTextFromSnapshot(snapshot), fontFamily: "serif" }] }];
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
