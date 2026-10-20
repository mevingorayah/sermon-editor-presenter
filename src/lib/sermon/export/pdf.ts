import fs from "node:fs";
import path from "node:path";
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

/**
 * Bundled app fonts (DevOps #18 puts them in assets/fonts and copies them to
 * /app/assets/fonts). Literata is the body serif, as in Edit.
 */
const FONT_FILES: Record<FontFamilyId, { regular: string; italic: string }> = {
  serif: { regular: "literata/Literata[opsz,wght].ttf", italic: "literata/Literata-Italic[opsz,wght].ttf" },
  sans: { regular: "inter/Inter[opsz,wght].ttf", italic: "inter/Inter-Italic[opsz,wght].ttf" },
  mono: { regular: "jetbrains-mono/JetBrainsMono[wght].ttf", italic: "jetbrains-mono/JetBrainsMono-Italic[wght].ttf" },
};

export function fontDir(): string | null {
  const candidates = [
    process.env.EXPORT_FONT_DIR,
    "/app/assets/fonts",
    path.join(process.cwd(), "assets/fonts"),
  ].filter(Boolean) as string[];
  return candidates.find((d) => fs.existsSync(path.join(d, FONT_FILES.serif.regular))) ?? null;
}

let embedded = false;
function registerFonts(doc: PDFKit.PDFDocument): boolean {
  const dir = fontDir();
  if (!dir) return false;
  for (const [id, f] of Object.entries(FONT_FILES)) {
    doc.registerFont(`${id}-regular`, path.join(dir, f.regular));
    doc.registerFont(`${id}-italic`, path.join(dir, f.italic));
  }
  return true;
}

function fontFor(id: FontFamilyId, style: { bold?: boolean; italic?: boolean }): string {
  if (!embedded) return pdfkitFont(id, style);
  return `${id}-${style.italic ? "italic" : "regular"}`;
}

/**
 * Neither Literata nor the built-in PDF fonts have a narrow no-break space
 * (U+202F), so it is written as a normal no-break space (U+00A0). It still
 * never breaks, so « » and ; : ! ? stay with their word.
 */
function pdfText(s: string): string {
  return s.replace(/\u202f/g, "\u00a0");
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
    const fontId = run.fontExplicit
      ? run.fontFamily
      : opts.defaultFont || "serif";
    const color = run.color || opts.defaultColor;
    doc
      .font(fontFor(fontId, { bold, italic }))
      .fontSize(opts.size)
      .fillColor(color);

    const isLast = i === runs.length - 1;
    // Variable fonts embed at their regular weight, so bold is drawn with a
    // thin outline in the same colour (faux bold) when the app fonts are used.
    const fauxBold = embedded && bold;
    if (fauxBold) doc.lineWidth(opts.size * 0.035).strokeColor(color);
    doc.text(pdfText(run.text || " "), {
      align: pdfAlign(opts.align),
      continued: !isLast,
      underline: !!run.underline,
      strike: !!run.strike,
      fill: true,
      stroke: fauxBold,
      lineGap: (opts.lineHeight - 1) * opts.size,
      // Read by the _fragment hook in installHighlight: amber box behind the run.
      ...({ sermonHighlight: !!run.highlight } as object),
    });
  });
}

type FragmentFn = (text: string, x: number, y: number, options: Record<string, unknown>) => unknown;

/**
 * pdfkit has no run background, so wrap its per-line fragment drawer: for a
 * highlighted run, fill HIGHLIGHT_AMBER (DOCX's highlight) behind the exact
 * fragment before the text is drawn.
 */
function installHighlight(doc: PDFKit.PDFDocument): void {
  const d = doc as unknown as { _fragment: FragmentFn };
  const original = d._fragment;
  d._fragment = function (this: PDFKit.PDFDocument, text, x, y, options) {
    const t = `${text}`.replace(/\n/g, "");
    if (options.sermonHighlight && t.trim()) {
      const w = this.widthOfString(t, options);
      let hx = x;
      if (options.width) {
        const lineWidth = Number(options.lineWidth) || 0;
        if (options.align === "right") hx += lineWidth - this.widthOfString(t.replace(/\s+$/, ""), options);
        else if (options.align === "center") hx += lineWidth / 2 - (Number(options.textWidth) || 0) / 2;
      }
      this.save().rect(hx, y, w, this.currentLineHeight(true)).fill(HIGHLIGHT_AMBER).restore();
    }
    return original.call(this, text, x, y, options);
  };
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
          .font(fontFor("serif", {}))
          .fontSize(fontSize(step, "caption"))
          .fillColor("#555555")
          .text(pdfText(citationCaps(block.citation)), { align: "right" });
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

    embedded = registerFonts(doc);
    installHighlight(doc);
    doc.fillColor("#111111");

    if (blocks.length === 0) {
      doc.font(fontFor("serif", { bold: true })).fontSize(18).text(pdfText(title));
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
