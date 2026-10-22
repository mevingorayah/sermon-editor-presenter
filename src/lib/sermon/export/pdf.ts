import { snapshotLineSpacing } from "./frames";
import fs from "node:fs";
import path from "node:path";
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
import { exportFontName } from "./textMeasure";

/** Folder with the static export fonts (assets/fonts/export, /app in Docker). */
export function exportFontDir(): string | null {
  const c = [process.env.EXPORT_FONT_DIR && path.join(process.env.EXPORT_FONT_DIR, "export"),
    "/app/assets/fonts/export", path.join(process.cwd(), "assets/fonts/export")].filter(Boolean) as string[];
  return c.find((d) => fs.existsSync(path.join(d, "literata-Regular.ttf"))) ?? null;
}

/** Register the export fonts; returns a font-name resolver for this doc. */
function registerExportFonts(doc: PDFKit.PDFDocument): (id: FontFamilyId, st: { bold?: boolean; italic?: boolean }) => string {
  const dir = exportFontDir();
  if (!dir) {
    console.warn("[export/pdf] assets/fonts/export missing; falling back to built-in fonts (breaks may differ)");
    return pdfkitFont;
  }
  const seen = new Set<string>();
  return (id, st) => {
    const name = exportFontName(id, st);
    if (!seen.has(name)) { doc.registerFont(name, path.join(dir, `${name}.ttf`)); seen.add(name); }
    return name;
  };
}
import { frameSizeInches, pxPerPt, type PageInput } from "./frames";
import { layoutSnapshot, roleStyle } from "./pngLayout";
import { lookAlign, lookRole } from "./blockLook";
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
    const fontFor = registerExportFonts(doc);

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
      for (const b of page.boxes ?? []) {
        if (b.fill) doc.save().rect(P(b.x), P(b.y), P(b.w), P(b.h)).fill(b.fill).restore();
        if (b.border) doc.save().rect(P(b.x), P(b.y), P(b.borderWidth), P(b.h)).fill(b.border).restore();
      }
      for (const line of page.lines) {
        const block = styled[line.blockIndex];
        const lx = line.x ?? f.left;
        const lw = line.width ?? f.contentWidth;
        const baseline = P(line.y + line.size);
        const fs = P(line.size);
        if (line.kind === "citation") {
          const text = citationCaps(block.citation ?? "");
          doc.font(fontFor("serif", {})).fontSize(fs).fillColor(pal.muted);
          const w = doc.widthOfString(text, { features: NO_LIGA });
          doc.text(safeGlyphs(doc, text), Math.max(P(lx), P(lx + lw) - w), baseline, { lineBreak: false, baseline: "alphabetic", features: NO_LIGA });
          continue;
        }
        const role = lookRole(roleStyle(block.type), block.look);
        const bc = block.look?.color ?? color(block.type);
        const align = lookAlign(block.look, block.align);
        const runs = trimRunsEnd(sliceRuns(block.runs, line.start, line.end));
        const fontOf = (r: StyledRun) =>
          fontFor(r.fontFamily, { bold: role.bold || !!r.bold, italic: role.italic || !!r.italic });
        const total = runs.reduce((w, r) => w + doc.font(fontOf(r)).fontSize(fs).widthOfString(r.text, { features: NO_LIGA }), 0);
        const free = P(lw) - total;
        let x = P(lx) + (align === "center" ? free / 2 : align === "right" ? free : 0);
        if (block.look?.highlight && total > 0) doc.save().rect(x, baseline - fs * 0.8, total, fs * 1.05).fill(block.look.highlight).restore();
        for (const r of runs) {
          doc.font(fontOf(r)).fontSize(fs).fillColor(r.color || bc);
          const w = doc.widthOfString(r.text, { features: NO_LIGA });
          if (r.highlight) {
            doc.save().rect(x, baseline - fs * 0.8, w, fs * 1.05).fill(pal.highlight).restore();
            doc.fillColor(r.color || bc);
          }
          doc.text(safeGlyphs(doc, r.text), x, baseline, { lineBreak: false, baseline: "alphabetic", features: NO_LIGA });
          // Underline/strike drawn by hand (pdfkit's need a wrapped width).
          const rule = (dy: number) =>
            doc.save().rect(x, baseline + dy, w, Math.max(0.5, fs / 18)).fill(r.color || bc).restore();
          if (r.underline) rule(fs * 0.1);
          if (r.strike) rule(-fs * 0.3);
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
        writeBlock(doc, block, 1, snapshotLineSpacing(snapshot), accent);
      }
    }

    doc.end();
  });
}

/**
 * Spaces some embedded fonts lack (French U+202F before ?!;: and friends):
 * draw the nearest space the current font has, never a missing-glyph box.
 */
const SPACE_FALLBACKS: Record<string, string[]> = {
  "\u202F": ["\u2009", "\u00A0", " "],
  "\u2009": ["\u00A0", " "],
  "\u00A0": [" "],
  "\u2007": ["\u00A0", " "],
};
export function safeGlyphs(doc: PDFKit.PDFDocument, text: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const font = (doc as any)._font?.font as { hasGlyphForCodePoint?: (c: number) => boolean } | undefined;
  if (!font?.hasGlyphForCodePoint) return text.replace(/[\u202F\u2009\u2007]/g, "\u00A0");
  return text.replace(/[\u202F\u2009\u00A0\u2007]/g, (ch) => {
    if (font.hasGlyphForCodePoint!(ch.codePointAt(0)!)) return ch;
    return SPACE_FALLBACKS[ch].find((c) => font.hasGlyphForCodePoint!(c.codePointAt(0)!)) ?? " ";
  });
}

/** Layout measures single glyphs: no ligatures, so widths and copied text match. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NO_LIGA = { liga: false, clig: false, dlig: false, calt: false } as any;
