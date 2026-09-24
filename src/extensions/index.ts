import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Title } from "./Title";
import { Scripture } from "./Scripture";
import { PasteCleanup } from "./PasteCleanup";

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

export { Title, Scripture, PasteCleanup };
