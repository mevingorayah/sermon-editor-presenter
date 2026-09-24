import { Node, mergeAttributes } from "@tiptap/react";

/** Sermon title block — rendered as semantic title in reading mode. */
export const Title = Node.create({
  name: "title",
  group: "block",
  content: "inline*",
  defining: true,
  draggable: false,

  parseHTML() {
    return [{ tag: "h1[data-sermon-title]" }, { tag: "title-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "h1",
      mergeAttributes(HTMLAttributes, {
        "data-sermon-title": "",
        class: "sermon-title",
      }),
      0,
    ];
  },
});
