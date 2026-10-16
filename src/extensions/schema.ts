import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import {
  SermonTextStyle,
  SermonHighlight,
  SermonStrike,
  SermonSuperscript,
  SermonSubscript,
} from "./marks";
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
      strike: false,
    }),
    Title,
    Scripture,
    TextStyle,
    Color,
    SermonTextStyle,
    SermonHighlight,
    SermonStrike,
    SermonSuperscript,
    SermonSubscript,
    TextAlign.configure({
      types: ALIGNED_TYPES,
      alignments: ["left", "center", "right", "justify"],
      defaultAlignment: "left",
    }),
  ];
}
