import Placeholder from "@tiptap/extension-placeholder";
import { createSchemaExtensions } from "./schema";
import { Title } from "./Title";
import { Scripture } from "./Scripture";
import { PasteCleanup } from "./PasteCleanup";
import { SearchAndReplace } from "./SearchAndReplace";
import { VerseSnippet as VerseSnippetEditable } from "@/components/edit/VerseSnippetNode";

export function createSermonExtensions() {
  return [
    ...createSchemaExtensions().map((ext) =>
      ext.name === "verseSnippet" ? VerseSnippetEditable : ext,
    ),
    PasteCleanup,
    SearchAndReplace,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "title") return "Sermon title…";
        if (node.type.name === "scripture") return "Scripture quote…";
        if (node.type.name === "verseSnippet") return "Verse reference…";
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
