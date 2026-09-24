import type { JSONContent } from "@tiptap/react";
import type { SemanticBlock } from "@/types/document";

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(textOf).join("");
}

/** Flatten TipTap JSON into Backend-friendly semantic blocks. */
export function toSemanticBlocks(doc: JSONContent | null | undefined): SemanticBlock[] {
  if (!doc?.content) return [];
  const blocks: SemanticBlock[] = [];
  for (const node of doc.content) {
    switch (node.type) {
      case "title":
        blocks.push({ type: "Title", text: textOf(node) });
        break;
      case "heading": {
        const level = node.attrs?.level === 2 ? "H2" : "H1";
        blocks.push({ type: level, text: textOf(node) });
        break;
      }
      case "paragraph":
        blocks.push({ type: "Body", text: textOf(node) });
        break;
      case "scripture": {
        const citation =
          typeof node.attrs?.citation === "string" ? node.attrs.citation : undefined;
        blocks.push({
          type: "Scripture",
          text: textOf(node),
          citation,
        });
        break;
      }
      default:
        break;
    }
  }
  return blocks;
}
