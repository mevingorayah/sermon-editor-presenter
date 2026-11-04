import PptxGenJS from "pptxgenjs";
import type { CalibratedSnapshot } from "@/types/document";
import {
  DEFAULT_ACCENT_DARK,
  DEFAULT_ACCENT_LIGHT,
  HIGHLIGHT_AMBER,
  toHexRgb,
} from "./colors";
import {
  titleTextFromSnapshot,
  type StyledBlock,
  type StyledRun,
  citationCaps,
} from "./contentWalk";
import { exportPages, sliceRuns } from "./pages";
import { ensureContrast } from "../../reading/contrast";
import { docxFontName } from "./fonts";
import { isPaperTarget } from "./margins";

export interface PptxBuildOptions {
  resolvedColors?: { accent: string };
}

function runsToPptxText(
  runs: StyledRun[],
  opts: {
    fontSize: number;
    defaultColor: string;
    forceItalic?: boolean;
    bold?: boolean;
  },
): PptxGenJS.TextProps[] {
  return runs.map((run) => ({
    text: run.text,
    options: {
      fontSize: opts.fontSize,
      fontFace: docxFontName(run.fontExplicit ? run.fontFamily : "serif"),
      bold: opts.bold || run.bold,
      italic: opts.forceItalic || run.italic,
      underline: run.underline ? { style: "sng" } : undefined,
      strike: run.strike ? "sngStrike" : undefined,
      color: (run.color || opts.defaultColor).replace(/^#/, ""),
      highlight: run.highlight
        ? HIGHLIGHT_AMBER.replace(/^#/, "")
        : undefined,
    },
  }));
}

/**
 * PPTX: one slide per page of the shared PNG page split (pngLayout.ts), so
 * slides and images break in the same places. Every line is placed.
 * Notes ignored for PPTX v1.
 */
export async function buildPptx(
  snapshot: CalibratedSnapshot,
  options: PptxBuildOptions = {},
): Promise<Buffer> {
  const { frame, blocks, pages } = exportPages(snapshot);
  const title =
    blocks.find((b) => b.type === "Title")?.runs.map((r) => r.text).join("").trim() ||
    titleTextFromSnapshot(snapshot);
  const paper = isPaperTarget(String(snapshot.target));
  const light = paper || snapshot.theme === "light";
  const accent =
    toHexRgb(options.resolvedColors?.accent) ||
    (light ? DEFAULT_ACCENT_LIGHT : DEFAULT_ACCENT_DARK);
  const bgHex = light ? "#F7F4EF" : "#1A1A1A";
  const bg = bgHex.slice(1);
  const fg = light ? "111111" : "F0EDE6";
  const muted = light ? "555555" : "A8A29A";
  const titleColor = (light ? accent : ensureContrast(accent, bgHex)).replace(/^#/, "").toUpperCase();

  const pptx = new PptxGenJS();
  pptx.author = "sermon-editor-presenter";
  pptx.title = title;
  pptx.subject = `Calibrated export target=${snapshot.target}`;

  const W = 13.333;
  const k = W / frame.width; // inches per frame pixel
  pptx.defineLayout({ name: "CAL", width: W, height: frame.height * k });
  pptx.layout = "CAL";
  const pt = (px: number) => Math.round(px * k * 72 * 10) / 10;

  const colorFor = (type: StyledBlock["type"]) =>
    type === "Title" ? titleColor : type === "Caption" ? muted : type === "H2" && !light ? "D4CFC5" : fg;

  for (const page of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: bg };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 8 * k, h: frame.height * k,
      fill: { color: accent.replace(/^#/, "") }, line: { color: accent.replace(/^#/, "") },
    });
    // Consecutive lines of one block become one text box.
    let i = 0;
    while (i < page.lines.length) {
      const first = page.lines[i];
      const block = blocks[first.blockIndex];
      if (first.kind === "citation") {
        slide.addText(citationCaps(block.citation ?? ""), {
          x: frame.left * k, y: first.y * k, w: frame.contentWidth * k, h: first.lineHeight * k,
          fontSize: pt(first.size), color: muted, align: "right", fontFace: docxFontName("serif"),
          margin: 0, valign: "top",
        });
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < page.lines.length && page.lines[j + 1].blockIndex === first.blockIndex && page.lines[j + 1].kind === "text") j++;
      const last = page.lines[j];
      const runs = sliceRuns(block, first.start, last.end).map((t) => ({ ...t.run, text: t.text }));
      const heading = block.type === "Title" || block.type === "H1" || block.type === "H2";
      slide.addText(
        runsToPptxText(runs.length ? runs : [{ text: " ", fontFamily: "serif" }], {
          fontSize: pt(first.size),
          defaultColor: `#${colorFor(block.type)}`,
          forceItalic: block.type === "Scripture",
          bold: heading,
        }),
        {
          x: frame.left * k, y: first.y * k, w: frame.contentWidth * k,
          h: (last.y + last.lineHeight - first.y) * k,
          valign: "top", align: block.align, margin: 0, lineSpacingMultiple: snapshot.lineHeight,
        },
      );
      i = j + 1;
    }
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
