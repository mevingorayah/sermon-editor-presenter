import PDFDocument from "pdfkit";
import type { CalibratedSnapshot, SemanticBlock } from "@/types/document";
import { resolveMargins } from "./margins";

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

function writeBlock(
  doc: PDFKit.PDFDocument,
  block: SemanticBlock,
  step: number,
  lineHeight: number,
): void {
  switch (block.type) {
    case "Title":
      doc
        .font("Times-Bold")
        .fontSize(fontSize(step, "title"))
        .fillColor("#111111")
        .text(block.text, {
          align: "left",
          lineGap: (lineHeight - 1) * fontSize(step, "title"),
        });
      doc.moveDown(0.6);
      break;
    case "H1":
      doc
        .font("Times-Bold")
        .fontSize(fontSize(step, "h1"))
        .fillColor("#111111")
        .text(block.text, { align: "left" });
      doc.moveDown(0.4);
      break;
    case "H2":
      doc
        .font("Times-Bold")
        .fontSize(fontSize(step, "h2"))
        .fillColor("#222222")
        .text(block.text, { align: "left" });
      doc.moveDown(0.3);
      break;
    case "Body":
      doc
        .font("Times-Roman")
        .fontSize(fontSize(step, "body"))
        .fillColor("#111111")
        .text(block.text || " ", {
          align: "left",
          lineGap: (lineHeight - 1) * fontSize(step, "body"),
        });
      doc.moveDown(0.5);
      break;
    case "Scripture":
      doc
        .font("Times-Italic")
        .fontSize(fontSize(step, "body"))
        .fillColor("#111111")
        .text(block.text, {
          align: "left",
          lineGap: (lineHeight - 1) * fontSize(step, "body"),
        });
      if (block.citation) {
        doc
          .font("Times-Roman")
          .fontSize(fontSize(step, "caption"))
          .fillColor("#555555")
          .text(block.citation, { align: "right" });
      }
      doc.moveDown(0.6);
      break;
    case "Caption":
      doc
        .font("Times-Roman")
        .fontSize(fontSize(step, "caption"))
        .fillColor("#555555")
        .text(block.text, { align: "right" });
      doc.moveDown(0.4);
      break;
    default: {
      const _exhaustive: never = block.type;
      void _exhaustive;
    }
  }
}

function titleFromSnapshot(snapshot: CalibratedSnapshot): string {
  const titleBlock = snapshot.semanticBlocks.find((b) => b.type === "Title");
  return titleBlock?.text?.trim() || "Sermon";
}

export async function buildPdf(
  snapshot: CalibratedSnapshot,
): Promise<Buffer> {
  const target = String(snapshot.target);
  const margins = resolveMargins(snapshot.margins, target);
  const inch = 72;
  const left = (margins.left + margins.binderGutter) * inch;
  const right = margins.right * inch;
  const top = margins.top * inch;
  const bottom = margins.bottom * inch;
  const title = titleFromSnapshot(snapshot);

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

    // Print/export: always light ink (ignore dark theme for paper/file).
    doc.fillColor("#111111");

    if (snapshot.semanticBlocks.length === 0) {
      doc.font("Times-Bold").fontSize(18).text(title);
    } else {
      for (const block of snapshot.semanticBlocks) {
        writeBlock(doc, block, snapshot.typeScaleStep, snapshot.lineHeight);
      }
    }

    doc.end();
  });
}
