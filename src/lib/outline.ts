import type { JSONContent } from "@tiptap/react";

export interface OutlineItem {
  id: string;
  level: 0 | 1 | 2; // 0 = title
  text: string;
  posHint: number; // sequential index among outline nodes
}

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(textOf).join("");
}

/** Derive outline nav from Title + H1/H2 headings. */
export function extractOutline(doc: JSONContent | null | undefined): OutlineItem[] {
  if (!doc?.content) return [];
  const items: OutlineItem[] = [];
  let i = 0;
  for (const node of doc.content) {
    if (node.type === "title") {
      items.push({
        id: `outline-${i}`,
        level: 0,
        text: textOf(node) || "Untitled",
        posHint: i,
      });
      i += 1;
    } else if (node.type === "heading") {
      const level = node.attrs?.level === 2 ? 2 : 1;
      items.push({
        id: `outline-${i}`,
        level,
        text: textOf(node) || (level === 1 ? "Point" : "Subpoint"),
        posHint: i,
      });
      i += 1;
    }
  }
  return items;
}
