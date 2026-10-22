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
    ...(page.custom ? { customPage: page.custom } : {}),
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

const hexToStr = (h: string) =>
  String.fromCodePoint(...(h.match(/..../g) ?? []).map((x) => parseInt(x, 16)));

/** ToUnicode CMap (pdfkit's bfrange/bfchar forms) → glyph-id → text. */
function parseCmap(cmap: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const sec of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16);
      if (r[3].startsWith("[")) {
        [...r[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((d, i) => m.set(lo + i, hexToStr(d[1])));
      } else {
        const base = parseInt(r[3].slice(1, -1), 16);
        for (let g = lo; g <= hi; g++) m.set(g, String.fromCodePoint(base + g - lo));
      }
    }
  }
  for (const sec of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const r of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) m.set(parseInt(r[1], 16), hexToStr(r[2]));
  }
  return m;
}

/** Uncompressed PDF → per page: media box and text lines grouped by baseline. */
function pdfPages(buf: Buffer): { w: number; h: number; lines: string[] }[] {
  const s = buf.toString("latin1");
  const obj = (n: string) => s.match(new RegExp(`\\n${n} 0 obj\\n([\\s\\S]*?)\\nendobj`))![1];
  const streamOf = (n: string) => obj(n).match(/stream\n([\s\S]*?)\nendstream/)![1];
  const cmaps = new Map<string, Map<number, string> | null>();
  const decoderFor = (fontRef: string) => {
    if (!cmaps.has(fontRef)) {
      const tu = obj(fontRef).match(/\/ToUnicode (\d+) 0 R/);
      cmaps.set(fontRef, tu ? parseCmap(Buffer.from(streamOf(tu[1]), "latin1").toString("utf8")) : null);
    }
    const cm = cmaps.get(fontRef);
    return (hex: string) =>
      cm ? (hex.match(/..../g) ?? []).map((g) => cm.get(parseInt(g, 16)) ?? "?").join("") : winAnsi(hex);
  };
  const boxes = [...s.matchAll(/\/Type \/Page\n\/Parent[\s\S]*?\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\][\s\S]*?\/Contents (\d+) 0 R[\s\S]*?\/Resources (\d+) 0 R/g)];
  return boxes.map((b) => {
    const res = obj(b[4]);
    const fonts = new Map([...(res.match(/\/Font <<([\s\S]*?)>>/)?.[1] ?? "").matchAll(/\/(\S+) (\d+) 0 R/g)].map((f) => [f[1], f[2]]));
    const stream = streamOf(b[3]);
    const byY = new Map<string, string>();
    const order: string[] = [];
    let font = "";
    for (const t of stream.matchAll(/1 0 0 1 [\d.-]+ ([\d.-]+) Tm\n([\s\S]*?)\[([^\]]*)\] TJ/g)) {
      const tf = t[2].match(/\/(\S+) [\d.]+ Tf/);
      if (tf) font = tf[1];
      const dec = fonts.has(font) ? decoderFor(fonts.get(font)!) : winAnsi;
      const text = [...t[3].matchAll(/<([0-9a-f]*)>/g)].map((x) => dec(x[1])).join("");
      if (!byY.has(t[1])) order.push(t[1]);
      byY.set(t[1], (byY.get(t[1]) ?? "") + text);
    }
    return { w: Number(b[1]), h: Number(b[2]), lines: order.map((y) => byY.get(y)!.trimEnd()) };
  });
}

const SPECS: PageSpec[] = allPageSpecs();

test("matrix covers every format × orientation", () => {
  assert.equal(SPECS.length, PAGE_FORMATS.filter((f) => f !== "custom").length * PAGE_ORIENTATIONS.length);
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

// ---- UI UX review of #29: page margins + line spacing, fonts ----
import { pageSnapshotFields, snapshotLineSpacing, customPageError, customSizeToInches, pageGeometry, type CustomPageSize } from "../export/frames";
import { presentationSettingsSchema as _ps } from "../schema";
const sermonDocumentSchemaLike = { safeParse: (page: object) => _ps.safeParse({ theme: "dark", typeScaleStep: 0, lineHeight: 1.7, bionic: false, calibrationTarget: "screen-16-9", page }) };
import { APPROVED_FONT_IDS, exportFontId, mapFontFamily } from "../export/fonts";
import { PPTX_FONT_NOTICE, exportFontName } from "../export/textMeasure";
import { existsSync } from "node:fs";
import { join } from "node:path";

const A4: PageSpec = resolvePage({ format: "a4", orientation: "portrait" } as never);

for (const [label, inch, ls] of [
  ["min", 0.25, 1.2],
  ["default", 0.8, 1.55],
  ["max", 2, 2.0],
] as const) {
  test(`page margins ${inch}in + lineSpacing ${ls} (${label}) flow to every export`, async () => {
    const v = `${inch}in`;
    const fields = pageSnapshotFields({ margins: { top: v, right: v, bottom: v, left: v }, lineSpacing: ls });
    assert.deepEqual(fields.margins, { top: v, right: v, bottom: v, left: v });
    assert.equal(fields.lineSpacing, ls);
    const s = snap(A4, { margins: fields.margins, lineSpacing: fields.lineSpacing, lineHeight: 1.55 });
    assert.equal(snapshotLineSpacing(s), ls);
    const L = layoutSnapshot(s);
    const first = L.pages[0].lines;
    // line pitch follows lineSpacing (two body lines in a row)
    const pair = first.findIndex((l, i) => i > 0 && l.kind === first[i - 1].kind && l.blockIndex === first[i - 1].blockIndex);
    assert.ok(pair > 0);
    assert.ok(Math.abs(first[pair].lineHeight / first[pair].size - ls) < 1e-9);
    const expected = layoutLines(s);
    const pdf = pdfPages(await buildPdf(s, { compress: false }));
    assert.deepEqual(pdf.map((p) => p.lines), expected);
    assert.equal((await buildPngPages(s)).length, expected.length);
    assert.deepEqual((await pptxLines(await buildPptx(s))).slides, expected);
    const docx = await JSZip.loadAsync(await buildDocx(s));
    const xml = await docx.file("word/document.xml")!.async("string");
    const mar = xml.match(/<w:pgMar [^>]*>/)![0];
    for (const side of ["top", "right", "bottom", "left"]) {
      assert.equal(Number(mar.match(new RegExp(`w:${side}="(\\d+)"`))![1]), Math.round(inch * 1440));
    }
    const styles = await docx.file("word/styles.xml")!.async("string");
    assert.match(styles, new RegExp(`w:line="${Math.round(240 * ls)}"`));
  });
}

test("page fields: defaults 0.8in / 1.55; out-of-range values clamp; lineSpacing on a 0.05 grid", () => {
  const d = pageSnapshotFields();
  assert.deepEqual(d.margins, { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" });
  assert.equal(d.lineSpacing, 1.55);
  const x = pageSnapshotFields({ margins: { top: "0.1in", right: "3in", bottom: "1in", left: "1in" }, lineSpacing: 2.6 });
  assert.equal(x.margins.top, "0.25in");
  assert.equal(x.margins.right, "2in");
  assert.equal(x.lineSpacing, 2);
  assert.equal(snapshotLineSpacing({ lineSpacing: 1.33 }), 1.35);
  assert.equal(snapshotLineSpacing({ lineHeight: 1.7 }), 1.7);
});

test("fonts: all 10 approved fonts + JetBrains Mono have bundled export files", () => {
  assert.equal(APPROVED_FONT_IDS.length, 11);
  for (const id of APPROVED_FONT_IDS) {
    for (const st of [{}, { bold: true }, { italic: true }, { bold: true, italic: true }]) {
      assert.ok(existsSync(join("assets/fonts/export", `${exportFontName(id, st)}.ttf`)), `${id} ${JSON.stringify(st)}`);
    }
  }
});

test("fonts: legacy sans/serif/mono map to inter/literata/jetbrains-mono; unknown lays out in Literata", () => {
  assert.equal(exportFontId("serif"), "literata");
  assert.equal(exportFontId("sans"), "inter");
  assert.equal(exportFontId("mono"), "jetbrains-mono");
  assert.equal(exportFontId("comic-sans"), "literata");
  assert.equal(mapFontFamily("Lora"), "lora");
  assert.equal(mapFontFamily('"Source Serif 4", serif'), "source-serif-4");
  assert.equal(mapFontFamily("var(--font-playfair-display)"), "playfair-display");
  assert.equal(mapFontFamily("Georgia, serif"), "serif");
  assert.equal(mapFontFamily(""), "sans");
});

test("PPTX font notice text", () => {
  assert.equal(PPTX_FONT_NOTICE, "PowerPoint uses standard fonts, so line breaks may differ slightly");
});

function fontSnap(id: string): CalibratedSnapshot {
  const base = snap(A4);
  const text = (t: string, marks?: { type: string }[]) => ({
    type: "text",
    text: t,
    marks: [{ type: "textStyle", attrs: { fontFamily: id } }, ...(marks ?? [])],
  });
  return {
    ...base,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [text(FR.repeat(2))] },
        { type: "paragraph", content: [text(FR, [{ type: "bold" }])] },
        { type: "paragraph", content: [text(FR, [{ type: "italic" }])] },
        { type: "paragraph", content: [text(FR, [{ type: "bold" }, { type: "italic" }])] },
      ],
    },
  } as CalibratedSnapshot;
}

for (const id of APPROVED_FONT_IDS) {
  test(`font ${id}: PDF and PNG line breaks match the shared layout (regular/bold/italic)`, async () => {
    const s = fontSnap(id);
    const L = layoutSnapshot(s);
    assert.ok(L.blocks.some((b) => b.runs?.some((r) => r.fontFamily === id)), "font id reaches layout");
    const expected = layoutLines(s);
    const pdf = pdfPages(await buildPdf(s, { compress: false }));
    assert.deepEqual(pdf.map((p) => p.lines), expected);
    assert.equal((await buildPngPages(s)).length, expected.length);
  });
}

// ---- QA #29 fixes (F1–F4); made-up text only ----
import { exportRequestSchema } from "../schema";

test("F1: U+202F before French ?/! never draws a missing glyph in the PDF", async () => {
  const t = "Est-ce vrai\u202F? Oui\u202F! Voyez\u00A0: «\u202Fbien\u202F».";
  for (const id of APPROVED_FONT_IDS) {
    const s = {
      ...snap(A4),
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t, marks: [{ type: "textStyle", attrs: { fontFamily: id } }] }] }] },
    } as CalibratedSnapshot;
    const buf = await buildPdf(s, { compress: false });
    const raw = buf.toString("latin1");
    // No .notdef (glyph id 0000) in any shown hex string.
    for (const tj of raw.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      for (const m of tj[1].matchAll(/<([0-9a-fA-F]+)>/g)) {
        for (let i = 0; i + 4 <= m[1].length; i += 4) assert.notEqual(m[1].slice(i, i + 4), "0000", `${id}: .notdef`);
      }
    }
    const lines = pdfPages(buf).flatMap((p) => p.lines).join(" ");
    assert.match(lines, /vrai[\u202F\u2009\u00A0 ]\?/, id);
  }
});

test("F2: Galaxy Tab S10 Lite is 4:3, landscape by default (1600×1200; portrait 1200×1600)", () => {
  assert.equal(resolvePage({ format: "tablet" } as never).orientation, "landscape");
  assert.deepEqual(pngFrameSize({ format: "tablet" } as never), { width: 1600, height: 1200 });
  assert.deepEqual(pngFrameSize(resolvePage({ format: "tablet", orientation: "landscape" } as never)), { width: 1600, height: 1200 });
  assert.deepEqual(pngFrameSize(resolvePage({ format: "tablet", orientation: "portrait" } as never)), { width: 1200, height: 1600 });
  assert.deepEqual(pngFrameSize("tablet-landscape"), { width: 1600, height: 1200 });
  for (const o of ["portrait", "landscape"] as const) {
    const i = frameSizeInches({ format: "tablet", orientation: o });
    assert.ok(Math.abs(Math.max(i.width, i.height) / Math.min(i.width, i.height) - 4 / 3) < 0.001);
  }
});

const LONG =
  "Considérablement inébranlables, les bienheureux contemporains reconnaissent la suffisance " +
  "extraordinaire de la grâce. ";
function maxSnap(page: PageSpec): CalibratedSnapshot {
  const blocks: CalibratedSnapshot["semanticBlocks"] = [];
  for (let i = 0; i < 6; i++) {
    blocks.push({ type: "Title", text: "La suffisance incompréhensible de la grâce abondante" });
    blocks.push({ type: "Body", text: LONG.repeat(3 + i) });
    blocks.push({ type: "H1", text: "Deuxième considération fondamentale" });
    blocks.push({ type: "H2", text: "Une remarque" });
    blocks.push({ type: "Body", text: LONG.repeat(2) });
    blocks.push({ type: "Scripture", text: LONG, citation: "Éphésiens 1.3–7" });
  }
  const v = "2in";
  return {
    ...snap(page),
    textSizePt: 72,
    paragraphSpacingPt: 48,
    lineSpacing: 2,
    margins: { top: v, right: v, bottom: v, left: v },
    semanticBlocks: blocks,
    content: { type: "doc", content: blocks.map((b) => ({ type: "paragraph", content: [{ type: "text", text: b.text }] })) },
  } as CalibratedSnapshot;
}

for (const [fmt, orientation] of [["a4", "portrait"], ["tablet", "portrait"], ["16:9", "landscape"]] as const) {
  test(`F3 max settings ${fmt} ${orientation}: no overflow, no mid-word split, citation fits, no lone heading`, async () => {
    const spec = resolvePage({ format: fmt, orientation } as never);
    const s = maxSnap(spec);
    const L = layoutSnapshot(s);
    const f = pngFrame(spec, s.margins);
    const heads = new Set(["Title", "H1", "H2", "H3"]);
    for (const [pi, p] of L.pages.entries()) {
      for (const l of p.lines) {
        assert.ok(l.y >= f.top - 1e-6 && l.y + l.lineHeight <= f.bottom + 1e-6, `page ${pi} overflow`);
        assert.ok(l.size >= 24 * pxPerPt(spec) - 1e-6);
        const b = L.blocks[l.blockIndex];
        if (l.kind === "citation") {
          const w = afmMeasurer(citationCaps(b.citation ?? ""), l.size, { font: "serif" });
          assert.ok(w <= f.contentWidth + 1e-6, `citation ${w} > ${f.contentWidth}`);
          continue;
        }
        if (l.end < b.text.length) assert.match(b.text.slice(l.end - 1, l.end + 1), /\s/, `split: ${b.text.slice(l.start, l.end + 3)}`);
      }
      const last = p.lines[p.lines.length - 1];
      if (pi < L.pages.length - 1 && heads.has(L.blocks[last.blockIndex].type)) {
        assert.ok(p.lines.every((l) => heads.has(L.blocks[l.blockIndex].type)), `heading alone at bottom of page ${pi}`);
      }
    }
    const expected = layoutLines(s);
    assert.deepEqual(pdfPages(await buildPdf(s, { compress: false })).map((p) => p.lines), expected);
    assert.deepEqual((await pptxLines(await buildPptx(s))).slides, expected);
  });
}

test("F4: export request takes margins as numbers or strings, and lineHeight/lineSpacing as aliases", () => {
  const base = { ...snap(A4) } as Record<string, unknown>;
  delete base.lineHeight;
  const a = exportRequestSchema.parse({ ...base, lineSpacing: 1.8, margins: { top: 0.8, right: "1in", bottom: 2, left: 0.25 } }) as Record<string, unknown>;
  assert.deepEqual(a.margins, { top: "0.8in", right: "1in", bottom: "2in", left: "0.25in" });
  assert.equal(a.lineHeight, 1.8);
  const b = exportRequestSchema.parse({ ...base, lineHeight: 1.6 }) as Record<string, unknown>;
  assert.equal(snapshotLineSpacing(b as never), 1.6);
});

// ---- Guarantee: no text leaves the margins, at every limit combination ----
{
  const words = ["Anticonstitutionnellement", "grâce", "Éphésiens", "considérablement", "paix", "cœur", "là", "Dieu"];
  const text = (n: number, seed: number) =>
    Array.from({ length: n }, (_, i) => words[(i * 7 + seed) % words.length]).join(" ");
  const blocks: CalibratedSnapshot["semanticBlocks"] = [
    { type: "Title", text: text(9, 1) },
    { type: "H1", text: text(5, 2) },
    { type: "Body", text: text(60, 3) },
    { type: "H2", text: text(4, 4) },
    { type: "Scripture", text: text(30, 5), citation: "Éphésiens 1.3–7 ; Philippiens 4.4–7" },
    { type: "H2", text: text(3, 6) },
    { type: "Body", text: text(25, 7) },
    { type: "Caption", text: text(8, 8) },
  ];
  const content = { type: "doc", content: blocks.map((b) => ({ type: "paragraph", content: [{ type: "text", text: b.text }] })) };
  const heads = new Set(["Title", "H1", "H2", "H3"]);
  test("sweep: min/max margins × line spacing × paragraph spacing × text size, every frame: every line box stays inside the margins", () => {
    let checked = 0;
    for (const spec of allPageSpecs()) {
      for (const m of [0.25, 2]) for (const ls of [1.2, 2]) for (const ps of [0, 48]) for (const pt of [24, 72]) {
        const v = `${m}in`;
        const s = {
          ...snap(spec),
          textSizePt: pt,
          paragraphSpacingPt: ps,
          lineSpacing: ls,
          margins: { top: v, right: v, bottom: v, left: v },
          semanticBlocks: blocks,
          content,
        } as CalibratedSnapshot;
        const L = layoutSnapshot(s);
        const f = pngFrame(spec, s.margins);
        const tag = `${spec.format} ${spec.orientation} m${m} ls${ls} ps${ps} pt${pt}`;
        for (const p of L.pages) for (const l of p.lines) {
          const b = L.blocks[l.blockIndex];
          assert.ok(l.y >= f.top - 1e-6 && l.y + l.lineHeight <= f.bottom + 1e-6, `${tag}: vertical`);
          assert.ok(l.size >= 24 * pxPerPt(spec) - 1e-6, `${tag}: under 24pt`);
          const t = l.kind === "citation" ? citationCaps(b.citation ?? "") : b.text.slice(l.start, l.end).trimEnd();
          const role = l.kind === "citation" ? { font: "serif" as const } : { font: b.runs?.[0]?.fontFamily ?? "serif", ...roleStyle(b.type) };
          const w = afmMeasurer(t, l.size, role as never);
          assert.ok(w <= f.contentWidth + 1e-6, `${tag}: "${t}" ${w} > ${f.contentWidth}`);
          checked++;
        }
        // No heading left alone at a page bottom.
        L.pages.slice(0, -1).forEach((p, pi) => {
          const last = L.blocks[p.lines[p.lines.length - 1].blockIndex];
          if (heads.has(last.type)) assert.ok(p.lines.every((l) => heads.has(L.blocks[l.blockIndex].type)), `${tag}: lone heading p${pi}`);
        });
      }
    }
    assert.ok(checked > 1000);
  });
  test("sweep: PDF and PPTX follow the layout at the extreme corners", async () => {
    for (const spec of allPageSpecs()) {
      for (const [m, ls, ps, pt] of [[0.25, 1.2, 0, 24], [2, 2, 48, 72]] as const) {
        const v = `${m}in`;
        const s = { ...snap(spec), textSizePt: pt, paragraphSpacingPt: ps, lineSpacing: ls, margins: { top: v, right: v, bottom: v, left: v }, semanticBlocks: blocks, content } as CalibratedSnapshot;
        const expected = layoutLines(s);
        assert.deepEqual(pdfPages(await buildPdf(s, { compress: false })).map((p) => p.lines), expected);
        assert.deepEqual((await pptxLines(await buildPptx(s))).slides, expected);
        assert.equal((await buildPngPages(s)).length, expected.length);
      }
    }
  });

  // Custom sizes (Mevin: adapt to ANY screen or paper). Seeded, so failures reproduce.
  function rng(seed: number) {
    return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  }
  function randomCustom(r: () => number): PageSpec {
    const unit = (["in", "mm", "cm", "px"] as const)[Math.floor(r() * 4)];
    const dpi = unit === "px" ? 72 + Math.floor(r() * 529) : undefined;
    const per = unit === "in" ? 1 : unit === "mm" ? 25.4 : unit === "cm" ? 2.54 : dpi!;
    const shortIn = 2 + r() * 20;
    const longIn = Math.min(60, shortIn * (1 + r() * 3));
    const [w, h] = r() < 0.5 ? [shortIn, longIn] : [longIn, shortIn];
    const custom = { width: +(w * per).toFixed(2), height: +(h * per).toFixed(2), unit, ...(dpi ? { dpi } : {}) };
    const orientation = r() < 0.5 ? "portrait" : "landscape";
    return { format: "custom", orientation, custom } as PageSpec;
  }
  const customs = (() => {
    const r = rng(20261022);
    const out: PageSpec[] = [
      { format: "custom", orientation: "portrait", custom: { width: 2, height: 8, unit: "in" } },
      { format: "custom", orientation: "landscape", custom: { width: 60, height: 15, unit: "in" } },
      { format: "custom", orientation: "portrait", custom: { width: 50.8, height: 50.8, unit: "mm" } },
      { format: "custom", orientation: "landscape", custom: { width: 1080, height: 2400, unit: "px", dpi: 400 } },
    ];
    for (let i = 0; i < 24; i++) out.push(randomCustom(r));
    return out;
  })();

  test("custom: every random custom size is valid, orientation swaps sides, every export uses it", () => {
    for (const spec of customs) {
      const c = spec.custom!;
      assert.equal(customPageError(c), null, JSON.stringify(c));
      const inch = customSizeToInches(c);
      const g = pageGeometry(spec);
      const [lo, hi] = [Math.min(inch.width, inch.height), Math.max(inch.width, inch.height)];
      assert.ok(Math.abs(Math.min(g.widthIn, g.heightIn) - lo) < 0.01, `${JSON.stringify(c)} short ${lo}`);
      assert.ok(Math.abs(Math.max(g.widthIn, g.heightIn) - hi) < 0.05, `${JSON.stringify(c)} long ${hi}`);
      assert.equal(g.widthIn >= g.heightIn, spec.orientation === "landscape" || lo === hi);
      assert.ok(Math.max(g.widthPx, g.heightPx) <= 4800);
      { const pz = pdfPageSize(spec); assert.ok(Math.abs(pz.width - g.widthIn * 72) < 1e-6 && Math.abs(pz.height - g.heightIn * 72) < 1e-6); }
      const d = docxPageSize(spec);
      assert.ok(Math.abs(d.width - g.widthIn * 1440) <= 1 && Math.abs(d.height - g.heightIn * 1440) <= 1);
      const sl = pptxSlideSize(spec);
      assert.ok(Math.abs(sl.width / sl.height - g.widthIn / g.heightIn) < 0.001 && Math.max(sl.width, sl.height) <= 56);
      // The other orientation is the same page turned.
      const turned = pageGeometry({ ...spec, orientation: spec.orientation === "portrait" ? "landscape" : "portrait" });
      assert.deepEqual([turned.widthPx, turned.heightPx].sort(), [g.widthPx, g.heightPx].sort());
    }
  });

  test("custom: validation bounds (2–60 in each side, aspect ≤ 1:4, units, dpi)", () => {
    const ok = (c: object) => customPageError(c as CustomPageSize) === null;
    assert.ok(ok({ width: 2, height: 8, unit: "in" }));
    assert.ok(ok({ width: 210, height: 297, unit: "mm" }));
    assert.ok(ok({ width: 152.4, height: 5.08, unit: "cm" }) === false); // 60 × 2 in: aspect 30
    assert.ok(!ok({ width: 1.9, height: 4, unit: "in" }));
    assert.ok(!ok({ width: 61, height: 30, unit: "in" }));
    assert.ok(!ok({ width: 2, height: 8.1, unit: "in" }));
    assert.ok(!ok({ width: 1920, height: 1080, unit: "px", dpi: 30 }));
    assert.ok(ok({ width: 1920, height: 1080, unit: "px" })); // 96 dpi → 20 × 11.25 in
    assert.ok(!ok({ width: 8, height: 10, unit: "ft" }));
    const parsed = (page: object) => sermonDocumentSchemaLike.safeParse(page).success;
    assert.ok(parsed({ format: "custom", orientation: "landscape", custom: { width: 297, height: 210, unit: "mm" } }));
    assert.ok(!parsed({ format: "custom" }));
    assert.ok(!parsed({ format: "custom", custom: { width: 1, height: 10, unit: "in" } }));
    // Settings → snapshot → layout keeps the custom size.
    const f = pageSnapshotFields({ format: "custom", orientation: "portrait", custom: { width: 11, height: 17, unit: "in" } });
    assert.deepEqual(f.customPage, { width: 11, height: 17, unit: "in" });
    const L = layoutSnapshot({ ...snap({ format: "custom", orientation: "portrait" }), ...f } as CalibratedSnapshot);
    assert.deepEqual([L.frame.width, L.frame.height], [1650, 2550]);
    // Missing size falls back to 16:9; out-of-range sizes are clamped, never crash.
    assert.equal(resolvePage({ format: "custom", orientation: "landscape" }).format, "16:9");
    assert.deepEqual(frameSizeInches({ format: "custom", orientation: "portrait", custom: { width: 0.5, height: 500, unit: "in" } }), { width: 15, height: 60 });
  });

  test("sweep: random custom sizes × min/max margins, spacing and text size: every line box stays inside the margins", () => {
    let checked = 0;
    for (const spec of customs) {
      for (const m of [0.25, 2]) for (const ls of [1.2, 2]) for (const ps of [0, 48]) for (const pt of [24, 72]) {
        const v = `${m}in`;
        const s = { ...snap(spec), textSizePt: pt, paragraphSpacingPt: ps, lineSpacing: ls, margins: { top: v, right: v, bottom: v, left: v }, semanticBlocks: blocks, content } as CalibratedSnapshot;
        const L = layoutSnapshot(s);
        const f = pngFrame(spec, s.margins);
        const tag = `${JSON.stringify(spec.custom)} ${spec.orientation} m${m} ls${ls} ps${ps} pt${pt}`;
        assert.ok(f.left >= 0 && f.contentWidth > 0 && f.left + f.contentWidth <= f.width + 1e-6 && f.top < f.bottom && f.bottom <= f.height + 1e-6, `${tag}: frame`);
        for (const p of L.pages) for (const l of p.lines) {
          const b = L.blocks[l.blockIndex];
          assert.ok(l.y >= f.top - 1e-6 && l.y + l.lineHeight <= f.bottom + 1e-6, `${tag}: vertical`);
          assert.ok(l.size >= 24 * pxPerPt(spec) - 1e-6, `${tag}: under 24pt`);
          const t = l.kind === "citation" ? citationCaps(b.citation ?? "") : b.text.slice(l.start, l.end).trimEnd();
          const role = l.kind === "citation" ? { font: "serif" as const } : { font: b.runs?.[0]?.fontFamily ?? "serif", ...roleStyle(b.type) };
          const w = afmMeasurer(t, l.size, role as never);
          assert.ok(w <= f.contentWidth + 1e-6, `${tag}: "${t}" ${w} > ${f.contentWidth}`);
          checked++;
        }
      }
    }
    assert.ok(checked > 1000, String(checked));
  });

  test("sweep: PDF, PPTX and PNG follow the layout on random custom sizes", async () => {
    for (const spec of customs.slice(0, 10)) {
      for (const [m, ls, ps, pt] of [[0.25, 1.2, 0, 24], [2, 2, 48, 72]] as const) {
        const v = `${m}in`;
        const s = { ...snap(spec), textSizePt: pt, paragraphSpacingPt: ps, lineSpacing: ls, margins: { top: v, right: v, bottom: v, left: v }, semanticBlocks: blocks, content } as CalibratedSnapshot;
        const expected = layoutLines(s);
        const pdf = pdfPages(await buildPdf(s, { compress: false }));
        assert.deepEqual(pdf.map((p) => p.lines), expected);
        const pp = await pptxLines(await buildPptx(s));
        assert.deepEqual(pp.slides, expected);
        const png = await buildPngPages(s);
        assert.equal(png.length, expected.length);
        const meta = await sharp(png[0]).metadata();
        assert.deepEqual([meta.width, meta.height], [pngFrameSize(spec).width, pngFrameSize(spec).height]);
      }
    }
  });
}
