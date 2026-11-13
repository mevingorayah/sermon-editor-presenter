import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { styledBlocksFromSnapshot } from "@/lib/sermon/export/contentWalk";
import { toSemanticBlocks } from "@/lib/semanticBlocks";
import { renderSermon } from "@/lib/reading/renderSermon";
import type { CalibratedSnapshot, SermonContent } from "@/types/document";

const content: SermonContent = {
  type: "doc",
  content: [
    {
      type: "scripture",
      attrs: { citation: "Philippians 4:4" },
      content: [{ type: "text", text: "Existing scripture quote." }],
    },
    {
      type: "verseSnippet",
      attrs: {
        ref: "Jean 3:16",
        translation: "WEB",
        texts: {
          LSG: "FIXTURE LSG: inventé.",
          WEB: "FIXTURE WEB: made-up test verse.",
        },
      },
    },
  ],
};

const snapshot = {
  target: "paper-a4",
  margins: { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" },
  typeScaleStep: 0,
  lineHeight: 1.55,
  theme: "light",
  flattenGradient: true,
  bionic: false,
  semanticBlocks: toSemanticBlocks(content),
  content,
} as CalibratedSnapshot;

describe("verseSnippet in Preach and exports", () => {
  it("flattens to a Scripture semantic block using the selected translation", () => {
    const blocks = toSemanticBlocks(content);
    assert.equal(blocks.length, 2);
    assert.deepEqual(blocks[0], {
      type: "Scripture",
      text: "Existing scripture quote.",
      citation: "Philippians 4:4",
    });
    assert.equal(blocks[1].type, "Scripture");
    assert.equal(blocks[1].text, "FIXTURE WEB: made-up test verse.");
    assert.equal(blocks[1].citation, "Jean 3:16 · WEB");
  });

  it("exports the snippet in Literata and leaves the old scripture run italic sans", () => {
    const styled = styledBlocksFromSnapshot(snapshot);
    assert.equal(styled[0].type, "Scripture");
    assert.equal(styled[0].citation, "Philippians 4:4");
    assert.equal(styled[0].runs[0].text, "Existing scripture quote.");
    assert.equal(styled[0].runs[0].italic, true);
    assert.equal(styled[1].type, "Scripture");
    assert.equal(styled[1].runs[0].text, "FIXTURE WEB: made-up test verse.");
    assert.equal(styled[1].runs[0].fontFamily, "literata");
    assert.equal(styled[1].runs[0].fontExplicit, true);
    assert.equal(styled[1].citation, "Jean 3:16 · WEB");
  });

  it("renders in Preach with the serif stack and no edit chrome", () => {
    const html = renderToStaticMarkup(renderSermon(content, { bionic: false, theme: "light" }));
    assert.match(html, /data-verse-snippet=""/);
    assert.match(html, /FIXTURE WEB: made-up test verse\./);
    assert.match(html, /Jean 3:16 · WEB/);
    assert.match(html, /--font-literata/);
    assert.doesNotMatch(html, /Open on Bible Gateway/);
    assert.doesNotMatch(html, /Refresh passage/);
    // Existing scripture node is unchanged.
    assert.match(html, /data-scripture=""/);
    assert.match(html, /Existing scripture quote\./);
    assert.match(html, /Philippians 4:4/);
  });
});
