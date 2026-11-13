import { Node, mergeAttributes } from "@tiptap/core";
import { DEFAULT_TRANSLATION } from "./types";
import { currentPassageText, normalizeTextMap } from "./texts";

/**
 * Schema-only `verseSnippet` node (no editor NodeView, no CSS).
 * Shared by Edit, Preach, `.sermon` checks and unit tests.
 * The editor adds the React view in `createSermonExtensions`.
 */
export const VerseSnippet = Node.create({
  name: "verseSnippet",
  group: "block",
  atom: true,
  defining: true,
  isolating: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      ref: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ref") ?? "",
        renderHTML: (attributes) => {
          if (!attributes.ref) return {};
          return { "data-ref": attributes.ref as string };
        },
      },
      translation: {
        default: DEFAULT_TRANSLATION,
        parseHTML: (element) =>
          element.getAttribute("data-translation") ?? DEFAULT_TRANSLATION,
        renderHTML: (attributes) => {
          if (!attributes.translation) return {};
          return { "data-translation": attributes.translation as string };
        },
      },
      texts: {
        default: {},
        parseHTML: (element) => normalizeTextMap(element.getAttribute("data-texts")),
        renderHTML: (attributes) => {
          const texts = normalizeTextMap(attributes.texts);
          if (Object.keys(texts).length === 0) return {};
          return { "data-texts": JSON.stringify(texts) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-verse-snippet]" }, { tag: "verse-snippet" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const text = currentPassageText(node.attrs);
    const attrs = mergeAttributes(HTMLAttributes, {
      "data-verse-snippet": "",
      class: "verse-snippet",
    });
    if (!text) return ["div", attrs];
    return ["div", attrs, ["p", { class: "verse-snippet-quote" }, text]];
  },
});
