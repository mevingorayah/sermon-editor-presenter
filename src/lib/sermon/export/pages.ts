import { snapshotLineSpacing } from "./frames";
import type { CalibratedSnapshot } from "@/types/document";
import { styledBlocksFromSnapshot, titleTextFromSnapshot, type StyledBlock, type StyledRun } from "./contentWalk";
import { layoutPngPages, pngFrame, toLayoutBlocks, type PngFrame, type PngPage } from "./pngLayout";

/** A run slice on one placed line. */
export interface LineToken {
  run: StyledRun;
  text: string;
}

/** Runs of `block` covering the char range [start, end) of its joined text. */
export function sliceRuns(block: StyledBlock, start: number, end: number): LineToken[] {
  const out: LineToken[] = [];
  let pos = 0;
  for (const run of block.runs) {
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + run.text.length);
    if (b > a) out.push({ run, text: run.text.slice(a - pos, b - pos) });
    pos += run.text.length;
  }
  return out;
}

/** The shared PNG/PPTX page split (Frontend's pngLayout.ts) for a snapshot. */
export function exportPages(snapshot: CalibratedSnapshot): {
  frame: PngFrame;
  blocks: StyledBlock[];
  pages: PngPage[];
} {
  const found = styledBlocksFromSnapshot(snapshot);
  const blocks: StyledBlock[] = found.length
    ? found
    : [{ type: "Title", align: "left", runs: [{ text: titleTextFromSnapshot(snapshot), fontFamily: "serif" }] }];
  const target = String(snapshot.target);
  return {
    frame: pngFrame(target, snapshot.margins),
    blocks,
    pages: layoutPngPages(toLayoutBlocks(blocks), target, snapshotLineSpacing(snapshot), snapshot.margins),
  };
}
