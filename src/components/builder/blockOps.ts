import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface TopBlock { index: number; pos: number; node: PMNode }

export function topBlocks(editor: Editor): TopBlock[] {
  const out: TopBlock[] = [];
  editor.state.doc.forEach((node, offset, index) => out.push({ index, pos: offset, node }));
  return out;
}

/** A movable/stylable block: a top-level node, or a child sitting in a section column. */
export interface BlockRef {
  pos: number;
  node: PMNode;
  parentPos: number | null;
  parentType: "doc" | "column";
}

export function collectBlocks(editor: Editor): BlockRef[] {
  const out: BlockRef[] = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === "section") {
      out.push({ pos: offset, node, parentPos: null, parentType: "doc" });
      node.forEach((col, colOffset) => {
        if (col.type.name !== "column") return;
        const colPos = offset + 1 + colOffset;
        col.forEach((child, childOffset) => {
          out.push({
            pos: colPos + 1 + childOffset,
            node: child,
            parentPos: colPos,
            parentType: "column",
          });
        });
      });
    } else {
      out.push({ pos: offset, node, parentPos: null, parentType: "doc" });
    }
  });
  return out;
}

/** Innermost movable block that contains the caret (nested column children win). */
export function blockAtSelection(editor: Editor): BlockRef | undefined {
  const pos = editor.state.selection.$from.pos;
  let hit: BlockRef | undefined;
  for (const b of collectBlocks(editor)) {
    if (pos >= b.pos && pos <= b.pos + b.node.nodeSize) hit = b;
  }
  return hit;
}

export function docPlainText(editor: Editor): string {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n", "\n");
}

export function nodePlainText(node: PMNode): string {
  return node.textBetween(0, node.content.size, "\n", "\n");
}

function nodeAt(editor: Editor, pos: number): PMNode | null {
  return editor.state.doc.nodeAt(pos);
}

/** True when `inner` sits inside the node at `outerPos`. */
function isInside(outerPos: number, outerSize: number, inner: number): boolean {
  return inner > outerPos && inner < outerPos + outerSize;
}

/**
 * Move the node at `fromPos` so it is inserted at `insertPos`.
 * The same node (and every word in it) is reused; one transaction → one undo step.
 * Refuses to nest a section inside a section, or to move a node into itself.
 * A column that would be left empty keeps an empty paragraph.
 */
export function moveNode(editor: Editor, fromPos: number, insertPos: number): boolean {
  const { state } = editor;
  const node = state.doc.nodeAt(fromPos);
  if (!node) return false;
  const fromEnd = fromPos + node.nodeSize;
  if (insertPos === fromPos || insertPos === fromEnd) return false;
  if (isInside(fromPos, node.nodeSize, insertPos)) return false;
  if (node.type.name === "section") {
    const $ins = state.doc.resolve(Math.min(insertPos, state.doc.content.size));
    for (let d = $ins.depth; d > 0; d--) {
      if ($ins.node(d).type.name === "section" || $ins.node(d).type.name === "column") return false;
    }
  }
  const $from = state.doc.resolve(fromPos);
  const sourceParent = $from.parent;
  const sourceIndex = $from.index();
  const sourceParentIsColumn = sourceParent.type.name === "column";
  const emptyingColumn = sourceParentIsColumn && sourceParent.childCount === 1;

  let tr = state.tr.delete(fromPos, fromEnd);
  if (emptyingColumn) {
    const para = editor.schema.nodes.paragraph.create();
    // After delete, the empty column still exists at the mapped parent start.
    const colStart = tr.mapping.map($from.before($from.depth), -1);
    tr = tr.insert(colStart + 1, para);
  }
  const mapped = tr.mapping.map(insertPos, insertPos > fromPos ? -1 : 1);
  if (mapped < 0 || mapped > tr.doc.content.size) return false;
  // Re-check we are not inserting a section into a column after mapping.
  if (node.type.name === "section") {
    const $m = tr.doc.resolve(Math.min(mapped, tr.doc.content.size));
    for (let d = $m.depth; d > 0; d--) {
      if ($m.node(d).type.name === "section" || $m.node(d).type.name === "column") return false;
    }
  }
  tr = tr.insert(mapped, node);
  editor.view.dispatch(tr.scrollIntoView());
  void sourceIndex;
  return true;
}

/** Move top-level block `from` so it lands at index `to` (0..n). One transaction → one undo step. */
export function moveBlock(editor: Editor, from: number, to: number): boolean {
  const blocks = topBlocks(editor);
  const b = blocks[from];
  if (!b || to === from || to === from + 1) return false;
  const target = to >= blocks.length ? editor.state.doc.content.size : blocks[to].pos;
  return moveNode(editor, b.pos, target);
}

/** Move a block one step among its siblings (keyboard / ↑↓). */
export function moveBlockInParent(editor: Editor, pos: number, dir: -1 | 1): boolean {
  const $pos = editor.state.doc.resolve(pos);
  const index = $pos.index();
  const parent = $pos.parent;
  const next = index + dir;
  if (next < 0 || next >= parent.childCount) return false;
  const sibling = parent.child(next);
  const siblingPos = dir === -1 ? pos - sibling.nodeSize : pos + $pos.nodeAfter!.nodeSize;
  // Moving down: insert after the next sibling; moving up: insert at the sibling's pos.
  const insertPos = dir === 1 ? siblingPos + sibling.nodeSize : siblingPos;
  return moveNode(editor, pos, insertPos);
}

export function duplicateBlockAt(editor: Editor, pos: number) {
  const node = nodeAt(editor, pos);
  if (!node) return;
  const end = pos + node.nodeSize;
  editor.view.dispatch(editor.state.tr.insert(end, node.copy(node.content)).scrollIntoView());
}

export function duplicateBlock(editor: Editor, index: number) {
  const b = topBlocks(editor)[index];
  if (b) duplicateBlockAt(editor, b.pos);
}

export function deleteBlockAt(editor: Editor, pos: number) {
  const { state } = editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return;
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  let tr = state.tr.delete(pos, pos + node.nodeSize);
  if (parent.type.name === "doc" && parent.childCount === 1) {
    tr = tr.insert(0, editor.schema.nodes.paragraph.create());
  } else if (parent.type.name === "column" && parent.childCount === 1) {
    const colStart = tr.mapping.map($pos.before($pos.depth), -1);
    tr = tr.insert(colStart + 1, editor.schema.nodes.paragraph.create());
  }
  editor.view.dispatch(tr);
}

export function deleteBlock(editor: Editor, index: number) {
  const b = topBlocks(editor)[index];
  if (b) deleteBlockAt(editor, b.pos);
}

export function setBlockAttrsAt(editor: Editor, pos: number, attrs: Record<string, unknown>) {
  const node = nodeAt(editor, pos);
  if (!node) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }));
}

export function setBlockAttrs(editor: Editor, index: number, attrs: Record<string, unknown>) {
  const b = topBlocks(editor)[index];
  if (b) setBlockAttrsAt(editor, b.pos, attrs);
}

/** Change a text block's type, keeping its inline content (words never change). */
export function changeBlockTypeAt(editor: Editor, pos: number, type: string, attrs: Record<string, unknown> = {}) {
  const node = nodeAt(editor, pos);
  const nt = editor.schema.nodes[type];
  if (!node || !nt || !node.isTextblock || !nt.isTextblock) return;
  const keep = { style: node.attrs.style ?? null, spacing: node.attrs.spacing ?? null, textAlign: node.attrs.textAlign };
  const next = nt.create({ ...keep, ...attrs }, node.content, node.marks);
  editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, next));
}

export function changeBlockType(editor: Editor, index: number, type: string, attrs: Record<string, unknown> = {}) {
  const b = topBlocks(editor)[index];
  if (b) changeBlockTypeAt(editor, b.pos, type, attrs);
}

/**
 * Change a section's column count. Extra columns start with an empty paragraph.
 * Shrinking merges leftover column children into the last remaining column
 * (words are never dropped).
 */
export function setSectionColumns(editor: Editor, sectionPos: number, columns: 1 | 2 | 3) {
  const section = nodeAt(editor, sectionPos);
  if (!section || section.type.name !== "section") return;
  const current = section.childCount;
  if (columns === current) {
    setBlockAttrsAt(editor, sectionPos, { columns });
    return;
  }
  const colType = editor.schema.nodes.column;
  const para = editor.schema.nodes.paragraph.create();
  const cols: PMNode[] = [];
  for (let i = 0; i < Math.min(columns, current); i++) cols.push(section.child(i));
  if (columns > current) {
    for (let i = current; i < columns; i++) cols.push(colType.create(null, para));
  } else {
    const last = cols[cols.length - 1];
    const extras: PMNode[] = [];
    last.forEach((child) => extras.push(child));
    for (let i = columns; i < current; i++) {
      section.child(i).forEach((child) => extras.push(child));
    }
    cols[cols.length - 1] = colType.create(last.attrs, extras);
  }
  const next = editor.schema.nodes.section.create({ ...section.attrs, columns }, cols);
  editor.view.dispatch(editor.state.tr.replaceWith(sectionPos, sectionPos + section.nodeSize, next));
}

export interface InsertDef { id: string; label: string; keywords: string; json: () => JSONContent }

const CUE_GREY = "#6B6B6B";
export const INSERT_TYPES: InsertDef[] = [
  { id: "heading1", label: "Point heading", keywords: "heading h1 point", json: () => ({ type: "heading", attrs: { level: 1 } }) },
  { id: "heading2", label: "Subpoint heading", keywords: "heading h2 sub", json: () => ({ type: "heading", attrs: { level: 2 } }) },
  { id: "paragraph", label: "Paragraph", keywords: "body text paragraph", json: () => ({ type: "paragraph" }) },
  { id: "scripture", label: "Scripture", keywords: "bible verse scripture", json: () => ({ type: "scripture", attrs: { citation: "" } }) },
  { id: "verseSnippet", label: "Verse snippet", keywords: "bible verse snippet lsg web", json: () => ({ type: "verseSnippet", attrs: { ref: "", translation: "LSG", texts: {} } }) },
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

/** Insert a block as a child of a column, at child index `at` (0..n). */
export function insertBlockInColumn(editor: Editor, colPos: number, at: number, def: InsertDef): number {
  const col = nodeAt(editor, colPos);
  if (!col || col.type.name !== "column") return at;
  const node = editor.schema.nodeFromJSON(def.json());
  if (node.type.name === "section") return at;
  let offset = colPos + 1;
  for (let i = 0; i < at && i < col.childCount; i++) offset += col.child(i).nodeSize;
  if (at >= col.childCount) offset = colPos + col.nodeSize - 1;
  editor.view.dispatch(editor.state.tr.insert(offset, node).scrollIntoView());
  return at;
}

export const TYPE_LABEL: Record<string, string> = {
  title: "Title", heading: "Heading", paragraph: "Paragraph", scripture: "Scripture",
  verseSnippet: "Verse snippet",
  quote: "Quote", illustration: "Illustration", section: "Section",
};

/** Drop destination: a document gap (insert pos) or a slot inside a column. */
export type DropTarget =
  | { kind: "gap"; pos: number }
  | { kind: "column"; colPos: number; index: number; pos: number };

export function applyDrop(editor: Editor, fromPos: number, target: DropTarget): boolean {
  return moveNode(editor, fromPos, target.pos);
}
