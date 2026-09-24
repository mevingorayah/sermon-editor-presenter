import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { CalibratedSnapshot, SemanticBlock } from "@/types/document";
import { isPaperTarget, resolveMargins } from "./margins";

function blockToParagraphs(block: SemanticBlock): Paragraph[] {
  switch (block.type) {
    case "Title":
      return [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          spacing: { after: 240 },
          children: [
            new TextRun({ text: block.text, bold: true, size: 56 }),
          ],
        }),
      ];
    case "H1":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 160 },
          children: [new TextRun({ text: block.text, bold: true, size: 36 })],
        }),
      ];
    case "H2":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          children: [new TextRun({ text: block.text, bold: true, size: 28 })],
        }),
      ];
    case "Body":
      return block.text.split(/\n+/).filter(Boolean).map(
        (line) =>
          new Paragraph({
            spacing: { after: 160 },
            children: [new TextRun({ text: line, size: 24 })],
          }),
      );
    case "Scripture": {
      const paras: Paragraph[] = [
        new Paragraph({
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({ text: block.text, italics: true, size: 24 }),
          ],
        }),
      ];
      if (block.citation) {
        paras.push(
          new Paragraph({
            spacing: { after: 200 },
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: block.citation,
                size: 20,
                color: "555555",
              }),
            ],
          }),
        );
      }
      return paras;
    }
    case "Caption":
      return [
        new Paragraph({
          spacing: { after: 160 },
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: block.text, size: 20, color: "555555" }),
          ],
        }),
      ];
    default: {
      const _exhaustive: never = block.type;
      void _exhaustive;
      return [];
    }
  }
}

function titleFromSnapshot(snapshot: CalibratedSnapshot): string {
  const titleBlock = snapshot.semanticBlocks.find((b) => b.type === "Title");
  return titleBlock?.text?.trim() || "Sermon";
}

/**
 * Build DOCX from Frontend CalibratedSnapshot.
 * Print ink is always light-theme (dark chrome ignored). Gradients already
 * flattened client-side (`flattenGradient: true`). Bionic omitted by schema.
 */
export async function buildDocx(
  snapshot: CalibratedSnapshot,
): Promise<Buffer> {
  const children: Paragraph[] = [];
  for (const block of snapshot.semanticBlocks) {
    children.push(...blockToParagraphs(block));
  }

  const title = titleFromSnapshot(snapshot);
  if (children.length === 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: title, bold: true })],
      }),
    );
  }

  const margins = resolveMargins(snapshot.margins, String(snapshot.target));
  const inch = 1440;
  const leftInches = margins.left + margins.binderGutter;

  // Prefer light for paper; always render dark text regardless of theme.
  void isPaperTarget(String(snapshot.target));
  void snapshot.theme;

  const doc = new Document({
    creator: "sermon-editor-presenter",
    title,
    description: `Calibrated export target=${snapshot.target}`,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: Math.round(margins.top * inch),
              right: Math.round(margins.right * inch),
              bottom: Math.round(margins.bottom * inch),
              left: Math.round(leftInches * inch),
            },
          },
        },
        children,
      },
    ],
  });

  const ab = await Packer.toBuffer(doc);
  return Buffer.from(ab);
}
