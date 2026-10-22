/**
 * Bake sermon.globalStyles into each block's attrs.style / attrs.spacing
 * (block values win), so Preach, page view and every export payload render
 * a block exactly as Edit shows it — without needing globalStyles alongside.
 *
 * Returns the SAME object when there is nothing to apply, so old sermons
 * render and export exactly as before.
 */
import type { JSONContent } from "@tiptap/core";
import type { BlockType, GlobalStyles } from "../sermon/blockStyle";
import { FIELD, STYLED_TYPES } from "./blockAttrs";

const STYLED = new Set(STYLED_TYPES);

function hasAny(o: object | undefined | null): boolean {
  return !!o && Object.keys(o).length > 0;
}

export function resolveBuilderStyles<T extends JSONContent>(
  content: T,
  globalStyles: GlobalStyles | null | undefined,
): T {
  if (!globalStyles || !Object.values(globalStyles).some((g) => hasAny(g?.style) || hasAny(g?.spacing))) {
    return content;
  }
  const walk = (node: JSONContent): JSONContent => {
    let next = node;
    const type = node.type ?? "";
    const g = STYLED.has(type) ? globalStyles[type as BlockType] : undefined;
    if (g && (hasAny(g.style) || hasAny(g.spacing))) {
      const attrs = { ...(node.attrs ?? {}) };
      const own = (attrs[FIELD.style] ?? {}) as object;
      const ownSp = (attrs[FIELD.spacing] ?? {}) as object;
      if (hasAny(g.style)) attrs[FIELD.style] = { ...g.style, ...own };
      if (hasAny(g.spacing)) attrs[FIELD.spacing] = { ...g.spacing, ...ownSp };
      next = { ...node, attrs };
    }
    if (node.content) {
      const kids = node.content.map(walk);
      if (kids.some((k, i) => k !== node.content![i])) next = { ...next, content: kids };
    }
    return next;
  };
  return walk(content) as T;
}
