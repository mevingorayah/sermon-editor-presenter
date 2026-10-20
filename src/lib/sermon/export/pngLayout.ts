import type { CalibratedSnapshot } from "@/types/document";
import { styledBlocksFromSnapshot, titleTextFromSnapshot, type StyledBlock } from "./contentWalk";
import { resolveMargins } from "./margins";

/**
 * Shared, pure (client-safe, no sharp) page layout for PNG (and later PPTX)
 * export. UI UX ruling: these pages are the source of truth, not the PDF's
 * breaks. Backend's buildPngPages renders `layoutPngPages()`; the Export
 * button uses `countPngPages()` to say "Images (N pages, .zip)".
 */

/** Average glyph advance in ems used for wrapping; renderers must use this, not a copy. */
export const CHAR_EM = 0.53;

export function pngFrameSize(target: string): { width: number; height: number } {
  switch (target) {
    case "screen-16-10": return { width: 1600, height: 1000 };
    case "tablet-portrait": return { width: 900, height: 1200 };
    case "paper-letter": return { width: 1275, height: 1650 };
    case "paper-a4": return { width: 1240, height: 1754 };
    case "paper-half-letter": return { width: 825, height: 1275 };
    case "screen-16-9":
    default: return { width: 1920, height: 1080 };
  }
}

/**
 * Frame width in inches (slide/paper geometry) used for pt → px:
 * 16:9 PPTX slide 13.333in (1920px → 1pt = 1920 / (13.333 × 72) = 2.00px),
 * 16:10 slide 10in, tablet 8in, Letter 8.5in, A4 8.27in, half-Letter 5.5in.
 */
export function pngFrameWidthInches(target: string): number {
  switch (target) {
    case "screen-16-10": return 10;
    case "tablet-portrait": return 8;
    case "paper-letter": return 8.5;
    case "paper-a4": return 8.27;
    case "paper-half-letter": return 5.5;
    case "screen-16-9":
    default: return 13.333;
  }
}

/** Frame px per typographic point (1/72 in). */
export function pxPerPt(target: string): number {
  return pngFrameSize(target).width / (pngFrameWidthInches(target) * 72);
}

/** UI UX: PNG/PPTX body text is at least 24 pt. */
export const MIN_BODY_PT = 24;
const BASE_BODY_PX = 20;

/**
 * Scale applied to every size, gap and line box so body text is ≥ 24 pt
 * (16:9: 24pt × 2px = 48px → ×2.4). Never shrinks.
 */
export function pngTypeScale(target: string): number {
  return Math.max(1, (MIN_BODY_PT * pxPerPt(target)) / BASE_BODY_PX);
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
export function pngFrame(target: string, margins?: CalibratedSnapshot["margins"]): PngFrame {
  const { width, height } = pngFrameSize(target);
  const m = margins ? resolveMargins(margins, target) : { left: 0, top: 0, binderGutter: 0 };
  const scale = width / 13.3;
  const mx = Math.max(24, Math.round(m.left * scale));
  const my = Math.max(24, Math.round(m.top * scale));
  const binder = Math.round(m.binderGutter * scale);
  return { width, height, left: mx + binder, contentWidth: width - mx * 2 - binder, top: my + 8, bottom: height - my };
}

/** Wrap text into [start, end) line ranges by estimated width (as png.ts). */
export function wrapLineRanges(text: string, size: number, maxWidth: number): Array<[number, number]> {
  const re = /\S+\s*|\s+/g;
  const out: Array<[number, number]> = [];
  let lineStart = 0;
  let open = false;
  let w = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tok = m[0];
    const tw = tok.trimEnd().length * size * CHAR_EM;
    if (open && w + tw > maxWidth) {
      out.push([lineStart, m.index]);
      lineStart = m.index;
      w = 0;
    }
    open = true;
    w += tok.length * size * CHAR_EM;
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
 *    to the next page with the start of the following block.
 * 4. Each Scripture block starts a new page (never after earlier text);
 *    headings directly before it move with it.
 * Sizes: body ≥ 24 pt via pngTypeScale(); renderers must draw each line with
 * its `size` / `lineHeight` from here, never their own constants.
 */
export function layoutPngPages(
  blocks: readonly LayoutBlock[],
  target: string,
  lineHeight: number,
  margins?: CalibratedSnapshot["margins"],
): PngPage[] {
  const f = pngFrame(target, margins);
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
  const citeSize = CITATION_SIZE * k;
  const citeLh = CITATION_LH * k;
  const prepared = blocks.map((b) => {
    const base = roleSize(b.type);
    const r = { size: base.size * k, gap: base.gap * k };
    const lh = r.size * lineHeight;
    const ranges = wrapLineRanges(b.text, r.size, f.contentWidth);
    const cite = b.citation ? citeLh : 0;
    return { b, r, lh, ranges, cite, height: ranges.length * lh + cite };
  });

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
    if (n.b.type === "Scripture" && n.height <= avail) return n.height;
    if (HEADINGS.has(n.b.type)) return n.ranges.length * n.lh + n.r.gap + leadOf(i + 1);
    return n.lh;
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
      ensure(p.height); // Rule 2: whole block + citation together.
    }

    p.ranges.forEach(([s, e], li) => {
      const last = li === p.ranges.length - 1;
      // Rule 2 (oversized Scripture): last line keeps its citation.
      ensure(last && p.cite ? p.lh + p.cite : p.lh);
      push("text", li, s, e, p.r.size, p.lh);
    });
    if (p.b.citation) {
      ensure(p.cite);
      push("citation", p.ranges.length, 0, p.b.citation.length, citeSize, citeLh);
    }
    y += p.r.gap;
  });
  return pages;
}

/** Page count for blocks (Backend / label). */
export function pngPageCount(
  blocks: readonly LayoutBlock[],
  target: string,
  lineHeight: number,
  margins?: CalibratedSnapshot["margins"],
): number {
  return layoutPngPages(blocks, target, lineHeight, margins).length;
}

/** StyledBlocks → LayoutBlocks (plain text per block). */
export function toLayoutBlocks(blocks: readonly StyledBlock[]): LayoutBlock[] {
  return blocks.map((b) => ({ type: b.type, citation: b.citation, text: b.runs.map((r) => r.text).join("") }));
}

/** Page count for a calibrated snapshot (drives the Export label). */
export function countPngPages(snapshot: CalibratedSnapshot): number {
  const styled = styledBlocksFromSnapshot(snapshot);
  const blocks: LayoutBlock[] = styled.length
    ? toLayoutBlocks(styled)
    : [{ type: "Title", text: titleTextFromSnapshot(snapshot) }];
  return pngPageCount(blocks, String(snapshot.target), snapshot.lineHeight, snapshot.margins);
}

/** Export button label for PNG: single image vs a zip of pages. */
export function pngExportLabel(pages: number): string {
  return pages > 1 ? `Images (${pages} pages, .zip)` : "Image (.png)";
}
