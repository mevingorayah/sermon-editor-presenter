import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  ShadingType,
} from "docx";
import type { CalibratedSnapshot } from "@/types/document";
import { HIGHLIGHT_AMBER, hexWithoutHash, toHexRgb } from "./colors";
import {
  styledBlocksFromSnapshot,
  titleTextFromSnapshot,
  withNotesSection,
  type StyledBlock,
  type StyledRun,
  type TextAlign,
} from "./contentWalk";
import { docxFontName } from "./fonts";
import { isPaperTarget, resolveMargins } from "./margins";

export interface DocxBuildOptions {
  includeNotes?: boolean;
  notes?: string;
  resolvedColors?: { accent: string };
}

function alignType(align: TextAlign) {
  switch (align) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    default:
      return AlignmentType.LEFT;
  }
}

function runToTextRun(
  run: StyledRun,
  opts: { size: number; defaultColor?: string; forceItalic?: boolean },
): TextRun {
  const color =
    (run.color ? hexWithoutHash(run.color) : undefined) ??
    (opts.defaultColor ? hexWithoutHash(opts.defaultColor) : undefined);
  return new TextRun({
    text: run.text,
    bold: run.bold,
    italics: opts.forceItalic || run.italic,
    size: opts.size,
    font: docxFontName(run.fontFamily),
    color,
    shading: run.highlight
      ? {
          type: ShadingType.CLEAR,
          fill: hexWithoutHash(HIGHLIGHT_AMBER),
        }
      : undefined,
  });
}

function blockToParagraphs(
  block: StyledBlock,
  accent?: string,
): Paragraph[] {
  const align = alignType(block.align);
  switch (block.type) {
    case "Title":
      return [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          spacing: { after: 240 },
          alignment: align,
          children: block.runs.map((r) =>
            runToTextRun(
              { ...r, bold: true },
              { size: 56, defaultColor: accent },
            ),
          ),
        }),
      ];
    case "H1":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 160 },
          alignment: align,
          children: block.runs.map((r) =>
            runToTextRun({ ...r, bold: true }, { size: 36 }),
          ),
        }),
      ];
    case "H2":
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
          alignment: align,
          children: block.runs.map((r) =>
            runToTextRun({ ...r, bold: true }, { size: 28 }),
          ),
        }),
      ];
    case "Body": {
      const text = block.runs.map((r) => r.text).join("");
      if (!text.trim()) {
        return [
          new Paragraph({
            spacing: { after: 160 },
            alignment: align,
            children: [new TextRun({ text: " ", size: 24 })],
          }),
        ];
      }
      // Split on newlines while keeping run styles on single-line bodies.
      if (!text.includes("\n")) {
        return [
          new Paragraph({
            spacing: { after: 160 },
            alignment: align,
            children: block.runs.map((r) => runToTextRun(r, { size: 24 })),
          }),
        ];
      }
      return text
        .split(/\n+/)
        .filter(Boolean)
        .map(
          (line) =>
            new Paragraph({
              spacing: { after: 160 },
              alignment: align,
              children: [new TextRun({ text: line, size: 24 })],
            }),
        );
    }
    case "Scripture": {
      const paras: Paragraph[] = [
        new Paragraph({
          spacing: { before: 200, after: 80 },
          alignment: align,
          children: block.runs.map((r) =>
            runToTextRun(r, { size: 24, forceItalic: true }),
          ),
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
          children: block.runs.map((r) =>
            runToTextRun(r, { size: 20, defaultColor: "#555555" }),
          ),
        }),
      ];
    default: {
      const _exhaustive: never = block.type;
      void _exhaustive;
      return [];
    }
  }
}

/**
 * Build DOCX from Frontend CalibratedSnapshot.
 * Print ink is always light-theme (dark chrome ignored). Gradients already
 * flattened client-side (`flattenGradient: true`). Bionic omitted by schema.
 */
export async function buildDocx(
  snapshot: CalibratedSnapshot,
  options: DocxBuildOptions = {},
): Promise<Buffer> {
  const accent = toHexRgb(options.resolvedColors?.accent);
  const blocks = withNotesSection(
    styledBlocksFromSnapshot(snapshot),
    options.includeNotes === true,
    options.notes,
  );

  const children: Paragraph[] = [];
  for (const block of blocks) {
    children.push(...blockToParagraphs(block, accent));
  }

  const title = titleTextFromSnapshot(snapshot);
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
