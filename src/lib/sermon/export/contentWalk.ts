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
  underline?: boolean;
  strike?: boolean;
  color?: string; // #RRGGBB
  fontFamily: FontFamilyId;
  /** True when the text carries its own font choice (not the document default). */
  fontExplicit?: boolean;
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

const OPENING_BRACKET = /[([{«‹“‘„¿¡]$/u;

/**
 * "( Galates 1.8)": a styled run that starts with whitespace right after an
 * opening bracket (in the previous run) is drawn without that leading gap.
 * Mutates `runs`; runs left empty are removed.
 */
export function trimAfterOpeningBracket(runs: StyledRun[]): void {
  for (let i = 1; i < runs.length; i++) {
    let p = i - 1;
    while (p >= 0 && !runs[p].text) p--;
    if (p < 0 || !OPENING_BRACKET.test(runs[p].text)) continue;
    runs[i].text = runs[i].text.replace(/^[\s\u00A0\u202F\u2009\u2007]+/u, "");
  }
  for (let i = runs.length - 1; i >= 0; i--) if (!runs[i].text) runs.splice(i, 1);
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
      let underline = inherited.underline;
      let strike = inherited.strike;
      let color = inherited.color;
      let fontFamily = inherited.fontFamily ?? ("sans" as FontFamilyId);
      let fontExplicit = inherited.fontExplicit;

      for (const mark of n.marks ?? []) {
        if (mark.type === "bold") bold = true;
        if (mark.type === "italic") italic = true;
        if (mark.type === "highlight") highlight = true;
        if (mark.type === "underline") underline = true;
        if (mark.type === "strike") strike = true;
        if (mark.type === "textStyle") {
          const attrs = mark.attrs ?? {};
          if (typeof attrs.color === "string") {
            color = toHexRgb(attrs.color) ?? color;
          }
          if (typeof attrs.fontFamily === "string") {
            fontFamily = mapFontFamily(attrs.fontFamily);
            fontExplicit = true;
          }
        }
      }

      runs.push({
        text,
        bold,
        italic,
        highlight,
        underline,
        strike,
        color,
        fontFamily,
        fontExplicit,
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
  trimAfterOpeningBracket(runs);
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

/** Scripture citations print in capitals in every export, matching Preach (#5). */
export function citationCaps(citation: string): string {
  return citation.toLocaleUpperCase("fr");
}

/**
 * Split styled runs into chunks of at most ~maxChars characters, breaking
 * after a sentence end when possible, otherwise at a space. Marks are kept
 * on every piece, and no characters are added or lost.
 */
export function chunkRuns(runs: StyledRun[], maxChars: number): StyledRun[][] {
  const text = runs.map((r) => r.text).join("");
  if (text.length <= maxChars) return [runs];
  const cuts: number[] = [];
  let start = 0;
  while (text.length - start > maxChars) {
    const window = text.slice(start, start + maxChars);
    let cut = -1;
    const re = /[.!?»;:]\s/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(window))) cut = m.index + m[0].length;
    if (cut < maxChars * 0.4) {
      const sp = window.lastIndexOf(" ");
      cut = sp > 0 ? sp + 1 : maxChars;
    }
    start += cut;
    cuts.push(start);
  }
  const out: StyledRun[][] = [];
  let pos = 0;
  let ci = 0;
  let cur: StyledRun[] = [];
  for (const run of runs) {
    let t = run.text;
    let runStart = pos;
    while (ci < cuts.length && cuts[ci] < runStart + t.length) {
      const k = cuts[ci] - runStart;
      if (k > 0) cur.push({ ...run, text: t.slice(0, k) });
      out.push(cur);
      cur = [];
      t = t.slice(k);
      runStart = cuts[ci];
      ci++;
    }
    if (t) cur.push({ ...run, text: t });
    pos += run.text.length;
  }
  if (cur.length) out.push(cur);
  return out.filter((c) => c.length > 0);
}
