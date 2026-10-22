import PptxGenJS from "pptxgenjs";
import type { CalibratedSnapshot } from "@/types/document";
import { HIGHLIGHT_AMBER } from "./colors";
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
  opts: { fontSize: number; defaultColor: string; bold: boolean; italic: boolean },
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
      highlight: run.highlight ? hex(HIGHLIGHT_AMBER) : undefined,
    },
  }));
}

/** Slide size in inches for a target: the shared frame (frames.ts). */
export function pptxSlideSize(target: PageInput): { width: number; height: number } {
  return frameSizeInches(target);
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
  const ppi = pxPerInch(target);
  const ppt = pxPerPt(target);
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
        runsToPptxText(runs, { fontSize: pt(line.size), defaultColor: blockColor(block.type, p), ...role }),
        { ...box, align: block.align },
      );
    }
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
