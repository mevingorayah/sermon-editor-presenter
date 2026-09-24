"use client";

import {
  Node,
  mergeAttributes,
  NodeViewWrapper,
  NodeViewContent,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import type { CSSProperties } from "react";
import { cssTextToReactStyle } from "../lib/cssText";

function ScriptureView({
  node,
  updateAttributes,
  selected,
  HTMLAttributes,
}: NodeViewProps) {
  const citation = (node.attrs.citation as string) || "";
  // TipTap renders global attributes (e.g. TextAlign → `style: "text-align: left"`)
  // as a CSS *string*. NodeViewWrapper spreads `props.style` into an object, so a
  // string must never reach it (spread → {0:"t",1:"e",…} → CSSStyleDeclaration
  // indexed-setter crash in Chromium). Convert it to a React style object.
  const {
    class: _htmlClass,
    style: rawStyle,
    ...restAttrs
  } = HTMLAttributes as Record<string, unknown> & {
    class?: string;
    style?: unknown;
  };
  void _htmlClass;
  // HTMLAttributes is only computed at NodeView mount (not refreshed on update),
  // so take live alignment from node.attrs; keep any other declarations.
  const textAlign = node.attrs.textAlign as CSSProperties["textAlign"] | null;
  const baseStyle = cssTextToReactStyle(rawStyle);
  const style: CSSProperties | undefined =
    baseStyle || textAlign
      ? { ...baseStyle, ...(textAlign ? { textAlign } : {}) }
      : undefined;
  if (style && !textAlign) delete style.textAlign;
  return (
    <NodeViewWrapper
      {...restAttrs}
      as="div"
      className={`sermon-scripture${selected ? " is-selected" : ""}`}
      data-scripture=""
      data-citation={citation}
      style={style}
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
