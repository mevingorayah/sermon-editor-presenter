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
  assert.ok(countPngPages(snap(40, "paper-a4")) < pages);
});

test("download name: Content-Disposition wins, else Content-Type picks .zip vs .png", () => {
  assert.equal(downloadFilename('attachment; filename="Joie.zip"', "application/zip", "Joie", "png"), "Joie.zip");
  assert.equal(downloadFilename(null, "application/zip", "Joie", "png"), "Joie.zip");
  assert.equal(downloadFilename(null, "application/zip; charset=binary", "Joie", "png"), "Joie.zip");
  assert.equal(downloadFilename(null, "image/png", "Joie", "png"), "Joie.png");
  assert.equal(downloadFilename(null, null, "Joie", "docx"), "Joie.docx");
});

// ---- Shared layout rules (UI UX ruling) ----
import { layoutPngPages, pngFrame, pngPageCount, type LayoutBlock } from "../export/pngLayout";

const T = "screen-16-9"; // 1920x1080, no margins → top 32, bottom 1056
const LH = 1.7; // body line 34px
const words = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");
// Body at 20px: ~1872px column / (0.53*20) ≈ 176 chars per line.
const bodyLines = (lines: number): LayoutBlock => ({ type: "Body", text: words(Math.round(lines * 176 / 6)) });

test("rule 1: lines never straddle a page, and every char is placed exactly once", () => {
  const blocks = [bodyLines(80), bodyLines(45)];
  const pages = layoutPngPages(blocks, T, LH);
  const f = pngFrame(T);
  assert.ok(pages.length > 2);
  for (const pg of pages) for (const l of pg.lines) {
    assert.ok(l.y >= f.top && l.y + l.lineHeight <= f.bottom, `line at ${l.y}`);
  }
  blocks.forEach((b, bi) => {
    const text = pages.flatMap((p) => p.lines).filter((l) => l.blockIndex === bi && l.kind === "text")
      .map((l) => b.text.slice(l.start, l.end)).join("");
    assert.equal(text, b.text);
  });
});

const pageOf = (pages: ReturnType<typeof layoutPngPages>, bi: number, kind?: string) =>
  pages.map((p, i) => (p.lines.some((l) => l.blockIndex === bi && (!kind || l.kind === kind)) ? i : -1)).filter((i) => i >= 0);

test("rule 2: Scripture that fits a page moves whole, with its citation", () => {
  const scripture: LayoutBlock = { type: "Scripture", text: words(150), citation: "Philippiens 4.4" };
  for (let filler = 20; filler <= 30; filler++) {
    const pages = layoutPngPages([bodyLines(filler), scripture], T, LH);
    assert.equal(pageOf(pages, 1).length, 1, `filler ${filler}`);
  }
});

test("rule 2: oversized Scripture splits between lines; citation stays with the last line", () => {
  const huge: LayoutBlock = { type: "Scripture", text: words(1400), citation: "Psaume 119" };
  for (let filler = 0; filler <= 28; filler++) {
    const blocks = filler ? [bodyLines(filler), huge] : [huge];
    const bi = blocks.length - 1;
    const pages = layoutPngPages(blocks, T, LH);
    const textPages = pageOf(pages, bi, "text");
    assert.ok(textPages.length > 1);
    const citePage = pageOf(pages, bi, "citation")[0];
    const lastLine = Math.max(...pages.flatMap((p) => p.lines).filter((l) => l.blockIndex === bi).map((l) => l.lineIndex)) - 1;
    const lastPage = pages.findIndex((p) => p.lines.some((l) => l.blockIndex === bi && l.lineIndex === lastLine && l.kind === "text"));
    assert.equal(citePage, lastPage, `filler ${filler}`);
  }
});

test("rule 3: a heading is never last on a page; it moves with the next block", () => {
  for (let filler = 20; filler <= 30; filler++) {
    const blocks: LayoutBlock[] = [bodyLines(filler), { type: "H1", text: "Point deux" }, bodyLines(10)];
    const pages = layoutPngPages(blocks, T, LH);
    for (const pg of pages) {
      const last = pg.lines[pg.lines.length - 1];
      assert.notEqual(blocks[last.blockIndex].type, "H1", `filler ${filler}`);
    }
    assert.equal(pageOf(pages, 1)[0], pageOf(pages, 2)[0]);
  }
  // Heading followed by a Scripture that fits: all three move together.
  const sc: LayoutBlock = { type: "Scripture", text: words(150), citation: "Jean 3.16" };
  for (let filler = 20; filler <= 28; filler++) {
    const pages = layoutPngPages([bodyLines(filler), { type: "H2", text: "Texte" }, sc], T, LH);
    assert.equal(pageOf(pages, 1)[0], pageOf(pages, 2, "citation")[0]);
  }
});

test("pngPageCount matches layout and the label helper", () => {
  const b = [bodyLines(100)];
  assert.equal(pngPageCount(b, T, LH), layoutPngPages(b, T, LH).length);
  assert.equal(pngPageCount([{ type: "Title", text: "X" }], T, LH), 1);
});
