import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
import { Title } from "./Title";
import { Scripture } from "./Scripture";
import { PasteCleanup } from "./PasteCleanup";
import { SearchAndReplace } from "./SearchAndReplace";

export function createSermonExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2] },
      codeBlock: false,
      blockquote: false,
    }),
    Title,
    Scripture,
    PasteCleanup,
    SearchAndReplace,
    TextStyle,
    Color,
    FontFamily,
    Highlight.configure({
      multicolor: false,
      HTMLAttributes: {
        class: "sermon-highlight",
      },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph", "title", "scripture"],
      alignments: ["left", "center", "right"],
      defaultAlignment: "left",
    }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "title") return "Sermon title…";
        if (node.type.name === "scripture") return "Scripture quote…";
        if (node.type.name === "heading") {
          return node.attrs.level === 1
            ? "Primary point (I, II, III…)…"
            : "Subpoint…";
        }
        return "Body prose…";
      },
    }),
  ];
}

export { Title, Scripture, PasteCleanup, SearchAndReplace };
