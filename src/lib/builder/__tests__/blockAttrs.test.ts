import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { getSchema, type JSONContent } from "@tiptap/core";
import { createSchemaExtensions } from "@/extensions/schema";
import {
  FIELD, blockCss, sanitizeSpacing, sanitizeStyle, stripDefaultBuilderAttrs,
} from "../blockAttrs";

const BUILDER_EXT = new Set(["quote", "illustration", "column", "section", "blockStyleAttrs"]);
const builderSchema = getSchema(createSchemaExtensions());
const mainSchema = getSchema(createSchemaExtensions().filter((e) => !BUILDER_EXT.has(e.name)));

/** What a save does: parse into the editor schema, serialize, strip defaults. */
const saveBuilder = (doc: JSONContent) =>
  stripDefaultBuilderAttrs(builderSchema.nodeFromJSON(doc).toJSON() as JSONContent);
const saveMain = (doc: JSONContent) => mainSchema.nodeFromJSON(doc).toJSON() as JSONContent;

// Synthetic sermon (no real sermon content) covering every existing block + mark.
const OLD: JSONContent = {
  type: "doc",
  content: [
    { type: "title", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Sample title" }] },
    { type: "heading", attrs: { level: 1, textAlign: "left" }, content: [{ type: "text", text: "Point" }] },
    { type: "heading", attrs: { level: 2, textAlign: "left" }, content: [{ type: "text", text: "Sub" }] },
    {
      type: "paragraph", attrs: { textAlign: "left" },
      content: [
        { type: "text", text: "plain " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " hl", marks: [{ type: "highlight" }] },
        { type: "text", text: " col", marks: [{ type: "textStyle", attrs: { color: "#376080", fontFamily: null } }] },
      ],
    },
    { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "[Pause.]", marks: [{ type: "italic" }, { type: "textStyle", attrs: { color: "#595959", fontFamily: null } }] }] },
    { type: "scripture", attrs: { citation: "Ref 1:1", textAlign: "left" }, content: [{ type: "text", text: "Quoted words." }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "item" }] }] }] },
    { type: "paragraph", attrs: { textAlign: "left" } },
  ],
};

describe("block builder attrs adapter", () => {
  it("old sermon JSON in == out (identical to pre-builder save)", () => {
    const main = saveMain(OLD);
    assert.equal(JSON.stringify(saveBuilder(OLD)), JSON.stringify(main));
    assert.equal(JSON.stringify(saveBuilder(main)), JSON.stringify(main));
  });

  it("no builder attrs appear on untouched blocks", () => {
    assert.ok(!JSON.stringify(saveBuilder(OLD)).includes(FIELD.style));
    assert.ok(!JSON.stringify(saveBuilder(OLD)).includes(FIELD.spacing));
  });

  it("style + spacing round-trip through the schema", () => {
    const doc = structuredClone(OLD);
    doc.content![3].attrs = {
      ...doc.content![3].attrs,
      [FIELD.style]: { font: "Georgia", size: 20, color: "#8F3A3A", borderLeft: "#376080" },
      [FIELD.spacing]: { mt: 12, pl: 24 },
    };
    const out = saveBuilder(doc);
    assert.deepEqual(out.content![3].attrs![FIELD.style], doc.content![3].attrs![FIELD.style]);
    assert.deepEqual(out.content![3].attrs![FIELD.spacing], { mt: 12, pl: 24 });
    assert.deepEqual(saveBuilder(out), out);
  });

  it("new block types round-trip (quote, illustration, section)", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        { type: "quote", attrs: { source: "", textAlign: "left" }, content: [{ type: "text", text: "q" }] },
        { type: "illustration", attrs: { textAlign: "left" }, content: [{ type: "text", text: "i" }] },
        { type: "section", attrs: { columns: 2 }, content: [
          { type: "column", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] },
          { type: "column", content: [{ type: "paragraph", attrs: { textAlign: "left" } }] },
        ] },
      ],
    };
    assert.deepEqual(saveBuilder(saveBuilder(doc)), saveBuilder(doc));
  });

  it("sanitizers clamp and reject unapproved values; empty → null (= global)", () => {
    assert.equal(sanitizeStyle({}), null);
    assert.equal(sanitizeSpacing({}), null);
    assert.deepEqual(sanitizeSpacing({ mt: 99, mb: -4 }), { mt: 64, mb: 0 });
    assert.equal(sanitizeStyle({ font: "Comic Sans", color: "red" }), null);
    assert.equal(blockCss(null, null), "");
    assert.match(blockCss({ size: 18 }, { pt: 8 }), /font-size: 18pt; padding-top: 8px/);
  });
});

/**
 * Optional local gate (never commits sermon content; repo is public): point
 * SERMON_GATE_FILE at an uncommitted staging backup ({ sermons: [{id, content}] })
 * and every sermon in it must be byte-identical after open+save.
 */
describe("local gate: backup sermons unchanged by open+save", () => {
  it("every sermon in SERMON_GATE_FILE is byte-identical", (t) => {
    const file = process.env.SERMON_GATE_FILE;
    if (!file || !existsSync(file)) return t.skip("SERMON_GATE_FILE not set");
    const all = JSON.parse(readFileSync(file, "utf8")).sermons as { id: string; content: JSONContent }[];
    for (const s of all) {
      const before = saveMain(s.content);
      assert.equal(JSON.stringify(saveBuilder(before)), JSON.stringify(before), "sermon changed on save");
      assert.equal(JSON.stringify(saveBuilder(s.content)), JSON.stringify(before));
    }
  });
});
