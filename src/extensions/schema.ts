import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
import { Title } from "./Title";
import { Scripture } from "./Scripture";

/** Node types that carry TextAlign. Shared by Edit and Preach. */
export const ALIGNED_TYPES = ["heading", "paragraph", "title", "scripture"];

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
      types: ALIGNED_TYPES,
      alignments: ["left", "center", "right"],
      defaultAlignment: "left",
    }),
  ];
}
