import PDFDocument from "pdfkit";
import type { CalibratedSnapshot } from "@/types/document";
import { HIGHLIGHT_AMBER } from "./colors";
import {
  titleTextFromSnapshot,
  withNotesSection,
  type StyledBlock,
  type StyledRun,
  type TextAlign,
  citationCaps,
} from "./contentWalk";
import { pdfkitFont, type FontFamilyId } from "./fonts";
import { frameSizeInches, pxPerPt, type PageInput } from "./frames";
import { layoutSnapshot, roleStyle } from "./pngLayout";
import { blockColor, paletteFor, sliceRuns, trimRunsEnd } from "./png";

export interface PdfBuildOptions {
  includeNotes?: boolean;
  notes?: string;
  resolvedColors?: { accent: string };
  /** Colours only (default light ink); never changes layout. */
  exportTheme?: "light" | "dark";
  /** Tests only: false leaves page streams readable. Default true. */
  compress?: boolean;
}

/** PDF page size in points: the shared frame (frames.ts). */
export function pdfPageSize(target: PageInput): { width: number; height: number } {
  const { width, height } = frameSizeInches(target);
  return { width: width * 72, height: height * 72 };
}

const BASE = 12;
const STEP_FACTOR = 1.125;

function fontSize(
  step: number,
  role: "title" | "h1" | "h2" | "body" | "caption",
): number {
  const roleBase =
    role === "title"
      ? BASE * 2.2
      : role === "h1"
        ? BASE * 1.6
        : role === "h2"
          ? BASE * 1.3
          : role === "caption"
            ? BASE * 0.9
            : BASE;
  return Math.round(roleBase * Math.pow(STEP_FACTOR, step) * 10) / 10;
}

function pdfAlign(align: TextAlign): "left" | "center" | "right" {
  return align;
}

function writeRuns(
  doc: PDFKit.PDFDocument,
  runs: StyledRun[],
  opts: {
    size: number;
    lineHeight: number;
    align: TextAlign;
    defaultColor: string;
    forceItalic?: boolean;
    defaultFont?: FontFamilyId;
  },
): void {
  if (runs.length === 0) {
    doc.text(" ", { align: pdfAlign(opts.align), continued: false });
    return;
  }

  runs.forEach((run, i) => {
    const italic = opts.forceItalic || !!run.italic;
    const bold = !!run.bold;
    const fontId = run.fontFamily || opts.defaultFont || "serif";
    const color = run.color || opts.defaultColor;
    doc
      .font(pdfkitFont(fontId, { bold, italic }))
      .fontSize(opts.size)
      .fillColor(color);

    if (run.highlight) {
      // Best-effort: soft amber fill behind this continued run is limited in
      // pdfkit; approximate by drawing text then a translucent note is skipped.
      // Color the text slightly warmer instead of failing the export.
      void HIGHLIGHT_AMBER;
    }

    const isLast = i === runs.length - 1;
    doc.text(run.text || " ", {
      align: pdfAlign(opts.align),
      continued: !isLast,
      lineGap: (opts.lineHeight - 1) * opts.size,
      // highlight: pdfkit has no run-level background; omit rather than fail
    });
  });
}

function writeBlock(
  doc: PDFKit.PDFDocument,
  block: StyledBlock,
  step: number,
  lineHeight: number,
  accent?: string,
): void {
  switch (block.type) {
    case "Title":
      writeRuns(doc, block.runs, {
        size: fontSize(step, "title"),
        lineHeight,
        align: block.align,
        defaultColor: accent || "#111111",
        defaultFont: "serif",
      });
      doc.moveDown(0.6);
      break;
    case "H1":
      writeRuns(doc, block.runs, {
        size: fontSize(step, "h1"),
        lineHeight,
        align: block.align,
        defaultColor: "#111111",
        defaultFont: "serif",
      });
      doc.moveDown(0.4);
      break;
    case "H2":
      writeRuns(doc, block.runs, {
        size: fontSize(step, "h2"),
        lineHeight,
        align: block.align,
        defaultColor: "#222222",
        defaultFont: "serif",
      });
      doc.moveDown(0.3);
      break;
    case "Body":
      writeRuns(doc, block.runs, {
        size: fontSize(step, "body"),
        lineHeight,
        align: block.align,
        defaultColor: "#111111",
        defaultFont: "serif",
      });
      doc.moveDown(0.5);
      break;
    case "Scripture":
      writeRuns(doc, block.runs, {
        size: fontSize(step, "body"),
        lineHeight,
        align: block.align,
        defaultColor: "#111111",
        forceItalic: true,
        defaultFont: "serif",
      });
      if (block.citation) {
        doc
          .font("Times-Roman")
          .fontSize(fontSize(step, "caption"))
          .fillColor("#555555")
          .text(citationCaps(block.citation), { align: "right" });
      }
      doc.moveDown(0.6);
      break;
    case "Caption":
      writeRuns(doc, block.runs, {
        size: fontSize(step, "caption"),
        lineHeight,
        align: "right",
        defaultColor: "#555555",
        defaultFont: "serif",
      });
      doc.moveDown(0.4);
      break;
    default: {
      const _exhaustive: never = block.type;
      void _exhaustive;
    }
  }
}

/**
 * PDF: the same pages as PNG/PPTX (`layoutPngPages`), drawn line by line at
 * the frame's size in points, so line and page breaks match exactly
 * (pdfkit's built-in fonts are the metrics the layout measures with).
 * Printed in light ink. Study notes, when asked for, follow on their own
 * pages after the sermon and flow normally.
 */
export async function buildPdf(
  snapshot: CalibratedSnapshot,
  options: PdfBuildOptions = {},
): Promise<Buffer> {
  const layout = layoutSnapshot(snapshot);
  const { frame: f, styled, target } = layout;
  const ppt = pxPerPt(target);
  const P = (px: number) => px / ppt;
  const size = pdfPageSize(target);
  const title = titleTextFromSnapshot(snapshot);
  const pal = paletteFor(options.exportTheme ?? "light", options.resolvedColors?.accent);
  const accent = pal.accent;
  const notes = withNotesSection([], options.includeNotes === true, options.notes);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [size.width, size.height],
      margins: { top: P(f.top), left: P(f.left), right: P(f.width - f.left - f.contentWidth), bottom: P(f.height - f.bottom) },
      info: {
        Title: title,
        Creator: "sermon-editor-presenter",
        Producer: "sermon-editor-presenter",
      },
      autoFirstPage: false,
      compress: options.compress !== false,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const color = (type: StyledBlock["type"]) => blockColor(type, pal);
    const paint = () => {
      doc.save().rect(0, 0, size.width, size.height).fill(pal.bg).restore();
      doc.save().rect(0, 0, P(8), size.height).fill(pal.accent).restore();
    };

    for (const page of layout.pages) {
      doc.addPage();
      paint();
      for (const line of page.lines) {
        const block = styled[line.blockIndex];
        const baseline = P(line.y + line.size);
        const fs = P(line.size);
        if (line.kind === "citation") {
          const text = citationCaps(block.citation ?? "");
          doc.font(pdfkitFont("serif", {})).fontSize(fs).fillColor(pal.muted);
          const w = doc.widthOfString(text);
          doc.text(text, P(f.left + f.contentWidth) - w, baseline, { lineBreak: false, baseline: "alphabetic" });
          continue;
        }
        const role = roleStyle(block.type);
        const runs = trimRunsEnd(sliceRuns(block.runs, line.start, line.end));
        const fontOf = (r: StyledRun) =>
          pdfkitFont(r.fontFamily, { bold: role.bold || !!r.bold, italic: role.italic || !!r.italic });
        const total = runs.reduce((w, r) => w + doc.font(fontOf(r)).fontSize(fs).widthOfString(r.text), 0);
        const free = P(f.contentWidth) - total;
        let x = P(f.left) + (block.align === "center" ? free / 2 : block.align === "right" ? free : 0);
        for (const r of runs) {
          doc.font(fontOf(r)).fontSize(fs).fillColor(r.color || color(block.type));
          const w = doc.widthOfString(r.text);
          if (r.highlight) {
            doc.save().rect(x, baseline - fs * 0.8, w, fs * 1.05).fill(HIGHLIGHT_AMBER).restore();
            doc.fillColor(r.color || color(block.type));
          }
          doc.text(r.text, x, baseline, {
            lineBreak: false,
            baseline: "alphabetic",
            underline: !!r.underline,
            strike: !!r.strike,
          });
          x += w;
        }
      }
    }

    if (notes.length) {
      doc.addPage(); // study notes always print light (dark-on-white text)
      doc.fillColor("#111111");
      doc.x = doc.page.margins.left;
      doc.y = doc.page.margins.top;
      for (const block of notes) {
        writeBlock(doc, block, 1, snapshot.lineHeight, accent);
      }
    }

    doc.end();
  });
}
