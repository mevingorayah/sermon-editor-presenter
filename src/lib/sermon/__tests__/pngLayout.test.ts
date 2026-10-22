import { test } from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/react";
import { buildCalibratedSnapshot } from "../../calibration";
import { countPngPages, pngExportLabel } from "../export/pngLayout";
import { downloadFilename } from "../../export-client/payload";

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (n: number): JSONContent => ({
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "La joie sans cesse" }] },
    ...Array.from({ length: n }, (_, i) => para(`Paragraphe ${i + 1}. Réjouissez-vous toujours dans le Seigneur ; je le répète, réjouissez-vous.`.repeat(3))),
  ],
});
const snap = (n: number, target = "screen-16-9") =>
  buildCalibratedSnapshot({ target: target as never, typeScaleStep: 0, lineHeight: 1.7, theme: "dark", content: doc(n) });

test("short sermon is one PNG page; label says Image (.png)", () => {
  const pages = countPngPages(snap(1));
  assert.equal(pages, 1);
  assert.equal(pngExportLabel(pages), "Image (.png)");
});

test("long sermon pages like the server; label says Images (N pages, .zip)", () => {
  const pages = countPngPages(snap(40));
  assert.ok(pages > 1, String(pages));
  assert.equal(pngExportLabel(pages), `Images (${pages} pages, .zip)`);
  // More content never means fewer pages; a taller frame needs fewer.
  assert.ok(countPngPages(snap(80)) > pages);
  assert.ok(countPngPages(snap(40, "paper-a4")) >= 1);
});

test("download name: Content-Disposition wins, else Content-Type picks .zip vs .png", () => {
  assert.equal(downloadFilename('attachment; filename="Joie.zip"', "application/zip", "Joie", "png"), "Joie.zip");
  assert.equal(downloadFilename(null, "application/zip", "Joie", "png"), "Joie.zip");
  assert.equal(downloadFilename(null, "application/zip; charset=binary", "Joie", "png"), "Joie.zip");
  assert.equal(downloadFilename(null, "image/png", "Joie", "png"), "Joie.png");
  assert.equal(downloadFilename(null, null, "Joie", "docx"), "Joie.docx");
});

// ---- Shared layout rules (UI UX ruling) ----
import {
  afmMeasurer, layoutPngPages, pngFrame, pngFrameWidthInches, pngPageCount, pngTypeScale, pxPerPt, MIN_BODY_PT, type LayoutBlock,
} from "../export/pngLayout";

const T = "screen-16-9";
const LH = 1.7;
const BODY = 20 * pngTypeScale(T); // px
const CPL = Math.floor(pngFrame(T).contentWidth / (afmMeasurer("m000 ", BODY, { font: "sans" }) / 5)); // chars per body line
const words = (n: number) => Array.from({ length: n }, (_, i) => `m${String(i).padStart(3, "0")}`).join(" ");
// "mNNN " = 5 chars; ~CPL/5 words per line.
const bodyLines = (lines: number): LayoutBlock => ({ type: "Body", text: words(Math.max(1, Math.round((lines * CPL) / 5) - lines)) });
const linesPerPage = Math.floor((pngFrame(T).bottom - pngFrame(T).top) / (BODY * LH));

const pageOf = (pages: ReturnType<typeof layoutPngPages>, bi: number, kind?: string) =>
  pages.map((p, i) => (p.lines.some((l) => l.blockIndex === bi && (!kind || l.kind === kind)) ? i : -1)).filter((i) => i >= 0);

test("sizes: 16:9 is 2 px/pt and body defaults to 28 pt = 56 px; all sizes scale together", () => {
  assert.ok(Math.abs(pxPerPt(T) - 2) < 0.001);
  assert.ok(Math.abs(BODY - 56) < 0.01);
  const pages = layoutPngPages(
    [{ type: "H1", text: "Titre" }, { type: "Body", text: "corps" }, { type: "Scripture", text: "verset", citation: "Jn 1.1" }],
    T, LH,
  );
  const lines = pages.flatMap((p) => p.lines);
  const k = pngTypeScale(T);
  const cite = Math.max(16, (24 * pxPerPt(T)) / k); // citations are lifted to the 24 pt floor
  assert.deepEqual(lines.map((l) => +(l.size / k).toFixed(3)), [30, 20, 20, +cite.toFixed(3)]);
  assert.deepEqual(lines.slice(0, 3).map((l) => +(l.lineHeight / k).toFixed(3)), [51, 34, 34]);
  for (const l of lines) assert.ok(l.size / pxPerPt(T) >= 24 - 1e-9);
  for (const t of ["screen-16-9", "screen-16-10", "tablet-portrait", "paper-letter", "paper-a4", "paper-half-letter"]) {
    const body = layoutPngPages([{ type: "Body", text: "x" }], t, LH)[0].lines[0].size;
    assert.ok(body / pxPerPt(t) >= MIN_BODY_PT - 1e-9, `${t}: ${body / pxPerPt(t)}pt`);
  }
});

test("frame widths: 16:9 13.333in, 16:10 10in, tablet 9.25in (Tab S10 Lite)", () => {
  assert.equal(pngFrameWidthInches("screen-16-9"), 13.333);
  assert.equal(pngFrameWidthInches("screen-16-10"), 10);
  assert.equal(pngFrameWidthInches("tablet-portrait"), 9.25);
  // Tablet: 900px / (9.25in x 72) = 1.351 px/pt → body 28pt (default) = 37.84px.
  assert.ok(Math.abs(pxPerPt("tablet-portrait") - 900 / 666) < 1e-9);
  const body = layoutPngPages([{ type: "Body", text: "x" }], "tablet-portrait", LH)[0].lines[0].size;
  assert.ok(Math.abs(body - 37.838) < 0.01, String(body));
});

test("rule 1: lines never straddle a page, and every char is placed exactly once", () => {
  const blocks = [bodyLines(linesPerPage * 3), bodyLines(linesPerPage + 3)];
  const pages = layoutPngPages(blocks, T, LH);
  const f = pngFrame(T);
  assert.ok(pages.length > 3);
  for (const pg of pages) for (const l of pg.lines) {
    assert.ok(l.y >= f.top && l.y + l.lineHeight <= f.bottom + 1e-6, `line at ${l.y}`);
  }
  blocks.forEach((b, bi) => {
    const text = pages.flatMap((p) => p.lines).filter((l) => l.blockIndex === bi && l.kind === "text")
      .map((l) => b.text.slice(l.start, l.end)).join("");
    assert.equal(text, b.text);
  });
});

test("rule 2: Scripture that fits a page is on one page with its citation", () => {
  const scripture: LayoutBlock = { type: "Scripture", text: words(40), citation: "Philippiens 4.4" };
  for (let filler = 1; filler <= linesPerPage + 2; filler++) {
    const pages = layoutPngPages([bodyLines(filler), scripture], T, LH);
    assert.equal(pageOf(pages, 1).length, 1, `filler ${filler}`);
  }
});

test("rule 2: oversized Scripture splits between lines; citation stays with the last line", () => {
  const huge: LayoutBlock = { type: "Scripture", text: words(Math.round((linesPerPage * 2.5 * CPL) / 5)), citation: "Psaume 119" };
  const pages = layoutPngPages([bodyLines(3), huge], T, LH);
  assert.ok(pageOf(pages, 1, "text").length > 1);
  const all = pages.flatMap((p, i) => p.lines.map((l) => ({ ...l, page: i }))).filter((l) => l.blockIndex === 1);
  const cite = all.find((l) => l.kind === "citation")!;
  const last = all.filter((l) => l.kind === "text").at(-1)!;
  assert.equal(cite.page, last.page);
});

test("rule 3: a heading is never last on a page; it moves with the next block", () => {
  for (let filler = 1; filler <= linesPerPage + 2; filler++) {
    const blocks: LayoutBlock[] = [bodyLines(filler), { type: "H1", text: "Point deux" }, bodyLines(3)];
    const pages = layoutPngPages(blocks, T, LH);
    for (const pg of pages) {
      const last = pg.lines[pg.lines.length - 1];
      assert.notEqual(blocks[last.blockIndex].type, "H1", `filler ${filler}`);
    }
    assert.equal(pageOf(pages, 1)[0], pageOf(pages, 2)[0]);
  }
});

test("rule 4: each Scripture starts a new page; headings directly before it move with it", () => {
  const sc = (c: string): LayoutBlock => ({ type: "Scripture", text: words(20), citation: c });
  const blocks: LayoutBlock[] = [
    { type: "Title", text: "Titre" }, bodyLines(1),
    { type: "H1", text: "Un" }, { type: "H2", text: "Texte" }, sc("Jn 1.1"),
    bodyLines(1), sc("Jn 1.2"), sc("Jn 1.3"),
  ];
  const pages = layoutPngPages(blocks, T, LH);
  const firstOnPage = pages.map((p) => p.lines[0].blockIndex);
  // Page 0: title + body. Page 1 starts with H1 (chain H1, H2, Scripture). Then each Scripture.
  assert.deepEqual(firstOnPage, [0, 2, 6, 7]);
  assert.equal(pageOf(pages, 4)[0], 1);
  assert.equal(pageOf(pages, 5)[0], 1); // later text may follow a Scripture
  // Scripture first in the document: no empty page before it.
  assert.equal(layoutPngPages([sc("Jn 1.1")], T, LH).length, 1);
});

test("pngPageCount matches layout", () => {
  const b = [bodyLines(100)];
  assert.equal(pngPageCount(b, T, LH), layoutPngPages(b, T, LH).length);
  assert.equal(pngPageCount([{ type: "Title", text: "X" }], T, LH), 1);
});
