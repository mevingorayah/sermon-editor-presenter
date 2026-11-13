/**
 * Block move / duplicate / delete never change the words (made-up fixtures only).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { createSchemaExtensions } from "@/extensions/schema";
import {
  collectBlocks, deleteBlockAt, docPlainText, duplicateBlockAt, insertBlockAt, INSERT_TYPES,
  moveBlock, moveNode, setSectionColumns, topBlocks,
} from "@/components/builder/blockOps";
import { stripDefaultBuilderAttrs } from "../blockAttrs";

const text = (t: string) => ({ type: "text" as const, text: t });
const para = (t: string) => ({ type: "paragraph", content: [text(t)] });
const col = (...blocks: object[]) => ({ type: "column", content: blocks });

function editorWith(content: object): Editor {
  return new Editor({
    extensions: createSchemaExtensions(),
    content,
    editable: false,
  });
}

function words(ed: Editor): string {
  return docPlainText(ed);
}

describe("moving and duplicating a block never changes its words", () => {
  let ed: Editor;
  before(() => {
    ed = editorWith({
      type: "doc",
      content: [para("Alpha block"), para("Bravo block"), para("Charlie block")],
    });
  });
  after(() => ed.destroy());

  it("move down and back leaves every word identical", () => {
    const before = words(ed);
    assert.equal(before, "Alpha block\nBravo block\nCharlie block");
    assert.equal(moveBlock(ed, 0, 3), true); // Alpha to end
    assert.equal(words(ed), "Bravo block\nCharlie block\nAlpha block");
    assert.equal(moveBlock(ed, 2, 0), true);
    assert.equal(words(ed), before);
  });

  it("duplicate then delete restores the original words and order", () => {
    const before = words(ed);
    const n = topBlocks(ed).length;
    duplicateBlockAt(ed, topBlocks(ed)[1].pos); // Bravo
    assert.equal(topBlocks(ed).length, n + 1);
    assert.equal(words(ed), "Alpha block\nBravo block\nBravo block\nCharlie block");
    // Delete the duplicate (index 2)
    deleteBlockAt(ed, topBlocks(ed)[2].pos);
    assert.equal(words(ed), before);
  });
});

describe("dropping a block into a section column", () => {
  it("places the block in the column and keeps every word", () => {
    const ed = editorWith({
      type: "doc",
      content: [
        para("Outside phrase"),
        {
          type: "section",
          attrs: { columns: 2 },
          content: [
            col(para("Left column")),
            col(para("Right column")),
          ],
        },
      ],
    });
    const before = words(ed);
    const outside = topBlocks(ed)[0];
    // First column starts after the section node open + first column open
    const section = topBlocks(ed)[1];
    const firstColPos = section.pos + 1;
    const firstCol = ed.state.doc.nodeAt(firstColPos);
    assert.equal(firstCol?.type.name, "column");
    const insertAt = firstColPos + firstCol!.nodeSize - 1; // end of first column
    assert.equal(moveNode(ed, outside.pos, insertAt), true);
    // Words are preserved; Outside now sits after Left in the first column.
    assert.equal(words(ed), "Left column\nOutside phrase\nRight column");
    assert.notEqual(words(ed), before);
    const inner = collectBlocks(ed).filter((b) => b.parentType === "column");
    assert.equal(inner.some((b) => nodePlain(b.node) === "Outside phrase"), true);
    assert.equal(inner.some((b) => nodePlain(b.node) === "Left column"), true);
    ed.destroy();
  });

  it("refuses to nest a section inside a column", () => {
    const ed = editorWith({
      type: "doc",
      content: [
        {
          type: "section",
          attrs: { columns: 1 },
          content: [col(para("One"))],
        },
        {
          type: "section",
          attrs: { columns: 2 },
          content: [col(para("A")), col(para("B"))],
        },
      ],
    });
    const first = topBlocks(ed)[0];
    const second = topBlocks(ed)[1];
    const colPos = second.pos + 1;
    const colNode = ed.state.doc.nodeAt(colPos)!;
    assert.equal(moveNode(ed, first.pos, colPos + colNode.nodeSize - 1), false);
    assert.equal(words(ed), "One\nA\nB");
    ed.destroy();
  });
});

describe("setSectionColumns keeps words when shrinking or growing", () => {
  it("merges leftover column children into the last remaining column", () => {
    const ed = editorWith({
      type: "doc",
      content: [
        {
          type: "section",
          attrs: { columns: 3 },
          content: [col(para("One")), col(para("Two")), col(para("Three"))],
        },
      ],
    });
    const pos = topBlocks(ed)[0].pos;
    setSectionColumns(ed, pos, 1);
    const section = ed.state.doc.child(0);
    assert.equal(section.attrs.columns, 1);
    assert.equal(section.childCount, 1);
    assert.equal(words(ed), "One\nTwo\nThree");
    setSectionColumns(ed, topBlocks(ed)[0].pos, 3);
    assert.equal(ed.state.doc.child(0).childCount, 3);
    // New columns start with an empty paragraph; the original words stay.
    assert.equal(words(ed).split("\n").filter(Boolean).join("\n"), "One\nTwo\nThree");
    assert.equal(ed.state.doc.child(0).child(1).childCount, 1);
    assert.equal(ed.state.doc.child(0).child(1).child(0).textContent, "");
    ed.destroy();
  });
});

describe("plain documents migrate to builder blocks without changing words", () => {
  it("loading a plain fixture and stripping default attrs is lossless", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "title", content: [text("Sample title")] },
        { type: "heading", attrs: { level: 1 }, content: [text("Point one")] },
        { type: "paragraph", content: [text("A made-up phrase.")] },
        { type: "scripture", attrs: { citation: "Book 1:1" }, content: [text("A made-up verse.")] },
      ],
    };
    const ed = editorWith(doc);
    const json = stripDefaultBuilderAttrs(ed.getJSON());
    const plain = (n: { content?: Array<{ text?: string }> }) =>
      (n.content ?? []).map((c) => c.text ?? "").join("");
    const orig = doc.content.map(plain);
    const got = (json.content ?? []).map((n: { content?: Array<{ text?: string }> }) => plain(n));
    assert.deepEqual(got, orig);
    // No builder attrs added to an untouched plain sermon.
    for (const n of json.content ?? []) {
      const attrs = (n as { attrs?: Record<string, unknown> }).attrs ?? {};
      assert.equal("style" in attrs, false, JSON.stringify(attrs));
      assert.equal("spacing" in attrs, false, JSON.stringify(attrs));
    }
    ed.destroy();
  });
});

function nodePlain(node: { textBetween?: (f: number, t: number, s: string, bl?: string) => string; textContent?: string }): string {
  const n = node as { textBetween: (f: number, t: number, s: string, bl?: string) => string; content: { size: number } };
  return n.textBetween(0, n.content.size, "\n", "\n");
}

void insertBlockAt;
void INSERT_TYPES;
