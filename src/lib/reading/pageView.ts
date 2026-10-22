import type { JSONContent } from "@tiptap/react";
import type { PresentationSettings } from "@/types/document";
import { sliceRuns } from "@/lib/sermon/export/pages";
import { layoutSnapshot, roleStyle } from "@/lib/sermon/export/pngLayout";
import { snapshotFor } from "@/lib/reading/pageSettings";
import { citationCaps, type StyledBlock, type StyledRun } from "@/lib/sermon/export/contentWalk";
import type { PngFrame } from "@/lib/sermon/export/pngLayout";

/**
 * Preach page view: the export pages (pngLayout.ts via exportPages), not a
 * copy of their rules. Every placed line becomes one positioned line here, so
 * line and page breaks are the exports' by construction.
 */
export interface PageViewLine {
  key: string;
  kind: "text" | "citation";
  blockType: StyledBlock["type"];
  blockIndex: number;
  lineIndex: number;
  align: StyledBlock["align"];
  y: number;
  size: number;
  lineHeight: number;
  /** Role style (headings bold, Scripture italic), as every export draws it. */
  role: { bold: boolean; italic: boolean };
  tokens: Array<{ run: StyledRun; text: string }>;
}

export interface PageViewModel {
  frame: PngFrame;
  pages: PageViewLine[][];
}

/** Page view model: Backend's layoutSnapshot (the export layout), not a copy of it. */
export function buildPageView(opts: { content: JSONContent; settings: PresentationSettings }): PageViewModel {
  const snapshot = snapshotFor(opts.content as never, opts.settings);
  const { frame, styled, pages } = layoutSnapshot(snapshot);
  return {
    frame,
    pages: pages.map((pg, pi) =>
      pg.lines.map((l, li) => {
        const block = styled[l.blockIndex];
        const cite = citationCaps(block.citation ?? "");
        const tokens =
          l.kind === "citation"
            ? [{ run: { text: cite, fontFamily: "serif" } as StyledRun, text: cite }]
            : sliceRuns(block, l.start, l.end);
        return {
          key: `${pi}-${li}`,
          kind: l.kind,
          blockType: block.type,
          blockIndex: l.blockIndex,
          lineIndex: l.lineIndex,
          align: l.kind === "citation" ? "right" : block.align,
          y: l.y,
          size: l.size,
          lineHeight: l.lineHeight,
          role: l.kind === "citation" ? { bold: false, italic: false } : roleStyle(block.type),
          tokens,
        };
      }),
    ),
  };
}

/** Scale that fits a frame to the screen width (pages scroll vertically). */
export function fitScale(frameWidth: number, viewportWidth: number): number {
  return frameWidth > 0 ? viewportWidth / frameWidth : 1;
}

/** A frame matches the screen's shape (within 3 %): show it edge to edge, no bars. */
export function fillsScreen(frame: { width: number; height: number }, vw: number, vh: number): boolean {
  if (!vw || !vh) return false;
  return Math.abs(frame.width / frame.height - vw / vh) / (vw / vh) < 0.03;
}

/** Scale that fits a whole frame inside the box (letterboxed, centred). */
export function containScale(frame: { width: number; height: number }, boxW: number, boxH: number): number {
  if (!boxW || !boxH) return 1;
  return Math.min(boxW / frame.width, boxH / frame.height);
}

/** Page turn for a key: +1 next, -1 previous, 0 not a page key. Clickers send PageUp/PageDown. */
export function pageStepForKey(key: string, shift = false): -1 | 0 | 1 {
  switch (key) {
    case "ArrowRight":
    case "PageDown":
      return 1;
    case " ":
    case "Spacebar":
      return shift ? -1 : 1;
    case "ArrowLeft":
    case "PageUp":
      return -1;
    default:
      return 0;
  }
}

/** Horizontal swipe → page step (left swipe = next). */
export function pageStepForSwipe(dx: number, dy: number, min = 50): -1 | 0 | 1 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

export function clampPage(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i));
}

/** Page holding a paragraph (block): keeps the reader in place after re-layout. */
export function pageOfBlock(
  pages: Array<Array<{ blockIndex: number; lineIndex?: number }>>,
  block: number,
  line = 0,
): number {
  // The page holding this paragraph's anchor line (or the closest earlier line of it).
  let hit = -1;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].some((l) => l.blockIndex === block && (l.lineIndex ?? 0) <= line)) hit = i;
  }
  if (hit >= 0) return hit;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].some((l) => l.blockIndex >= block)) {
      if (pages[i].some((l) => l.blockIndex === block) || i === 0) return i;
      return i - 1 >= 0 && pages[i][0].blockIndex > block ? i - 1 : i;
    }
  }
  return Math.max(0, pages.length - 1);
}
