import PDFDocument from "pdfkit";
import type { CalibratedSnapshot } from "@/types/document";
import { HIGHLIGHT_AMBER, toHexRgb } from "./colors";
import {
  styledBlocksFromSnapshot,
  titleTextFromSnapshot,
  withNotesSection,
  type StyledBlock,
  type StyledRun,
  type TextAlign,
  citationCaps,
} from "./contentWalk";
import { pdfkitFont, type FontFamilyId } from "./fonts";
import { resolveMargins } from "./margins";

export interface PdfBuildOptions {
  includeNotes?: boolean;
  notes?: string;
  resolvedColors?: { accent: string };
}

function pageSize(
  target: string,
): PDFKit.PDFDocumentOptions["size"] {
  switch (target) {
    case "paper-a4":
      return "A4";
    case "paper-letter":
      return "LETTER";
    case "paper-half-letter":
      return [396, 612];
    case "tablet-portrait":
      return [768, 1024];
    case "screen-16-10":
      return [960, 600];
    case "screen-16-9":
    default:
      return [960, 540];
  }
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

export async function buildPdf(
  snapshot: CalibratedSnapshot,
  options: PdfBuildOptions = {},
): Promise<Buffer> {
  const target = String(snapshot.target);
  const margins = resolveMargins(snapshot.margins, target);
  const inch = 72;
  const left = (margins.left + margins.binderGutter) * inch;
  const right = margins.right * inch;
  const top = margins.top * inch;
  const bottom = margins.bottom * inch;
  const title = titleTextFromSnapshot(snapshot);
  const accent = toHexRgb(options.resolvedColors?.accent);
  const blocks = withNotesSection(
    styledBlocksFromSnapshot(snapshot),
    options.includeNotes === true,
    options.notes,
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: pageSize(target),
      margins: { top, left, right, bottom },
      info: {
        Title: title,
        Creator: "sermon-editor-presenter",
        Producer: "sermon-editor-presenter",
      },
      autoFirstPage: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#111111");

    if (blocks.length === 0) {
      doc.font("Times-Bold").fontSize(18).text(title);
    } else {
      for (const block of blocks) {
        writeBlock(
          doc,
          block,
          snapshot.typeScaleStep,
          snapshot.lineHeight,
          accent,
        );
      }
    }

    doc.end();
  });
}
