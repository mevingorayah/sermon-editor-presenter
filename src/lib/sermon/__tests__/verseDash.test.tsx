/** @jsxRuntime automatic */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { getSchema, type JSONContent } from "@tiptap/react";
import { createSchemaExtensions } from "@/extensions/schema";
import { renderSermon } from "@/lib/reading/renderSermon";
import { parseSermonFile, serializeSermonFile } from "@/lib/sermon-file";
import { DEFAULT_PRESENTATION_SETTINGS, type SermonDocument } from "@/types/document";

// Made-up fixture: a hyphen range and an en-dash range the writer typed.
const HYPHEN = "Jean 3.16-18";
const EN_DASH = "Rom 8.28\u201330";

const content: JSONContent = {
  type: "doc",
  content: [
    { type: "scripture", attrs: { citation: HYPHEN }, content: [{ type: "text", text: "Car Dieu a tant aimé le monde" }] },
    { type: "paragraph", content: [{ type: "text", text: `Lire ${HYPHEN} et ${EN_DASH}.` }] },
  ],
};

/** Every text run and citation, in order. */
const strings = (n: JSONContent): string[] => [
  ...(n.attrs?.citation ? [String(n.attrs.citation)] : []),
  ...(n.text !== undefined ? [n.text] : []),
  ...(n.content ?? []).flatMap(strings),
];

test("verse ranges keep the exact dash through editor schema, save and preach", () => {
  // Editor: the shared schema parses and re-emits the doc unchanged.
  const schema = getSchema(createSchemaExtensions());
  const edited = JSON.parse(JSON.stringify(schema.nodeFromJSON(content).toJSON())) as JSONContent;
  assert.deepEqual(strings(edited), strings(content));

  // Save: .sermon file round-trip.
  const sermon: SermonDocument = {
    id: "00000000-0000-4000-8000-000000000316",
    title: HYPHEN,
    updatedAt: "2026-10-22T08:00:00.000Z",
    content: edited,
    presentation: DEFAULT_PRESENTATION_SETTINGS,
  } as SermonDocument;
  const saved = parseSermonFile(serializeSermonFile(sermon, new Date("2026-10-22T08:00:00Z"))).sermon;
  assert.equal(saved.title, HYPHEN);
  assert.deepEqual(saved.content, edited);
  assert.deepEqual(strings(saved.content as JSONContent), strings(content));

  // Preach: rendered markup keeps the hyphen and the typed en dash.
  for (const bionic of [false, true]) {
    const html = renderToStaticMarkup(<>{renderSermon(saved.content as JSONContent, { bionic, theme: "light" })}</>);
    const text = html.replace(/<[^>]+>/g, "");
    assert.ok(text.includes(HYPHEN) || html.includes(HYPHEN), `hyphen kept (bionic=${bionic})`);
    assert.ok(text.includes(EN_DASH), `en dash kept (bionic=${bionic})`);
    assert.ok(!text.includes("3.16\u201318"), `hyphen not converted (bionic=${bionic})`);
  }
});
