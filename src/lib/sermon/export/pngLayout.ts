import type { CalibratedSnapshot } from "@/types/document";
import { styledBlocksFromSnapshot, titleTextFromSnapshot, type StyledBlock } from "./contentWalk";
import { resolveMargins } from "./margins";

/**
 * Pure (client-safe, no sharp) PNG page count. Mirrors the frame sizes,
 * margins, line wrapping and paging of `buildPngPages` in png.ts (#21), so
 * the Export button can say "Images (N pages, .zip)" before the request.
 * Keep in sync with png.ts; pngLayout.test.ts pins the numbers.
 */

const CHAR_EM = 0.53;

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

function roleSize(type: StyledBlock["type"]): { size: number; gap: number } {
  switch (type) {
    case "Title": return { size: 42, gap: 28 };
    case "H1": return { size: 30, gap: 18 };
    case "H2": return { size: 24, gap: 14 };
    case "Caption": return { size: 16, gap: 12 };
    default: return { size: 20, gap: 12 };
  }
}

/** Number of lines `layoutLines` in png.ts produces for this text. */
function lineCount(text: string, size: number, maxWidth: number): number {
  const tokens = text.match(/\S+\s*|\s+/g) ?? [];
  let lines = 0;
  let open = false;
  let w = 0;
  for (const tok of tokens) {
    const tw = tok.trimEnd().length * size * CHAR_EM;
    if (open && w + tw > maxWidth) {
      lines++;
      w = 0;
    }
    open = true;
    w += tok.length * size * CHAR_EM;
  }
  return Math.max(1, lines + (open ? 1 : 0));
}

export function countPngPages(snapshot: CalibratedSnapshot): number {
  const target = String(snapshot.target);
  const { width, height } = pngFrameSize(target);
  const margins = resolveMargins(snapshot.margins, target);
  const scale = width / 13.3;
  const mx = Math.max(24, Math.round(margins.left * scale));
  const my = Math.max(24, Math.round(margins.top * scale));
  const binder = Math.round(margins.binderGutter * scale);
  const contentWidth = width - mx * 2 - binder;
  const bottom = height - my;
  const top = my + 8;

  let pages = 1;
  let y = top;
  const line = (lh: number) => {
    if (y + lh > bottom && y > top) {
      pages++;
      y = top;
    }
    y += lh;
  };

  const blocks = styledBlocksFromSnapshot(snapshot);
  const all: Array<Pick<StyledBlock, "type" | "citation"> & { text: string }> = blocks.length
    ? blocks.map((b) => ({ type: b.type, citation: b.citation, text: b.runs.map((r) => r.text).join("") }))
    : [{ type: "Title", text: titleTextFromSnapshot(snapshot) }];
  for (const b of all) {
    const r = roleSize(b.type);
    const lh = r.size * snapshot.lineHeight;
    const n = lineCount(b.text, r.size, contentWidth);
    for (let i = 0; i < n; i++) line(lh);
    if (b.citation) line(26);
    y += r.gap;
  }
  return pages;
}

/** Export button label for PNG: single image vs a zip of pages. */
export function pngExportLabel(pages: number): string {
  return pages > 1 ? `Images (${pages} pages, .zip)` : "Image (.png)";
}
