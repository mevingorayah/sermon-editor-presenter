/** Builder block effects (lift, fade, outline) in PDF, PNG and PPTX (made-up fixtures only). */
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { CalibratedSnapshot } from "@/types/document";
import { layoutSnapshot } from "../export/pngLayout";
import { styledBlocksFromSnapshot } from "../export/contentWalk";
import {
  BLOCK_FADE_OPACITY,
  BLOCK_LIFT_REST_SHADOW,
  BLOCK_OUTLINE_CSS_PX,
  blockFadeOpacity,
  blockLiftShadow,
  blockOutlinePaint,
  pptxShadowOptions,
} from "../export/blockLook";
import { buildPagesSvg, svgBoxOutline, svgBoxShadow } from "../export/png";
import { buildPdf, drawPdfBoxOutline, drawPdfBoxShadow } from "../export/pdf";
import { buildPptx } from "../export/pptx";
import { pxPerInch, pxPerPt } from "../export/frames";

const T = (text: string) => ({ type: "text" as const, text });
const WORDS = "Fixture paragraph written only for this effect test. ";
const SNIPPET = "FIXTURE made-up snippet words.";
const QUOTE = "Fixture quote " + WORDS;
const INK = "#A8201A";

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

const effected = base({
  type: "doc",
  content: [
    { type: "paragraph", attrs: { style: { effect: "lift", background: "#F6F3EA" } }, content: [T(WORDS)] },
    {
      type: "verseSnippet",
      attrs: {
        ref: "Fixture 1:1",
        translation: "WEB",
        texts: { WEB: SNIPPET },
        style: { effect: "fade", background: "#EEE8D5", color: "#111111" },
      },
    },
    { type: "quote", attrs: { style: { effect: "outline", color: INK } }, content: [T(QUOTE)] },
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
        style: { background: "#EEE8D5", color: "#111111" },
      },
    },
    { type: "quote", attrs: { style: { color: INK } }, content: [T(QUOTE)] },
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

function wordsOf(s: CalibratedSnapshot) {
  return styledBlocksFromSnapshot(s).map((b) => b.runs.map((r) => r.text).join("")).join("\n");
}

test("look carries lift, fade and outline for every block, including verse snippets", () => {
  const styled = styledBlocksFromSnapshot(effected);
  assert.equal(styled[0].look?.effect, "lift");
  assert.deepEqual(blockLiftShadow(styled[0].look?.effect), BLOCK_LIFT_REST_SHADOW);
  assert.equal(styled[1].look?.effect, "fade");
  assert.equal(styled[1].verseBar, true);
  assert.equal(styled[1].runs[0].text, SNIPPET);
  assert.equal(blockFadeOpacity(styled[1].look?.effect), BLOCK_FADE_OPACITY);
  assert.equal(styled[2].look?.effect, "outline");
  assert.deepEqual(blockOutlinePaint(styled[2].look?.effect, styled[2].look?.color), {
    width: BLOCK_OUTLINE_CSS_PX,
    style: "solid",
    color: INK,
  });
  const words = wordsOf(effected);
  assert.match(words, /Fixture paragraph written only for this effect test/);
  assert.match(words, /FIXTURE made-up snippet words/);
  assert.match(words, /Fixture quote/);
  assert.equal(words, wordsOf(plain));
});

test("layout boxes get lift's resting shadow, fade opacity and outline; line breaks stay the same", () => {
  const withFx = layoutSnapshot(effected);
  const without = layoutSnapshot(plain);
  assert.deepEqual(breaks(effected), breaks(plain));
  assert.equal(withFx.pages.length, without.pages.length);

  const boxes = withFx.pages.flatMap((p) => p.boxes ?? []);
  const lift = boxes.find((b) => b.shadow && b.fill === "#F6F3EA");
  assert.ok(lift);
  assert.equal(lift!.shadow!.offsetY, BLOCK_LIFT_REST_SHADOW.offsetY);
  assert.equal(lift!.shadow!.blur, BLOCK_LIFT_REST_SHADOW.blur);
  assert.equal(lift!.shadow!.opacity, BLOCK_LIFT_REST_SHADOW.opacity);
  assert.equal(lift!.shadow!.color, BLOCK_LIFT_REST_SHADOW.color);
  assert.equal(lift!.shadow!.offsetX, BLOCK_LIFT_REST_SHADOW.offsetX);

  const fade = boxes.find((b) => b.fill === "#EEE8D5");
  assert.ok(fade);
  assert.equal(fade!.opacity, BLOCK_FADE_OPACITY);

  const outline = boxes.find((b) => b.outline);
  assert.ok(outline);
  const cssPx = pxPerInch("paper-a4") / 96;
  assert.equal(outline!.outline!.width, BLOCK_OUTLINE_CSS_PX * cssPx);
  assert.equal(outline!.outline!.style, "solid");
  assert.equal(outline!.outline!.color, INK);

  const plainBoxes = without.pages.flatMap((p) => p.boxes ?? []);
  assert.ok(plainBoxes.every((b) => !b.shadow && b.opacity === undefined && !b.outline));
});

test("PNG svg encodes lift shadow, fade opacity and outline border for each effect", () => {
  const sh = BLOCK_LIFT_REST_SHADOW;
  const svgSh = svgBoxShadow("lift-0", { x: 10, y: 20, w: 100, h: 40 }, sh);
  assert.match(svgSh, new RegExp(`feGaussianBlur[^>]*stdDeviation="${(sh.blur / 2).toFixed(2)}"`));
  assert.match(svgSh, /feOffset[^>]*dx="0"[^>]*dy="2"/);
  assert.match(svgSh, /feFlood[^>]*flood-color="#000000"[^>]*flood-opacity="0\.16"/);

  const svgOut = svgBoxOutline("bon-0", { x: 10, y: 20, w: 100, h: 40 }, { width: 2, style: "solid", color: INK }, "#111111");
  assert.match(svgOut, /data-block-outline="bon-0"/);
  assert.match(svgOut, /data-outline-style="solid"/);
  assert.match(svgOut, /stroke="#A8201A"/);
  assert.match(svgOut, /stroke-width="2"/);
  assert.match(svgOut, /fill="none"/);
  // Outline sits outside the box (centred stroke on an expanded rect).
  assert.match(svgOut, /x="9\.00"/);
  assert.match(svgOut, /y="19\.00"/);
  assert.match(svgOut, /width="102\.00"/);
  assert.match(svgOut, /height="42\.00"/);

  const svg = buildPagesSvg(effected).join("\n");
  assert.match(svg, /data-block-shadow="/);
  assert.match(svg, /feOffset[^>]*dy="2"/);
  assert.match(svg, /data-block-fade="0\.72"/);
  assert.match(svg, /opacity="0\.72"/);
  assert.match(svg, /data-block-outline="/);
  assert.match(svg, /data-outline-style="solid"/);
  assert.match(svg, /stroke="#A8201A"/);
  assert.match(svg, /Fixture paragraph written only for this/);
  assert.match(svg, /effect test\./);
  assert.match(svg, /FIXTURE made-up snippet words/);
});

test("PDF draws lift via the shadow path, fade as fill/text opacity, and outline as a stroke", () => {
  const ops: unknown[] = [];
  const doc = {
    save() { ops.push("save"); return this; },
    fillColor(c: string) { ops.push(["fillColor", c]); return this; },
    fillOpacity(a: number) { ops.push(["fillOpacity", a]); return this; },
    strokeColor(c: string) { ops.push(["strokeColor", c]); return this; },
    strokeOpacity(a: number) { ops.push(["strokeOpacity", a]); return this; },
    lineWidth(w: number) { ops.push(["lineWidth", w]); return this; },
    rect(...args: number[]) { ops.push(["rect", ...args]); return this; },
    fill() { ops.push("fill"); return this; },
    stroke() { ops.push("stroke"); return this; },
    restore() { ops.push("restore"); return this; },
  };
  const pxToPt = (n: number) => n;
  drawPdfBoxShadow(doc as unknown as PDFKit.PDFDocument, { x: 10, y: 20, w: 100, h: 40 }, BLOCK_LIFT_REST_SHADOW, pxToPt);
  const rects = ops.filter((o) => Array.isArray(o) && o[0] === "rect") as Array<unknown[]>;
  assert.ok(rects.some((r) => r[1] === 10 + BLOCK_LIFT_REST_SHADOW.offsetX && r[2] === 20 + BLOCK_LIFT_REST_SHADOW.offsetY));
  const alphas = ops.filter((o) => Array.isArray(o) && o[0] === "fillOpacity").map((o) => (o as unknown[])[1] as number);
  const sum = alphas.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - BLOCK_LIFT_REST_SHADOW.opacity) < 1e-9, `lift opacity sum ${sum}`);

  ops.length = 0;
  const outline = blockOutlinePaint("outline", INK)!;
  drawPdfBoxOutline(doc as unknown as PDFKit.PDFDocument, { x: 10, y: 20, w: 100, h: 40 }, outline, pxToPt, "#111111", 1);
  assert.ok(ops.some((o) => Array.isArray(o) && o[0] === "strokeColor" && o[1] === INK));
  assert.ok(ops.some((o) => Array.isArray(o) && o[0] === "lineWidth" && o[1] === 2));
  assert.ok(ops.includes("stroke"));
  const outRect = (ops.filter((o) => Array.isArray(o) && o[0] === "rect") as Array<unknown[]>)[0];
  assert.equal(outRect[1], 10 - 1);
  assert.equal(outRect[2], 20 - 1);
  assert.equal(outRect[3], 102);
  assert.equal(outRect[4], 42);
});

test("PDF, PNG layout and PPTX each receive lift, fade and outline; words are unchanged", async () => {
  const pdf = (await buildPdf(effected, { compress: false })).toString("latin1");
  assert.match(pdf, /\/ca\s+0\.72/); // fade fill/text opacity
  assert.match(pdf, /0\s+0\s+0/); // black lift shadow fill
  // Crimson outline #A8201A in 0–1 PDF colour space, then a stroke (S).
  assert.match(pdf, /0\.6588235294117647\s+0\.12549019607843137\s+0\.10196078431372549/);
  assert.match(pdf, /\nS\n/);

  const pptx = await buildPptx(effected);
  const zip = await JSZip.loadAsync(pptx);
  const slides = Object.keys(zip.files).filter((n) => /ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.ok(slides.length >= 1);
  const xml = (await Promise.all(slides.map((n) => zip.file(n)!.async("string")))).join("\n");

  // Lift: resting shadow through the same outer-shadow path as #50.
  assert.match(xml, /<a:outerShdw\b/);
  const lift = pptxShadowOptions(BLOCK_LIFT_REST_SHADOW, (px) => +(px / pxPerPt("paper-a4")).toFixed(2));
  assert.equal(lift.angle, 90);
  assert.equal(lift.type, "outer");
  const dir = Math.round(lift.angle * 60000);
  const liftAlpha = Math.round(lift.opacity * 100000);
  assert.match(xml, new RegExp(`dir="${dir}"`));
  assert.match(xml, new RegExp(`<a:alpha val="${liftAlpha}"/>`));
  assert.match(xml, /srgbClr val="000000"/);

  // Fade: 0.72 opacity → 28% transparency → alpha 72000.
  const fadeAlpha = Math.round(BLOCK_FADE_OPACITY * 100000);
  assert.match(xml, new RegExp(`<a:alpha val="${fadeAlpha}"/>`));

  // Outline: solid stroke in the stored colour, width in EMU (2 CSS px = 1.5 pt).
  const cssPx = pxPerInch("paper-a4") / 96;
  const outlinePt = +((BLOCK_OUTLINE_CSS_PX * cssPx) / pxPerPt("paper-a4")).toFixed(2);
  const outlineEmu = Math.round(outlinePt * 12700);
  assert.equal(outlinePt, 1.5);
  assert.match(xml, new RegExp(`<a:ln w="${outlineEmu}"`));
  assert.match(xml, /srgbClr val="A8201A"/);

  assert.match(xml, /Fixture paragraph written only for this/);
  assert.match(xml, /effect test\./);
  assert.match(xml, /FIXTURE made-up snippet words/);
});
