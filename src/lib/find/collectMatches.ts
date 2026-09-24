import type { Node as PMNode } from "@tiptap/pm/model";

export type TextRange = { from: number; to: number };

/**
 * Collect literal substring matches inside textblocks only.
 * Does not cross block boundaries; preserves custom block structure on replace.
 * Scripture citation attributes are not searched (quote body text is).
 */
export function collectMatches(
  doc: PMNode,
  query: string,
  caseSensitive: boolean,
): TextRange[] {
  if (!query) return [];

  const matches: TextRange[] = [];
  const needle = caseSensitive ? query : query.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;

    const text = node.textBetween(0, node.content.size, undefined, "\ufffc");
    const haystack = caseSensitive ? text : text.toLowerCase();
    let fromIndex = 0;

    while (fromIndex <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, fromIndex);
      if (found === -1) break;

      // Skip matches that intersect object-replacement chars (atomic inlines).
      const slice = text.slice(found, found + query.length);
      if (!slice.includes("\ufffc")) {
        const from = pos + 1 + found;
        matches.push({ from, to: from + query.length });
      }

      fromIndex = found + Math.max(needle.length, 1);
    }
  });

  return matches;
}
