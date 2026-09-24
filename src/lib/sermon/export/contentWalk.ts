import type { JSONContent } from "@tiptap/react";
import type { CalibratedSnapshot, SemanticBlock } from "@/types/document";
import { mapFontFamily, type FontFamilyId } from "./fonts";
import { toHexRgb } from "./colors";

export type TextAlign = "left" | "center" | "right";

export interface StyledRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  highlight?: boolean;
  color?: string; // #RRGGBB
  fontFamily: FontFamilyId;
}

export interface StyledBlock {
  type: SemanticBlock["type"];
  align: TextAlign;
  runs: StyledRun[];
  citation?: string;
}

function alignOf(node: JSONContent): TextAlign {
  const a = node.attrs?.textAlign;
  if (a === "center" || a === "right" || a === "left") return a;
  return "left";
}

function runsFromNode(node: JSONContent): StyledRun[] {
  const runs: StyledRun[] = [];

  function walk(n: JSONContent, inherited: Partial<StyledRun> = {}) {
    if (n.type === "text") {
      const text = n.text ?? "";
      if (!text) return;
      let bold = inherited.bold;
      let italic = inherited.italic;
      let highlight = inherited.highlight;
      let color = inherited.color;
      let fontFamily = inherited.fontFamily ?? ("sans" as FontFamilyId);

      for (const mark of n.marks ?? []) {
        if (mark.type === "bold") bold = true;
        if (mark.type === "italic") italic = true;
        if (mark.type === "highlight") highlight = true;
        if (mark.type === "textStyle") {
          const attrs = mark.attrs ?? {};
          if (typeof attrs.color === "string") {
            color = toHexRgb(attrs.color) ?? color;
          }
          if (typeof attrs.fontFamily === "string") {
            fontFamily = mapFontFamily(attrs.fontFamily);
          }
        }
      }

      runs.push({
        text,
        bold,
        italic,
        highlight,
        color,
        fontFamily,
      });
      return;
    }

    const next: Partial<StyledRun> = { ...inherited };
    // Some schemas put italic on the node itself — ignore; marks are authoritative.
    for (const child of n.content ?? []) {
      walk(child, next);
    }
  }

  walk(node);
  if (runs.length === 0) {
    // Fallback: plain text extraction
    const plain = plainText(node);
    if (plain) {
      runs.push({ text: plain, fontFamily: "sans" });
    }
  }
  return runs;
}

function plainText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(plainText).join("");
}

function blockFromTipTap(node: JSONContent): StyledBlock | null {
  switch (node.type) {
    case "title":
      return {
        type: "Title",
        align: alignOf(node),
        runs: runsFromNode(node).map((r) => ({ ...r, bold: true })),
      };
    case "heading": {
      const level = node.attrs?.level === 2 ? "H2" : "H1";
      return {
        type: level,
        align: alignOf(node),
        runs: runsFromNode(node).map((r) => ({ ...r, bold: true })),
      };
    }
    case "paragraph":
      return {
        type: "Body",
        align: alignOf(node),
        runs: runsFromNode(node),
      };
    case "scripture": {
      const citation =
        typeof node.attrs?.citation === "string"
          ? node.attrs.citation
          : undefined;
      return {
        type: "Scripture",
        align: alignOf(node),
        runs: runsFromNode(node).map((r) => ({ ...r, italic: true })),
        citation,
      };
    }
    default:
      return null;
  }
}

/** Prefer TipTap `content` (marks); fall back to flat semanticBlocks. */
export function styledBlocksFromSnapshot(
  snapshot: CalibratedSnapshot,
): StyledBlock[] {
  const doc = snapshot.content as JSONContent | undefined;
  if (doc?.content && Array.isArray(doc.content) && doc.content.length > 0) {
    const out: StyledBlock[] = [];
    for (const node of doc.content) {
      const b = blockFromTipTap(node);
      if (b && (b.runs.length > 0 || b.type === "Body")) out.push(b);
    }
    if (out.length > 0) return out;
  }

  return snapshot.semanticBlocks.map((b) => ({
    type: b.type,
    align: b.type === "Caption" ? ("right" as const) : ("left" as const),
    runs: [
      {
        text: b.text,
        fontFamily: "sans" as FontFamilyId,
        bold: b.type === "Title" || b.type === "H1" || b.type === "H2",
        italic: b.type === "Scripture",
      },
    ],
    citation: b.citation,
  }));
}

export function titleTextFromSnapshot(snapshot: CalibratedSnapshot): string {
  const fromBlocks = snapshot.semanticBlocks.find((b) => b.type === "Title");
  if (fromBlocks?.text?.trim()) return fromBlocks.text.trim();
  const styled = styledBlocksFromSnapshot(snapshot).find(
    (b) => b.type === "Title",
  );
  const t = styled?.runs.map((r) => r.text).join("").trim();
  return t || "Sermon";
}

/** Append study notes as a final H1 + Body section when requested. */
export function withNotesSection(
  blocks: StyledBlock[],
  includeNotes: boolean,
  notes: string | undefined,
): StyledBlock[] {
  if (!includeNotes) return blocks;
  const text = (notes ?? "").trim();
  if (!text) return blocks;
  return [
    ...blocks,
    {
      type: "H1",
      align: "left",
      runs: [{ text: "Study Notes", bold: true, fontFamily: "sans" }],
    },
    {
      type: "Body",
      align: "left",
      runs: [{ text, fontFamily: "sans" }],
    },
  ];
}
