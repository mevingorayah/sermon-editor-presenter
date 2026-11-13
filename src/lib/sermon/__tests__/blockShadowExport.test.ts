/** Builder block shadows in PDF, PNG and PPTX (made-up fixtures only). */
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { CalibratedSnapshot } from "@/types/document";
import { layoutSnapshot } from "../export/pngLayout";
import { styledBlocksFromSnapshot } from "../export/contentWalk";
import { blockShadowPaint, pptxShadowOptions } from "../export/blockLook";
import { svgBoxShadow } from "../export/png";
import { buildPdf, drawPdfBoxShadow } from "../export/pdf";
import { buildPptx } from "../export/pptx";
import { pxPerPt } from "../export/frames";

const T = (text: string) => ({ type: "text" as const, text });
const WORDS = "Fixture paragraph written only for this shadow test. ";
const SNIPPET = "FIXTURE made-up snippet words.";

function base(content: CalibratedSnapshot["content"]): CalibratedSnapshot {
  return {
    target: "paper-a4",
    margins: { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" },
    typeScaleStep: 0,
    lineHeight: 1.55,
    theme: "light",
    flattenGradient: true,
    bionic: false,
    semanticBlocks: [],
    content,
  };
}

const shadowed = base({
  type: "doc",
  content: [
    { type: "paragraph", attrs: { style: { shadow: "medium", background: "#F6F3EA" } }, content: [T(WORDS)] },
    {
      type: "verseSnippet",
      attrs: {
        ref: "Fixture 1:1",
        translation: "WEB",
        texts: { WEB: SNIPPET },
        style: { shadow: "soft" },
      },
    },
    { type: "quote", attrs: { style: { shadow: "strong" } }, content: [T("Fixture quote " + WORDS)] },
  ],
});

const plain = base({
  type: "doc",
  content: [
    { type: "paragraph", attrs: { style: { background: "#F6F3EA" } }, content: [T(WORDS)] },
    {
      type: "verseSnippet",
      attrs: {
        ref: "Fixture 1:1",
        translation: "WEB",
        texts: { WEB: SNIPPET },
      },
    },
    { type: "quote", content: [T("Fixture quote " + WORDS)] },
  ],
});

function breaks(s: CalibratedSnapshot) {
  return layoutSnapshot(s).pages.map((p) =>
    p.lines.map((l) => ({
      blockIndex: l.blockIndex,
      kind: l.kind,
      lineIndex: l.lineIndex,
      start: l.start,
      end: l.end,
      y: l.y,
      size: l.size,
      lineHeight: l.lineHeight,
    })),
  );
}

test("look carries stored shadows for every block, including verse snippets", () => {
  const styled = styledBlocksFromSnapshot(shadowed);
  assert.equal(styled[0].look?.shadow, "medium");
  assert.equal(styled[1].look?.shadow, "soft");
  assert.equal(styled[1].verseBar, true);
  assert.equal(styled[1].runs[0].text, SNIPPET);
  assert.equal(styled[2].look?.shadow, "strong");
  const words = styled.map((b) => b.runs.map((r) => r.text).join("")).join("\n");
  assert.match(words, /Fixture paragraph written only for this shadow test/);
  assert.match(words, /FIXTURE made-up snippet words/);
  assert.match(words, /Fixture quote/);
});

test("layout boxes get the stored offset, blur, colour and opacity; line breaks stay the same", () => {
  const withSh = layoutSnapshot(shadowed);
  const without = layoutSnapshot(plain);
  assert.deepEqual(breaks(shadowed), breaks(plain));
  assert.equal(withSh.pages.length, without.pages.length);

  const boxes = withSh.pages.flatMap((p) => p.boxes ?? []);
  const medium = blockShadowPaint("medium")!;
  const soft = blockShadowPaint("soft")!;
  const strong = blockShadowPaint("strong")!;
  assert.ok(boxes.some((b) => b.shadow && b.fill === "#F6F3EA" && b.shadow.blur === medium.blur && b.shadow.offsetY === medium.offsetY && b.shadow.opacity === medium.opacity && b.shadow.color === "#000000"));
  assert.ok(boxes.some((b) => b.shadow && b.shadow.blur === soft.blur && b.shadow.offsetY === soft.offsetY && b.shadow.opacity === soft.opacity));
  assert.ok(boxes.some((b) => b.shadow && b.shadow.blur === strong.blur && b.shadow.offsetY === strong.offsetY && b.shadow.opacity === strong.opacity));

  const plainBoxes = without.pages.flatMap((p) => p.boxes ?? []);
  assert.ok(plainBoxes.every((b) => !b.shadow));
});

test("PNG svgBoxShadow encodes offset, blur, colour and opacity", () => {
  const sh = blockShadowPaint("medium")!;
  const svg = svgBoxShadow("bsh-0", { x: 10, y: 20, w: 100, h: 40 }, sh);
  assert.match(svg, /feGaussianBlur[^>]*stdDeviation="6\.00"/);
  assert.match(svg, /feOffset[^>]*dx="0"[^>]*dy="4"/);
  assert.match(svg, /feFlood[^>]*flood-color="#000000"[^>]*flood-opacity="0\.18"/);
  assert.match(svg, /data-block-shadow="bsh-0"/);
  assert.match(svg, /filter="url\(#bsh-0\)"/);
});

test("PDF drawPdfBoxShadow uses the stored colour, opacity and offset", () => {
  const sh = blockShadowPaint("soft")!;
  const ops: unknown[] = [];
  const doc = {
    save() { ops.push("save"); return this; },
    fillColor(c: string) { ops.push(["fillColor", c]); return this; },
    fillOpacity(a: number) { ops.push(["fillOpacity", a]); return this; },
    rect(...args: number[]) { ops.push(["rect", ...args]); return this; },
    fill() { ops.push("fill"); return this; },
    restore() { ops.push("restore"); return this; },
  };
  const pxToPt = (n: number) => n; // 1:1 for a clean assertion
  drawPdfBoxShadow(doc as unknown as PDFKit.PDFDocument, { x: 10, y: 20, w: 100, h: 40 }, sh, pxToPt);
  const colors = ops.filter((o) => Array.isArray(o) && o[0] === "fillColor");
  assert.ok(colors.length >= 1);
  assert.ok(colors.every((o) => (o as unknown[])[1] === "#000000"));
  const alphas = ops.filter((o) => Array.isArray(o) && o[0] === "fillOpacity").map((o) => (o as unknown[])[1] as number);
  assert.ok(alphas.length >= 1);
  const sum = alphas.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - sh.opacity) < 1e-9, `opacity sum ${sum}`);
  const rects = ops.filter((o) => Array.isArray(o) && o[0] === "rect") as Array<unknown[]>;
  assert.ok(rects.some((r) => r[1] === 10 + sh.offsetX && r[2] === 20 + sh.offsetY));
});

test("PDF, PNG layout and PPTX each receive the shadow; words are unchanged", async () => {
  const pdf = (await buildPdf(shadowed, { compress: false })).toString("latin1");
  assert.match(pdf, /\/ca\s/); // fill opacity graphics state
  assert.match(pdf, /0\s+0\s+0/); // black shadow fill

  const pptx = await buildPptx(shadowed);
  const zip = await JSZip.loadAsync(pptx);
  const slides = Object.keys(zip.files).filter((n) => /ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.ok(slides.length >= 1);
  const xml = (await Promise.all(slides.map((n) => zip.file(n)!.async("string")))).join("\n");
  assert.match(xml, /<a:outerShdw\b/);
  const soft = pptxShadowOptions(blockShadowPaint("soft")!, (px) => +(px / pxPerPt("paper-a4")).toFixed(2));
  const medium = pptxShadowOptions(blockShadowPaint("medium")!, (px) => +(px / pxPerPt("paper-a4")).toFixed(2));
  const strong = pptxShadowOptions(blockShadowPaint("strong")!, (px) => +(px / pxPerPt("paper-a4")).toFixed(2));
  for (const opts of [soft, medium, strong]) {
    const dir = Math.round(opts.angle * 60000);
    const alpha = Math.round(opts.opacity * 100000);
    assert.match(xml, new RegExp(`dir="${dir}"`));
    assert.match(xml, new RegExp(`<a:alpha val="${alpha}"/>`));
    assert.match(xml, /srgbClr val="000000"/);
  }
  // Soft is downward (90°).
  assert.equal(soft.angle, 90);
  assert.equal(soft.type, "outer");
  // Words still in the deck.
  assert.match(xml, /Fixture paragraph written only for this/);
  assert.match(xml, /shadow test\./);
  assert.match(xml, /FIXTURE made-up snippet words/);
});
