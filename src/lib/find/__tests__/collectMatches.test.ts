import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Schema } from "@tiptap/pm/model";
import { collectMatches } from "../collectMatches";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "inline*", group: "block" },
    title: { content: "inline*", group: "block" },
    scripture: {
      content: "inline*",
      group: "block",
      attrs: { citation: { default: "" } },
    },
    text: { group: "inline" },
  },
});

function doc(...blocks: ReturnType<typeof schema.node>[]) {
  return schema.node("doc", null, blocks);
}

function p(text: string) {
  return schema.node("paragraph", null, text ? [schema.text(text)] : []);
}

function title(text: string) {
  return schema.node("title", null, text ? [schema.text(text)] : []);
}

function scripture(quote: string, citation = "") {
  return schema.node(
    "scripture",
    { citation },
    quote ? [schema.text(quote)] : [],
  );
}

describe("collectMatches", () => {
  it("finds case-insensitive matches by default", () => {
    const d = doc(p("Grace upon Grace"));
    const matches = collectMatches(d, "grace", false);
    assert.equal(matches.length, 2);
    assert.deepEqual(matches[0], { from: 1, to: 6 });
  });

  it("respects case-sensitive mode", () => {
    const d = doc(p("Grace upon grace"));
    assert.equal(collectMatches(d, "Grace", true).length, 1);
    assert.equal(collectMatches(d, "grace", true).length, 1);
  });

  it("searches across custom blocks without crossing boundaries", () => {
    const d = doc(
      title("Hope"),
      p("Living hope"),
      scripture("hope eternal", "Rom 15:13"),
    );
    const matches = collectMatches(d, "hope", false);
    assert.equal(matches.length, 3);
  });

  it("returns empty for empty query", () => {
    const d = doc(p("anything"));
    assert.deepEqual(collectMatches(d, "", false), []);
  });
});
