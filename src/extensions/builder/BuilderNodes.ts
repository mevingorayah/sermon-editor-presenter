import { Node, mergeAttributes } from "@tiptap/core";

/** Quote block (non-Scripture quotation). */
export const Quote = Node.create({
  name: "quote",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return { source: { default: "", renderHTML: (a) => (a.source ? { "data-source": a.source } : {}), parseHTML: (el) => el.getAttribute("data-source") ?? "" } };
  },
  parseHTML: () => [{ tag: "blockquote[data-quote]" }],
  renderHTML: ({ HTMLAttributes }) => ["blockquote", mergeAttributes(HTMLAttributes, { "data-quote": "", class: "sermon-quote" }), 0],
});

/** Illustration block (story / example). */
export const Illustration = Node.create({
  name: "illustration",
  group: "block",
  content: "inline*",
  defining: true,
  parseHTML: () => [{ tag: "div[data-illustration]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-illustration": "", class: "sermon-illustration" }), 0],
});

/** Column inside a Section. */
export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,
  parseHTML: () => [{ tag: "div[data-column]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-column": "", class: "sermon-column" }), 0],
});

/** Section with 1–3 columns. Slice 1: layout + insert; resizing is later. */
export const Section = Node.create({
  name: "section",
  group: "block",
  content: "column{1,3}",
  isolating: true,
  addAttributes() {
    return {
      columns: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-columns")) || 1,
        renderHTML: (a) => ({ "data-columns": String(a.columns) }),
      },
    };
  },
  parseHTML: () => [{ tag: "section[data-section]" }],
  renderHTML: ({ HTMLAttributes }) => ["section", mergeAttributes(HTMLAttributes, { "data-section": "", class: "sermon-section" }), 0],
});

export const BUILDER_NODES = [Quote, Illustration, Column, Section];
