import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { createSchemaExtensions } from "@/extensions/schema";
import {
  parseSermonFile,
  serializeSermonFile,
  checkSermonContent,
} from "@/lib/sermon-file";
import { DEFAULT_PRESENTATION_SETTINGS, type SermonDocument } from "@/types/document";

const schema = getSchema(createSchemaExtensions());

const scriptureQuote = "Existing scripture quote — left untouched.";

const snippetTexts = {
  LSG: "FIXTURE LSG: Ceci est un verset inventé pour les tests, pas un texte biblique.",
  WEB: "FIXTURE WEB: This is a made-up test verse, not Scripture.",
  ESV: "  PASTED ESV — made-up, stored exactly.  ",
};

const sermon: SermonDocument = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  title: "Verse snippet fixture sermon",
  updatedAt: "2026-11-13T06:00:00.000Z",
  content: {
    type: "doc",
    content: [
      { type: "title", content: [{ type: "text", text: "Verse snippet fixture sermon" }] },
      {
        type: "scripture",
        attrs: { citation: "Philippians 4:4" },
        content: [{ type: "text", text: scriptureQuote }],
      },
      {
        type: "verseSnippet",
        attrs: {
          ref: "Jean 3:16",
          translation: "LSG",
          texts: snippetTexts,
        },
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "A body paragraph after the snippet." }],
      },
    ],
  },
  presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS },
  notes: "",
};

describe("verseSnippet schema and .sermon round-trip", () => {
  it("is a known schema node and sits alongside an untouched scripture node", () => {
    assert.ok(schema.nodes.verseSnippet, "verseSnippet is in the editor schema");
    assert.ok(schema.nodes.scripture, "scripture node remains");
    const node = PMNode.fromJSON(schema, sermon.content);
    node.check();
    assert.equal(checkSermonContent(sermon.content), null);
    const types = (sermon.content.content ?? []).map((n) => n.type);
    assert.deepEqual(types, ["title", "scripture", "verseSnippet", "paragraph"]);
  });

  it("round-trips attrs (ref, translation, per-translation texts) through .sermon", () => {
    const text = serializeSermonFile(sermon, new Date("2026-11-13T06:05:00Z"));
    const back = parseSermonFile(text);
    assert.deepEqual(back.sermon.content, sermon.content);
    const snippet = (back.sermon.content.content as Array<{ type: string; attrs?: Record<string, unknown> }>).
      find((n) => n.type === "verseSnippet");
    assert.ok(snippet);
    assert.equal(snippet.attrs?.ref, "Jean 3:16");
    assert.equal(snippet.attrs?.translation, "LSG");
    assert.deepEqual(snippet.attrs?.texts, snippetTexts);
    const scripture = (back.sermon.content.content as Array<{ type: string; content?: Array<{ text: string }>; attrs?: { citation?: string } }>).
      find((n) => n.type === "scripture");
    assert.equal(scripture?.attrs?.citation, "Philippians 4:4");
    assert.equal(scripture?.content?.[0]?.text, scriptureQuote);
  });

  it("still accepts a sermon that only has the original scripture node (no migration)", () => {
    const legacy: SermonDocument = {
      ...sermon,
      content: {
        type: "doc",
        content: [
          {
            type: "scripture",
            attrs: { citation: "Jean 3:16" },
            content: [{ type: "text", text: scriptureQuote }],
          },
        ],
      },
    };
    assert.equal(checkSermonContent(legacy.content), null);
    const back = parseSermonFile(serializeSermonFile(legacy));
    assert.equal(back.sermon.content.content?.[0]?.type, "scripture");
    assert.equal(
      (back.sermon.content.content as Array<{ content?: Array<{ text: string }> }>)[0].content?.[0]?.text,
      scriptureQuote,
    );
    assert.ok(!(back.sermon.content.content ?? []).some((n) => n.type === "verseSnippet"));
  });
});
