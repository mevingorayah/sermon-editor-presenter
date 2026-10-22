import Placeholder from "@tiptap/extension-placeholder";
import { createSchemaExtensions } from "./schema";
import { Title } from "./Title";
import { Scripture } from "./Scripture";
import { PasteCleanup } from "./PasteCleanup";
import { SearchAndReplace } from "./SearchAndReplace";

export function createSermonExtensions() {
  return [
    ...createSchemaExtensions(),
    PasteCleanup,
    SearchAndReplace,
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
export { createSchemaExtensions };
