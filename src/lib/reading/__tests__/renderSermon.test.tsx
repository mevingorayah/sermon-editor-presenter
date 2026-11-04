/** @jsxRuntime automatic */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { getSchema, type JSONContent } from "@tiptap/react";
import { createSchemaExtensions } from "@/extensions/schema";
import { RENDERED_MARKS, RENDERED_NODES, renderSermon } from "../renderSermon";

const html = (content: JSONContent, bionic = false, theme: "light" | "dark" = "light") =>
  renderToStaticMarkup(<>{renderSermon(content, { bionic, theme })}</>);

const styled: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Grace abounds",
          marks: [
            { type: "textStyle", attrs: { color: "#b91c1c", fontFamily: "Courier New" } },
            { type: "highlight" },
            { type: "bold" },
            { type: "italic" },
            { type: "underline" },
            { type: "strike" },
            { type: "link", attrs: { href: "https://example.org" } },
          ],
        },
      ],
    },
  ],
};

test("every node and mark in the shared schema has a renderer", () => {
  const schema = getSchema(createSchemaExtensions());
  for (const n of Object.keys(schema.nodes)) assert.ok(RENDERED_NODES.includes(n), `node ${n}`);
  for (const m of Object.keys(schema.marks)) assert.ok(RENDERED_MARKS.includes(m), `mark ${m}`);
});

for (const bionic of [false, true]) {
  test(`marks are preserved (bionic ${bionic ? "on" : "off"})`, () => {
    const out = html(styled, bionic);
    assert.match(out, /<span style="color:#b91c1c;font-family:Courier New">/);
    assert.match(out, /<mark class="sermon-highlight">/);
    for (const tag of ["strong", "em", "u", "s"]) assert.match(out, new RegExp(`<${tag}>`), tag);
    assert.match(out, /<a href="https:\/\/example.org"/);
    // The visible text is unchanged.
    assert.match(out.replace(/<[^>]+>/g, ""), /Grace abounds/);
    if (bionic) {
      // Inside user bold, bionic adds weight via a span (never removes <strong>).
      assert.match(out, /data-bionic="" style="font-weight:800">Gr/);
    }
  });
}

test("bionic adds <strong> inside italic text without dropping the <em>", () => {
  const out = html(
    { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Word", marks: [{ type: "italic" }] }] }] },
    true,
  );
  assert.match(out, /^<p><em><strong data-bionic="">Wo<\/strong><span>rd<\/span><\/em><\/p>$/);
});

test("Scripture keeps marks but never gets bionic", () => {
  const out = html(
    {
      type: "doc",
      content: [
        {
          type: "scripture",
          attrs: { citation: "John 3:16", textAlign: "center" },
          content: [{ type: "text", text: "For God so loved", marks: [{ type: "italic" }] }],
        },
      ],
    },
    true,
  );
  assert.doesNotMatch(out, /data-bionic/);
  assert.match(out, /<em>For God so loved<\/em>/);
  assert.match(out, /<figure data-scripture="" style="text-align:center">/);
  assert.match(out, /<figcaption><cite>John 3:16<\/cite><\/figcaption>/);
});

test("alignment applies to title, both headings, paragraph and scripture", () => {
  const block = (type: string, attrs: Record<string, unknown> = {}) => ({
    type,
    attrs: { textAlign: "right", ...attrs },
    content: [{ type: "text", text: "x" }],
  });
  const out = html({
    type: "doc",
    content: [
      block("title"),
      block("heading", { level: 1 }),
      block("heading", { level: 2 }),
      block("paragraph"),
      block("scripture"),
    ],
  });
  for (const tag of ["h1", "h2", "h3", "p", "figure"]) {
    assert.match(out, new RegExp(`<${tag}[^>]*style="text-align:right"`), tag);
  }
});

test("lists, hard breaks and rules render", () => {
  const li = (t: string) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
  const out = html({
    type: "doc",
    content: [
      { type: "bulletList", content: [li("a"), li("b")] },
      { type: "orderedList", attrs: { start: 3 }, content: [li("c")] },
      { type: "paragraph", content: [{ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }] },
      { type: "horizontalRule" },
    ],
  });
  assert.match(out, /<ul><li><p>a<\/p><\/li><li><p>b<\/p><\/li><\/ul>/);
  assert.match(out, /<ol start="3"><li><p>c<\/p><\/li><\/ol>/);
  assert.match(out, /one<br\/>two/);
  assert.match(out, /<hr\/>/);
});

test("unknown nodes render their children", () => {
  const out = html({
    type: "doc",
    content: [{ type: "mysteryBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "kept" }] }] }],
  });
  assert.equal(out, "<p>kept</p>");
});

test("dark theme lightens a low-contrast colour, light theme keeps it", () => {
  const doc: JSONContent = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: "#1e3a8a" } }] }] }],
  };
  assert.match(html(doc, false, "light"), /color:#1e3a8a/);
  assert.doesNotMatch(html(doc, false, "dark"), /color:#1e3a8a/);
});

test("unsafe link hrefs are dropped", () => {
  const out = html({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }],
  });
  assert.doesNotMatch(out, /javascript/);
});
