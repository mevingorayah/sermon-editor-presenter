"use client";

import {
  Node,
  mergeAttributes,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

function ScriptureView({ node, updateAttributes, selected }: NodeViewProps) {
  const citation = (node.attrs.citation as string) || "";
  return (
    <NodeViewWrapper
      as="div"
      className={`sermon-scripture${selected ? " is-selected" : ""}`}
      data-scripture=""
      data-citation={citation}
    >
      <label className="sermon-scripture-citation-field">
        <span className="visually-hidden">Citation</span>
        <input
          type="text"
          className="sermon-scripture-citation-input"
          value={citation}
          placeholder="Citation (e.g. John 3:16 ESV)"
          onChange={(e) => updateAttributes({ citation: e.target.value })}
          contentEditable={false}
        />
      </label>
      <NodeViewContent className="sermon-scripture-quote" />
    </NodeViewWrapper>
  );
}

/** Scripture block: citation label + quote body. */
export const Scripture = Node.create({
  name: "scripture",
  group: "block",
  content: "inline*",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      citation: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-citation") ?? "",
        renderHTML: (attributes) => {
          if (!attributes.citation) return {};
          return { "data-citation": attributes.citation as string };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "blockquote[data-scripture]" }, { tag: "scripture-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "blockquote",
      mergeAttributes(HTMLAttributes, {
        "data-scripture": "",
        class: "sermon-scripture",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ScriptureView);
  },
});
