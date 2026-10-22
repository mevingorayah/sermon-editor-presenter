import PptxGenJS from "pptxgenjs";
import type { CalibratedSnapshot } from "@/types/document";
import { citationCaps, titleTextFromSnapshot, type StyledRun } from "./contentWalk";
import { blockColor, paletteFor, sliceRuns, trimRunsEnd } from "./png";
import { frameSizeInches, pxPerInch, pxPerPt, type PageInput } from "./frames";
import { layoutSnapshot, roleStyle } from "./pngLayout";
import { metricCompatibleOffice } from "./textMeasure";

export interface PptxBuildOptions {
  resolvedColors?: { accent: string };
  /** Colours only; defaults to the snapshot theme. */
  exportTheme?: "light" | "dark";
}

const hex = (c: string) => c.replace(/^#/, "");

function runsToPptxText(
  runs: StyledRun[],
  opts: { fontSize: number; defaultColor: string; bold: boolean; italic: boolean; highlight: string },
): PptxGenJS.TextProps[] {
  return runs.map((run) => ({
    text: run.text,
    options: {
      fontSize: opts.fontSize,
      fontFace: metricCompatibleOffice(run.fontFamily),
      bold: opts.bold || !!run.bold,
      italic: opts.italic || !!run.italic,
      underline: run.underline ? { style: "sng" } : undefined,
      strike: run.strike ? "sngStrike" : undefined,
      color: hex(run.color || opts.defaultColor),
      highlight: run.highlight ? hex(opts.highlight) : undefined,
    },
  }));
}

/** PowerPoint's largest slide side (inches). */
export const PPTX_MAX_SIDE_IN = 56;

/**
 * Uniform scale for a frame on a PPTX slide: 1, except custom pages with a side
 * over 56 in, which shrink as a whole (line breaks unchanged).
 */
export function pptxScale(target: PageInput): number {
  const { width, height } = frameSizeInches(target);
  return Math.min(1, PPTX_MAX_SIDE_IN / Math.max(width, height));
}

/** Slide size in inches for a target: the shared frame (frames.ts), custom size included. */
export function pptxSlideSize(target: PageInput): { width: number; height: number } {
  const { width, height } = frameSizeInches(target);
  const k = pptxScale(target);
  return { width: +(width * k).toFixed(4), height: +(height * k).toFixed(4) };
}

/**
 * PPTX: one slide per page of the shared layout (`layoutPngPages`), so the
 * slides match the PNG pages line for line. Each layout line is its own
 * non-wrapping text box, so PowerPoint cannot re-break it.
 * Notes ignored for PPTX.
 */
export async function buildPptx(
  snapshot: CalibratedSnapshot,
  options: PptxBuildOptions = {},
): Promise<Buffer> {
  const layout = layoutSnapshot(snapshot);
  const { frame: f, styled, target } = layout;
  const p = paletteFor(options.exportTheme ?? snapshot.theme, options.resolvedColors?.accent);
  const k = pptxScale(target);
  const ppi = pxPerInch(target) / k;
  const ppt = pxPerPt(target) / k;
  const inch = (px: number) => +(px / ppi).toFixed(4);
  const pt = (px: number) => +(px / ppt).toFixed(2);

  const pptx = new PptxGenJS();
  pptx.author = "sermon-editor-presenter";
  pptx.title = titleTextFromSnapshot(snapshot);
  pptx.subject = `Calibrated export ${target.format} ${target.orientation}`;
  const size = pptxSlideSize(target);
  pptx.defineLayout({ name: "CAL", width: size.width, height: size.height });
  pptx.layout = "CAL";

  for (const page of layout.pages) {
    const slide = pptx.addSlide();
    slide.background = { color: hex(p.bg) };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: inch(8), h: size.height,
      fill: { color: hex(p.accent) }, line: { color: hex(p.accent), width: 0 },
    });
    for (const line of page.lines) {
      const block = styled[line.blockIndex];
      const box = {
        x: inch(f.left), y: inch(line.y), w: inch(f.contentWidth), h: inch(line.lineHeight),
        margin: 0, valign: "top" as const, wrap: false, fit: "none" as const,
      };
      if (line.kind === "citation") {
        slide.addText(citationCaps(block.citation ?? ""), {
          ...box, align: "right", fontSize: pt(line.size), color: hex(p.muted),
          fontFace: metricCompatibleOffice("serif"),
        });
        continue;
      }
      const role = roleStyle(block.type);
      const runs = trimRunsEnd(sliceRuns(block.runs, line.start, line.end));
      if (!runs.length) continue;
      slide.addText(
        runsToPptxText(runs, { fontSize: pt(line.size), defaultColor: blockColor(block.type, p), highlight: p.highlight, ...role }),
        { ...box, align: block.align },
      );
    }
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
