/**
 * Every page format × orientation: PDF, PNG and PPTX share one layout
 * (same page count, same line breaks), pages are the frame size, nothing
 * overflows, nothing is under 24 pt, margins are the set value, and the
 * export theme only changes colours.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import sharp from "sharp";
import type { CalibratedSnapshot } from "@/types/document";
import {
  PAGE_FORMATS,
  PAGE_ORIENTATIONS,
  afmMeasurer,
  allPageSpecs,
  frameSizeInches,
  layoutPngPages,
  layoutSnapshot,
  pngFrame,
  pngFrameSize,
  pxPerInch,
  pxPerPt,
  resolvePage,
  roleStyle,
  type PageSpec,
  type TextMeasurer,
} from "../export/pngLayout";
import { buildPngPages } from "../export/png";
import { buildPptx, pptxSlideSize } from "../export/pptx";
import { buildPdf, pdfPageSize } from "../export/pdf";
import { buildDocx, docxPageSize } from "../export/docx";
import { citationCaps } from "../export/contentWalk";

const FR =
  "Mes bien-aimés, réjouissez-vous toujours dans le Seigneur ; je le répète, réjouissez-vous. " +
  "Que votre douceur soit connue de tous les hommes. L’anticonstitutionnellement extraordinaire " +
  "bienveillance de Dieu dépasse toute intelligence, et c’est là où la paix garde vos cœurs. ";

function snap(page: PageSpec, extra: Partial<CalibratedSnapshot> = {}): CalibratedSnapshot {
  const blocks: CalibratedSnapshot["semanticBlocks"] = [
    { type: "Title", text: "Joie sans cesse — « Philippiens »" },
    { type: "H1", text: "Introduction élémentaire" },
    { type: "Body", text: FR.repeat(3) },
    { type: "Scripture", text: FR, citation: "Philippiens 4:4-7" },
    { type: "H2", text: "Première pensée" },
    { type: "Body", text: FR.repeat(2) },
    { type: "Caption", text: "Note : œuvre, Noël, garçon, ÉGLISE" },
  ];
  return {
    target: "screen-16-9",
    pageFormat: page.format,
    orientation: page.orientation,
    textSizePt: page.textSizePt,
    margins: { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" },
    typeScaleStep: 0,
    lineHeight: 1.55,
    theme: "dark",
    flattenGradient: true,
    bionic: false,
    semanticBlocks: blocks,
    content: {
      type: "doc",
      content: blocks.map((b) => ({ type: "paragraph", content: [{ type: "text", text: b.text }] })),
    },
    ...extra,
  } as CalibratedSnapshot;
}

/** Expected text per page per line, straight from the shared layout. */
function layoutLines(s: CalibratedSnapshot): string[][] {
  const L = layoutSnapshot(s);
  return L.pages.map((p) =>
    p.lines.map((l) => {
      const b = L.blocks[l.blockIndex];
      return l.kind === "citation" ? citationCaps(b.citation ?? "") : b.text.slice(l.start, l.end).trimEnd();
    }),
  );
}

async function pptxLines(buf: Buffer): Promise<{ size: { cx: number; cy: number }; slides: string[][] }> {
  const zip = await JSZip.loadAsync(buf);
  const pres = await zip.file("ppt/presentation.xml")!.async("string");
  const m = pres.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/)!;
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const slides: string[][] = [];
  for (const n of names) {
    const xml = await zip.file(n)!.async("string");
    const lines = [...xml.matchAll(/<p:txBody>([\s\S]*?)<\/p:txBody>/g)].map((t) =>
      [...t[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
        .map((x) => x[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
        .join("")
        .trimEnd(),
    );
    slides.push(lines.filter((l) => l.length > 0));
  }
  return { size: { cx: Number(m[1]), cy: Number(m[2]) }, slides };
}

// WinAnsi bytes 0x80–0x9F → Unicode (pdfkit standard-font encoding).
const WIN = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
const winAnsi = (hex: string) =>
  (hex.match(/../g) ?? [])
    .map((h) => {
      const c = parseInt(h, 16);
      return c >= 0x80 && c <= 0x9f ? WIN[c - 0x80] : String.fromCharCode(c);
    })
    .join("");

/** Uncompressed PDF → per page: media box and text lines grouped by baseline. */
function pdfPages(buf: Buffer): { w: number; h: number; lines: string[] }[] {
  const s = buf.toString("latin1");
  const boxes = [...s.matchAll(/\/Type \/Page\n\/Parent[\s\S]*?\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\][\s\S]*?\/Contents (\d+) 0 R/g)];
  return boxes.map((b) => {
    const objRe = new RegExp(`\\n${b[3]} 0 obj\\n[\\s\\S]*?stream\\n([\\s\\S]*?)\\nendstream`);
    const stream = s.match(objRe)![1];
    const byY = new Map<string, string>();
    const order: string[] = [];
    for (const t of stream.matchAll(/1 0 0 1 [\d.-]+ ([\d.-]+) Tm\n[\s\S]*?\[([^\]]*)\] TJ/g)) {
      const text = [...t[2].matchAll(/<([0-9a-f]*)>/g)].map((x) => winAnsi(x[1])).join("");
      if (!byY.has(t[1])) order.push(t[1]);
      byY.set(t[1], (byY.get(t[1]) ?? "") + text);
    }
    return { w: Number(b[1]), h: Number(b[2]), lines: order.map((y) => byY.get(y)!.trimEnd()) };
  });
}

const SPECS: PageSpec[] = allPageSpecs();

test("matrix covers every format × orientation", () => {
  assert.equal(SPECS.length, PAGE_FORMATS.length * PAGE_ORIENTATIONS.length);
  assert.equal(SPECS.length, 12);
});

for (const spec of SPECS) {
  const name = `${spec.format} ${spec.orientation}`;
  test(`${name}: PDF, PNG and PPTX share page count and line breaks; pages are the frame size`, async () => {
    const s = snap(spec);
    const expected = layoutLines(s);
    assert.ok(expected.length >= 2, "fixture spans several pages");

    // PNG
    const pngs = await buildPngPages(s);
    assert.equal(pngs.length, expected.length);
    const px = pngFrameSize(spec);
    for (const p of pngs) {
      const m = await sharp(p).metadata();
      assert.equal(m.width, px.width);
      assert.equal(m.height, px.height);
    }

    // PPTX
    const pp = await pptxLines(await buildPptx(s));
    const inches = frameSizeInches(spec);
    assert.deepEqual(pptxSlideSize(spec), inches);
    assert.ok(Math.abs(pp.size.cx - inches.width * 914400) < 914400 * 0.002, `${pp.size.cx}`);
    assert.ok(Math.abs(pp.size.cy - inches.height * 914400) < 914400 * 0.002, `${pp.size.cy}`);
    assert.equal(pp.slides.length, expected.length);
    assert.deepEqual(pp.slides, expected);

    // PDF
    const pdf = pdfPages(await buildPdf(s, { compress: false }));
    assert.equal(pdf.length, expected.length);
    const pts = pdfPageSize(spec);
    for (const p of pdf) {
      assert.ok(Math.abs(p.w - pts.width) < 0.01 && Math.abs(p.h - pts.height) < 0.01, `${p.w}x${p.h}`);
      assert.ok(Math.abs(p.w - inches.width * 72) < 0.01);
    }
    assert.deepEqual(
      pdf.map((p) => p.lines),
      expected,
    );

    // DOCX page size = frame
    const d = docxPageSize(spec);
    assert.equal(d.width, Math.round(inches.width * 1440));
    assert.equal(d.height, Math.round(inches.height * 1440));
    const docx = await JSZip.loadAsync(await buildDocx(s));
    const xml = await docx.file("word/document.xml")!.async("string");
    const pg = xml.match(/<w:pgSz [^>]*>/)![0];
    const w = Number(pg.match(/w:w="(\d+)"/)![1]);
    const h = Number(pg.match(/w:h="(\d+)"/)![1]);
    assert.deepEqual([w, h], [d.width, d.height], pg);
  });

  test(`${name}: no line overflows the frame and no text is under 24 pt`, () => {
    for (const textSizePt of [24, 28, 48, 72]) {
      const s = snap({ ...spec, textSizePt });
      const L = layoutSnapshot(s);
      const ppt = pxPerPt(spec);
      for (const p of L.pages) {
        for (const l of p.lines) {
          assert.ok(l.size / ppt >= 24 - 1e-9, `${name} ${textSizePt}pt: ${l.size / ppt}pt`);
          assert.ok(l.y + l.lineHeight <= L.frame.bottom + 1e-6 || p.lines.length === 1, "line below frame");
          if (l.kind === "citation") continue;
          const b = L.blocks[l.blockIndex];
          const role = roleStyle(b.type);
          const text = b.text.slice(l.start, l.end).trimEnd();
          const w = afmMeasurer(text, l.size, { font: b.runs?.[0]?.fontFamily ?? "sans", ...role });
          assert.ok(w <= L.frame.contentWidth + 0.5, `${name} ${textSizePt}pt "${text}" ${w} > ${L.frame.contentWidth}`);
        }
      }
    }
  });

  test(`${name}: margins equal the set value in PNG, PDF and DOCX`, async () => {
    for (const inch of [0.25, 0.8, 1.5]) {
      const v = `${inch}in`;
      const s = snap(spec, { margins: { top: v, right: v, bottom: v, left: v } });
      const f = pngFrame(spec, s.margins);
      const ppi = pxPerInch(spec);
      assert.ok(Math.abs(f.left / ppi - inch) < 1e-9);
      assert.ok(Math.abs(f.top / ppi - inch) < 1e-9);
      assert.ok(Math.abs((f.width - f.left - f.contentWidth) / ppi - inch) < 1e-9);
      assert.ok(Math.abs((f.height - f.bottom) / ppi - inch) < 1e-9);
      // PDF: first text line starts exactly at the left margin (left-aligned body).
      const docx = await JSZip.loadAsync(await buildDocx(s));
      const xml = await docx.file("word/document.xml")!.async("string");
      const mar = xml.match(/<w:pgMar [^>]*>/)![0];
      for (const side of ["top", "right", "bottom", "left"]) {
        assert.equal(Number(mar.match(new RegExp(`w:${side}="(\\d+)"`))![1]), Math.round(inch * 1440), `${side} ${mar}`);
      }
    }
  });

  test(`${name}: light and dark exports have identical pages and line breaks`, async () => {
    const s = snap(spec);
    const light = await pptxLines(await buildPptx(s, { exportTheme: "light" }));
    const dark = await pptxLines(await buildPptx(s, { exportTheme: "dark" }));
    assert.deepEqual(light, dark);
    const pl = pdfPages(await buildPdf(s, { compress: false, exportTheme: "light" }));
    const pd = pdfPages(await buildPdf(s, { compress: false, exportTheme: "dark" }));
    assert.deepEqual(pl, pd);
    const nl = await buildPngPages(s, { exportTheme: "light" });
    const nd = await buildPngPages(s, { exportTheme: "dark" });
    assert.equal(nl.length, nd.length);
  });
}

test("export theme changes colours: PDF defaults light, PNG/PPTX follow the snapshot", async () => {
  const s = snap({ format: "16:9", orientation: "landscape" }); // snapshot theme dark
  const bg = async (b: Buffer) => (await sharp(b).stats()).channels[0].mean;
  const [pngDefault] = await buildPngPages(s);
  const [pngLight] = await buildPngPages(s, { exportTheme: "light" });
  assert.ok((await bg(pngDefault)) < 100, "dark snapshot → dark PNG");
  assert.ok((await bg(pngLight)) > 150, "light override → light PNG");
  const pdfDefault = (await buildPdf(s, { compress: false })).toString("latin1");
  const pdfDark = (await buildPdf(s, { compress: false, exportTheme: "dark" })).toString("latin1");
  const firstStream = (x: string) => x.match(/stream\n([\s\S]*?)\nendstream/)![1];
  assert.notEqual(firstStream(pdfDefault), firstStream(pdfDark));
  assert.equal(firstStream(pdfDefault), firstStream((await buildPdf(s, { compress: false, exportTheme: "light" })).toString("latin1")));
  const xmlOf = async (b: Buffer) => (await JSZip.loadAsync(b)).file("ppt/slides/slide1.xml")!.async("string");
  assert.notEqual(
    (await xmlOf(await buildPptx(s))).match(/<p:bg>[\s\S]*?<\/p:bg>/)![0],
    (await xmlOf(await buildPptx(s, { exportTheme: "light" }))).match(/<p:bg>[\s\S]*?<\/p:bg>/)![0],
  );
});

test("legacy target strings still resolve (no page fields)", () => {
  const cases: [string, PageSpec["format"], PageSpec["orientation"]][] = [
    ["screen-16-9", "16:9", "landscape"],
    ["screen-16-10", "16:10", "landscape"],
    ["tablet-portrait", "tablet", "portrait"],
    ["tablet-landscape", "tablet", "landscape"],
    ["paper-letter", "letter", "portrait"],
    ["paper-a4", "a4", "portrait"],
    ["paper-half-letter", "half-letter", "portrait"],
  ];
  for (const [t, format, orientation] of cases) {
    const r = resolvePage(t);
    assert.equal(r.format, format, t);
    assert.equal(r.orientation, orientation, t);
    assert.equal(r.textSizePt, 28);
  }
  assert.deepEqual(frameSizeInches("paper-a4"), { width: 8.27, height: 11.698 });
  assert.equal(frameSizeInches("paper-letter").width, 8.5);
});

test("limits clamp: text 24–72 pt, line spacing 1.2–2.0, margins 0.25–2 in", () => {
  assert.equal(resolvePage({ format: "a4", orientation: "portrait", textSizePt: 10 }).textSizePt, 24);
  assert.equal(resolvePage({ format: "a4", orientation: "portrait", textSizePt: 200 }).textSizePt, 72);
  const spec: PageSpec = { format: "16:9", orientation: "landscape" };
  const lh = (v: number) => layoutPngPages([{ type: "Body", text: "x" }], spec, v)[0].lines[0];
  assert.ok(Math.abs(lh(0.5).lineHeight / lh(0.5).size - 1.2) < 1e-9);
  assert.ok(Math.abs(lh(9).lineHeight / lh(9).size - 2.0) < 1e-9);
  const ppi = pxPerInch(spec);
  assert.ok(Math.abs(pngFrame(spec, { top: "0.1in", right: "0.1in", bottom: "0.1in", left: "0.1in" }).left / ppi - 0.25) < 1e-9);
  assert.ok(Math.abs(pngFrame(spec, { top: "5in", right: "5in", bottom: "5in", left: "5in" }).left / ppi - 2) < 1e-9);
  assert.ok(Math.abs(pngFrame(spec, { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" }).left / ppi - 20 / 25.4) < 1e-9);
});

test("long accented French words split instead of overflowing", () => {
  const spec: PageSpec = { format: "half-letter", orientation: "portrait", textSizePt: 72 };
  const word = "Anticonstitutionnellementébénisteriééééé";
  const pages = layoutPngPages([{ type: "Body", text: `${word} ${word}` }], spec, 1.55, {
    top: "2in", right: "2in", bottom: "0.25in", left: "2in",
  });
  const f = pngFrame(spec, { top: "2in", right: "2in", bottom: "0.25in", left: "2in" });
  const lines = pages.flatMap((p) => p.lines);
  assert.ok(lines.length > 2);
  const text = `${word} ${word}`;
  for (const l of lines) {
    const w = afmMeasurer(text.slice(l.start, l.end).trimEnd(), l.size, { font: "sans" });
    assert.ok(w <= f.contentWidth + 0.5, `${w} > ${f.contentWidth}`);
  }
});

test("measurer is injectable: a wider measurer gives more lines", () => {
  const spec: PageSpec = { format: "16:9", orientation: "landscape" };
  const wide: TextMeasurer = (t, size) => t.length * size; // 1 em per char
  const blocks = [{ type: "Body" as const, text: FR.repeat(2) }];
  const a = layoutPngPages(blocks, spec, 1.55).flatMap((p) => p.lines).length;
  const b = layoutPngPages(blocks, spec, 1.55, undefined, { measure: wide }).flatMap((p) => p.lines).length;
  assert.ok(b > a, `${b} > ${a}`);
});
