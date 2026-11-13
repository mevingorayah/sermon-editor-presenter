import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
import { Title } from "./Title";
import { Scripture } from "./Scripture";
import { letterSpacingCss, lineSpacingCss, SPACING_BLOCK_TYPES } from "@/lib/writing/spacing";
import { VerseSnippet } from "@/lib/sermon/verseSnippet";

/** Node types that carry TextAlign. Shared by Edit and Preach. */
export const ALIGNED_TYPES = ["heading", "paragraph", "title", "scripture"];

const TextStyleWithSpacing = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      letterSpacing: {
        default: null,
        parseHTML: (el) => letterSpacingCss(el.style.letterSpacing) ,
        renderHTML: (attrs) => {
          const v = letterSpacingCss(attrs.letterSpacing);
          return v ? { style: `letter-spacing: ${v}` } : {};
        },
      },
      lineSpacing: {
        default: null,
        parseHTML: (el) => lineSpacingCss(el.style.lineHeight),
        renderHTML: (attrs) => {
          const v = lineSpacingCss(attrs.lineSpacing);
          return v ? { style: `line-height: ${v}` } : {};
        },
      },
      preset: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-color-preset"),
        renderHTML: (attrs) =>
          attrs.preset ? { "data-color-preset": attrs.preset } : {},
      },
    };
  },
});

const MulticolorHighlight = Highlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      preset: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-preset"),
        renderHTML: (attrs) => (attrs.preset ? { "data-preset": attrs.preset } : {}),
      },
    };
  },
}).configure({
  multicolor: true,
  HTMLAttributes: {
    class: "sermon-highlight",
  },
});

/** Paragraph / heading / title / scripture letter-spacing and line-spacing attrs. */
const BlockSpacing = Extension.create({
  name: "blockSpacing",
  addGlobalAttributes() {
    return [
      {
        types: [...SPACING_BLOCK_TYPES],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (el) => letterSpacingCss(el.style.letterSpacing),
            renderHTML: (attrs) => {
              const v = letterSpacingCss(attrs.letterSpacing);
              return v ? { style: `letter-spacing: ${v}` } : {};
            },
          },
          lineSpacing: {
            default: null,
            parseHTML: (el) => lineSpacingCss(el.style.lineHeight),
            renderHTML: (attrs) => {
              const v = lineSpacingCss(attrs.lineSpacing);
              return v ? { style: `line-height: ${v}` } : {};
            },
          },
        },
      },
    ];
  },
});

/**
 * The document schema shared by Edit (SermonEditor) and Preach (ReadingView):
 * every node and mark a sermon can contain. Editor-only behaviour
 * (Placeholder, PasteCleanup, SearchAndReplace) is added in index.ts.
 */
export function createSchemaExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2] },
      codeBlock: false,
      blockquote: false,
    }),
    Title,
    Scripture,
    VerseSnippet,
    TextStyleWithSpacing,
    Color,
    FontFamily,
    MulticolorHighlight,
    TextAlign.configure({
      types: ALIGNED_TYPES,
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
    BlockSpacing,
  ];
}
