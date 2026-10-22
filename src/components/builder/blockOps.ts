import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface TopBlock { index: number; pos: number; node: PMNode }

export function topBlocks(editor: Editor): TopBlock[] {
  const out: TopBlock[] = [];
  editor.state.doc.forEach((node, offset, index) => out.push({ index, pos: offset, node }));
  return out;
}

/** Move top-level block `from` so it lands at index `to` (0..n). One transaction → one undo step. */
export function moveBlock(editor: Editor, from: number, to: number): boolean {
  const blocks = topBlocks(editor);
  const b = blocks[from];
  if (!b || to === from || to === from + 1) return false;
  const { state } = editor;
  let tr = state.tr.delete(b.pos, b.pos + b.node.nodeSize);
  const target = to >= blocks.length ? state.doc.content.size : blocks[to].pos;
  const mapped = tr.mapping.map(target, to > from ? 1 : -1);
  tr = tr.insert(mapped, b.node);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(editor: Editor, index: number) {
  const b = topBlocks(editor)[index];
  if (!b) return;
  const end = b.pos + b.node.nodeSize;
  editor.view.dispatch(editor.state.tr.insert(end, b.node.copy(b.node.content)).scrollIntoView());
}

export function deleteBlock(editor: Editor, index: number) {
  const blocks = topBlocks(editor);
  const b = blocks[index];
  if (!b) return;
  let tr = editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize);
  if (blocks.length === 1) tr = tr.insert(0, editor.schema.nodes.paragraph.create());
  editor.view.dispatch(tr);
}

export function setBlockAttrs(editor: Editor, index: number, attrs: Record<string, unknown>) {
  const b = topBlocks(editor)[index];
  if (!b) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(b.pos, undefined, { ...b.node.attrs, ...attrs }));
}

/** Change a text block's type, keeping its inline content (words never change). */
export function changeBlockType(editor: Editor, index: number, type: string, attrs: Record<string, unknown> = {}) {
  const b = topBlocks(editor)[index];
  const nt = editor.schema.nodes[type];
  if (!b || !nt || !b.node.isTextblock || !nt.isTextblock) return;
  const keep = { style: b.node.attrs.style ?? null, spacing: b.node.attrs.spacing ?? null, textAlign: b.node.attrs.textAlign };
  const next = nt.create({ ...keep, ...attrs }, b.node.content, b.node.marks);
  editor.view.dispatch(editor.state.tr.replaceWith(b.pos, b.pos + b.node.nodeSize, next));
}

export interface InsertDef { id: string; label: string; keywords: string; json: () => JSONContent }

const CUE_GREY = "#6B6B6B";
export const INSERT_TYPES: InsertDef[] = [
  { id: "heading1", label: "Point heading", keywords: "heading h1 point", json: () => ({ type: "heading", attrs: { level: 1 } }) },
  { id: "heading2", label: "Subpoint heading", keywords: "heading h2 sub", json: () => ({ type: "heading", attrs: { level: 2 } }) },
  { id: "paragraph", label: "Paragraph", keywords: "body text paragraph", json: () => ({ type: "paragraph" }) },
  { id: "scripture", label: "Scripture", keywords: "bible verse scripture", json: () => ({ type: "scripture", attrs: { citation: "" } }) },
  { id: "quote", label: "Quote", keywords: "quote citation", json: () => ({ type: "quote" }) },
  { id: "illustration", label: "Illustration", keywords: "story example illustration", json: () => ({ type: "illustration" }) },
  {
    id: "cue", label: "Pause cue", keywords: "pause cue stage",
    json: () => ({ type: "paragraph", content: [{ type: "text", text: "[Pause.]", marks: [{ type: "italic" }, { type: "textStyle", attrs: { color: CUE_GREY } }] }] }),
  },
  ...[1, 2, 3].map((n) => ({
    id: `section${n}`, label: `${n}-column section`, keywords: `section columns ${n}`,
    json: (): JSONContent => ({ type: "section", attrs: { columns: n }, content: Array.from({ length: n }, () => ({ type: "column", content: [{ type: "paragraph" }] })) }),
  })),
];

/** Insert a block at top-level index `at` (replace=true swaps the block there). Returns new index. */
export function insertBlockAt(editor: Editor, at: number, def: InsertDef, replace = false): number {
  const blocks = topBlocks(editor);
  const node = editor.schema.nodeFromJSON(def.json());
  const { state } = editor;
  let tr = state.tr;
  if (replace && blocks[at]) {
    tr = tr.replaceWith(blocks[at].pos, blocks[at].pos + blocks[at].node.nodeSize, node);
  } else {
    const pos = at >= blocks.length ? state.doc.content.size : blocks[at].pos;
    tr = tr.insert(pos, node);
  }
  editor.view.dispatch(tr.scrollIntoView());
  const b = topBlocks(editor)[at];
  if (b) editor.commands.focus(b.pos + 1 + (node.isTextblock ? node.content.size : 1));
  return at;
}

export const TYPE_LABEL: Record<string, string> = {
  title: "Title", heading: "Heading", paragraph: "Paragraph", scripture: "Scripture",
  quote: "Quote", illustration: "Illustration", section: "Section",
};
