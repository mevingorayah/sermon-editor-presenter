import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { styledBlocksFromSnapshot } from "@/lib/sermon/export/contentWalk";
import { toSemanticBlocks } from "@/lib/semanticBlocks";
import { renderSermon } from "@/lib/reading/renderSermon";
import { findBlockLayoutIssues, STYLABLE_NODE_TYPES } from "@/lib/sermon/blockStyle";
import { parseSermonFile, serializeSermonFile } from "@/lib/sermon-file";
import { currentPassageText, normalizeAttrs } from "@/lib/sermon/verseSnippet";
import type { CalibratedSnapshot, SermonContent, SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";

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
    assert.equal(styled[1].verseBar, true);
    assert.notEqual(styled[0].verseBar, true);
  });

  it("renders in Preach with the serif stack and no edit chrome", () => {
    const html = renderToStaticMarkup(renderSermon(content, { bionic: false, theme: "light" }));
    assert.match(html, /data-verse-snippet=""/);
    assert.match(html, /data-verse-bar=""/);
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


const WORDS = "FIXTURE made-up snippet words.";

describe("verseSnippet block styles persist", () => {
  const snippet: SermonContent["content"] extends (infer T)[] | undefined ? T : never = {
    type: "verseSnippet",
    attrs: {
      ref: "Fixture 1:1",
      translation: "WEB",
      texts: { WEB: WORDS, LSG: "FIXTURE mots inventés." },
      style: { color: "#2E6B3A", size: 28 },
      spacing: { mt: 16, mb: 8 },
    },
  };
  const styledContent: SermonContent = { type: "doc", content: [snippet] };

  it("keeps style and spacing through save, Preach and exports, with serif and the same words", () => {
    assert.equal(STYLABLE_NODE_TYPES.has("verseSnippet"), true);
    assert.deepEqual(findBlockLayoutIssues(styledContent), []);
    assert.equal(currentPassageText(normalizeAttrs(snippet.attrs)), WORDS);

    const file = parseSermonFile(serializeSermonFile({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Fixture verse style",
      updatedAt: "2026-01-01T00:00:00.000Z",
      content: styledContent,
      presentationSettings: DEFAULT_PRESENTATION_SETTINGS,
      notes: "",
    } as SermonDocument));
    const reloaded = (file.sermon.content as SermonContent).content?.[0];
    assert.equal(reloaded?.type, "verseSnippet");
    assert.deepEqual(reloaded?.attrs?.style, { color: "#2E6B3A", size: 28 });
    assert.deepEqual(reloaded?.attrs?.spacing, { mt: 16, mb: 8 });
    assert.equal(currentPassageText(normalizeAttrs(reloaded?.attrs)), WORDS);

    const html = renderToStaticMarkup(renderSermon(file.sermon.content as SermonContent, { bionic: false, theme: "light" }));
    assert.match(html, /FIXTURE made-up snippet words\./);
    assert.match(html, /color:#2E6B3A/i);
    assert.match(html, /margin-top:16px/);
    assert.match(html, /margin-bottom:8px/);
    assert.match(html, /--font-literata/);
    assert.doesNotMatch(html, /Open Sans|Inter,/);

    const styled = styledBlocksFromSnapshot({ ...snapshot, content: file.sermon.content } as CalibratedSnapshot);
    assert.equal(styled[0].runs[0].text, WORDS);
    assert.equal(styled[0].runs[0].fontFamily, "literata");
    assert.equal(styled[0].runs[0].fontExplicit, true);
    assert.equal(styled[0].runs[0].color, "#2E6B3A");
    assert.deepEqual(styled[0].look?.spacing, { mt: 16, mb: 8 });
    assert.equal(styled[0].verseBar, true);
  });

  it("lets a writer override the serif face without changing the words", () => {
    const overridden: SermonContent = {
      type: "doc",
      content: [{
        type: "verseSnippet",
        attrs: {
          ref: "Fixture 1:1",
          translation: "WEB",
          texts: { WEB: WORDS },
          style: { font: "inter", color: "#2E6B3A" },
        },
      }],
    };
    assert.deepEqual(findBlockLayoutIssues(overridden), []);
    const html = renderToStaticMarkup(renderSermon(overridden, { bionic: false, theme: "light" }));
    assert.match(html, /FIXTURE made-up snippet words\./);
    assert.match(html, /Inter/);
    const styled = styledBlocksFromSnapshot({ ...snapshot, content: overridden } as CalibratedSnapshot);
    assert.equal(styled[0].runs[0].text, WORDS);
    assert.equal(styled[0].runs[0].fontFamily, "inter");
    assert.equal(styled[0].runs[0].color, "#2E6B3A");
  });
});
