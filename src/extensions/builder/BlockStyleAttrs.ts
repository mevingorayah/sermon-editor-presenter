import { Extension } from "@tiptap/core";
import {
  FIELD, STYLED_TYPES, blockCss, sanitizeSpacing, sanitizeStyle,
  type BlockSpacing, type BlockStyle,
} from "../../lib/builder/blockAttrs";

function readJson(el: HTMLElement, name: string): unknown {
  const raw = el.getAttribute(name);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Per-block style + spacing as node attrs (default null = global). Renders
 * as inline CSS only when set, so untouched blocks render identically.
 */
export const BlockStyleAttrs = Extension.create({
  name: "blockStyleAttrs",
  addGlobalAttributes() {
    return [
      {
        types: STYLED_TYPES,
        attributes: {
          [FIELD.style]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => sanitizeStyle(readJson(el, "data-block-style") as BlockStyle),
            renderHTML: (attrs) => {
              const s = sanitizeStyle(attrs[FIELD.style] as BlockStyle);
              if (!s) return {};
              return { "data-block-style": JSON.stringify(s), style: blockCss(s, null) };
            },
          },
          [FIELD.spacing]: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => sanitizeSpacing(readJson(el, "data-block-spacing") as BlockSpacing),
            renderHTML: (attrs) => {
              const s = sanitizeSpacing(attrs[FIELD.spacing] as BlockSpacing);
              if (!s) return {};
              return { "data-block-spacing": JSON.stringify(s), style: blockCss(null, s) };
            },
          },
        },
      },
    ];
  },
});
