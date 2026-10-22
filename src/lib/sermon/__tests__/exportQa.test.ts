/**
 * QA fixes on #29: per-glyph font fallback (no missing-glyph boxes),
 * keep-with-next headings, and no gap after an opening bracket.
 * All texts are made up for the tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
// @ts-expect-error fontkit ships no types
import * as fontkit from "fontkit";
import type { CalibratedSnapshot } from "@/types/document";
import { APPROVED_FONT_IDS } from "../export/fonts";
import { allPageSpecs, layoutSnapshot, type FitPageSpec, type PageSpec } from "../export/pngLayout";
import { marginMaxIn, maxMarginIn } from "../export/margins";
import { maxTextSizePt } from "../export/frames";
import { presentationSettingsSchema } from "../schema";
import { afmMeasurer, exportFontName, fallbackFontName, splitByCoverage } from "../export/textMeasure";
import { styledBlocksFromSnapshot, trimAfterOpeningBracket, type StyledRun } from "../export/contentWalk";
import { buildPdf } from "../export/pdf";
import { buildPptx } from "../export/pptx";
import { splitRunsByGlyph } from "../export/png";

const DIR = path.join(process.cwd(), "assets/fonts/export");
const SYMBOLS = "↑↓←→↔⇒⇐⇔✓✗★☆•…–—«»‹›€™§¶†‡°±×÷≈≠≤≥∞√∑∏∂∆Ωπµ♥♪☐☑■□▲►◆";
const STYLES = [{}, { bold: true }, { italic: true }, { bold: true, italic: true }];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fontCache = new Map<string, any>();
const open = (name: string) => {
  if (!fontCache.has(name)) fontCache.set(name, fontkit.openSync(path.join(DIR, `${name}.ttf`)));
  return fontCache.get(name);
};

test("glyph fallback: no .notdef for arrows/symbols in any bundled font or style", () => {
  for (const font of APPROVED_FONT_IDS) {
    for (const st of STYLES) {
      const style = { font, ...st };
      for (const piece of splitByCoverage(`En ${SYMBOLS} Lui.`, style)) {
        const name = piece.fallback ? fallbackFontName(style) : exportFontName(font, style);
        for (const ch of piece.text) {
          const g = open(name).glyphForCodePoint(ch.codePointAt(0)!);
          assert.ok(g && g.id !== 0, `${name} draws .notdef for ${ch} (U+${ch.codePointAt(0)!.toString(16)}) in ${font} ${JSON.stringify(st)}`);
        }
      }
    }
  }
});

test("glyph fallback: Lora '↑' is measured with the fallback font's advance", () => {
  assert.equal(splitByCoverage("En ↑ Lui.", { font: "lora" }).map((p) => p.fallback).join(), "false,true,false");
  const fb = open(fallbackFontName({})).glyphForCodePoint(0x2191);
  const want = (Math.round((fb.advanceWidth * 1000) / open(fallbackFontName({})).unitsPerEm) / 1000) * 100;
  assert.ok(Math.abs(afmMeasurer("↑", 100, { font: "lora" }) - want) < 1e-9);
  const runs = splitRunsByGlyph([{ text: "En ↑ Lui.", fontFamily: "lora" }], { bold: false, italic: false });
  assert.deepEqual(runs.map((r) => [r.text, !!r.glyphFallback]), [["En ", false], ["↑", true], [" Lui.", false]]);
});

type AnyPage = PageSpec | FitPageSpec;
function docSnap(page: AnyPage, blocks: CalibratedSnapshot["semanticBlocks"], extra: Partial<CalibratedSnapshot> = {}): CalibratedSnapshot {
  return {
    target: "screen-16-9",
    ...("kind" in page
      ? { pageFormat: "fit-screen", pageSpec: page }
      : {
        pageFormat: page.format,
        orientation: page.orientation,
        textSizePt: page.textSizePt,
        ...(page.custom ? { customPage: page.custom } : {}),
      }),
    margins: { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" },
    typeScaleStep: 0,
    lineHeight: 1.55,
    theme: "light",
    flattenGradient: true,
    bionic: false,
    semanticBlocks: blocks,
    content: {
      type: "doc",
      content: blocks.map((b) => ({
        ...(b.type === "Title" ? { type: "title" }
          : b.type === "H1" || b.type === "H2" ? { type: "heading", attrs: { level: b.type === "H1" ? 1 : 2 } }
            : { type: "paragraph" }),
        content: [{ type: "text", text: b.text, marks: [{ type: "textStyle", attrs: { fontFamily: "Lora" } }] }],
      })),
    },
    ...extra,
  } as CalibratedSnapshot;
}

test("glyph fallback: PDF embeds the fallback font for '↑' in Lora and keeps the shared layout", async () => {
  const spec = allPageSpecs().find((s) => s.format === "a4" && s.orientation === "portrait")!;
  const s = docSnap(spec, [{ type: "Body", text: "Il vint parmi nous. En ↑ Lui. Les flèches ← → ⇒ restent nettes." }]);
  const pdf = (await buildPdf(s, { compress: false })).toString("latin1");
  assert.match(pdf, /DejaVuSans/);
  const pptx = await buildPptx(s);
  assert.ok(pptx.length > 0);
});

const heads = new Set(["Title", "H1", "H2", "H3"]);
/** A line ending inside a word (not at a space or after / … – —). */
const letter = (c: string | undefined) => /\p{L}/u.test(c ?? "");
const midWord = (t: string, end: number) => end < t.length && /\S/.test(t[end])
  && !(/[\s…–—]/.test(t[end - 1]) || (t[end - 1] === "/" && !(letter(t[end - 2]) && letter(t[end]))));
const resolveFit = (width: number, height: number): FitPageSpec => ({ kind: "fit", width, height } as FitPageSpec);
const SENT = "La lumière douce se lève sur les collines et chacun avance avec confiance. ";
function headingDoc(shift: number): CalibratedSnapshot["semanticBlocks"] {
  const blocks: CalibratedSnapshot["semanticBlocks"] = [{ type: "Title", text: "Un chemin tranquille" }];
  for (let i = 0; i < 5; i++) {
    blocks.push({ type: "Body", text: SENT.repeat(1 + ((i * 3 + shift) % 7)) + "Encore un mot. ".repeat(shift % 5) });
    // Real headings are long and wrap (~40 chars), with hyphenated names.
    blocks.push({ type: "H1", text: i === 4 ? "Conclusion" : `Partie ${i + 1} : la paix que Jean-Baptiste annonçait` });
    if (i % 2) blocks.push({ type: "H2", text: "Une petite remarque sur la Bonne-Nouvelle reçue" });
    blocks.push({ type: "Body", text: SENT.repeat(2 + (shift % 3)) });
  }
  return blocks;
}

test("sweep: keep-with-next — no heading ends a page and the next block's first 2 lines follow it (all presets, default + max settings)", () => {
  let checked = 0;
  const fits: FitPageSpec[] = [[1024, 600], [600, 1024], [800, 1280]].map(([w, h]) => resolveFit(w, h));
  for (const spec of [...allPageSpecs(), ...fits]) {
    for (const max of [false, true]) {
      for (let shift = 0; shift < 24; shift++) {
        const v = max ? "2in" : "0.8in"; // 2in is clamped to marginMaxIn(page)
        const extra = max
          ? { textSizePt: 72, paragraphSpacingPt: 48, lineSpacing: 2, margins: { top: v, right: v, bottom: v, left: v } }
          : {};
        const s = docSnap(spec, headingDoc(shift), extra as Partial<CalibratedSnapshot>);
        const L = layoutSnapshot(s);
        const tag = `${"kind" in spec ? `fit ${spec.width}x${spec.height}` : `${spec.format} ${spec.orientation}`} ${max ? "max" : "default"} shift ${shift}`;
        for (const [pi, p] of L.pages.entries()) {
          if (pi === L.pages.length - 1 || p.lines.length === 0) continue;
          const last = L.blocks[p.lines[p.lines.length - 1].blockIndex];
          // Only exception: headings alone taller than a page even at 24 pt
          // with no gaps (e.g. A5 at max) — they fill pages by themselves.
          if (p.lines.every((l) => heads.has(L.blocks[l.blockIndex].type))) continue;
          assert.ok(!heads.has(last.type), `${tag}: heading "${last.text}" is the last block on page ${pi + 1}`);
          for (const l of p.lines) {
            if (l.kind !== "text") continue;
            const t = L.blocks[l.blockIndex].text;
            assert.ok(!midWord(t, l.end), `${tag}: "${t.slice(l.start, l.end)}" breaks inside a word`);
          }
          // Each heading on the page has the next block's first lines (≤ 2) under it.
          for (const l of p.lines) {
            if (!heads.has(L.blocks[l.blockIndex].type)) continue;
            let nb = l.blockIndex + 1;
            while (nb < L.blocks.length && heads.has(L.blocks[nb].type)) nb++;
            if (nb >= L.blocks.length || L.blocks[nb].type === "Scripture") continue;
            const all = L.pages.flatMap((q) => q.lines).filter((q) => q.blockIndex === nb && q.kind === "text").length;
            const here = p.lines.filter((q) => q.blockIndex === nb).length;
            // Only exception: the headings already start the page and they plus
            // two lines are taller than a whole page (huge type on small paper).
            const startsPage = heads.has(L.blocks[p.lines[0].blockIndex].type);
            assert.ok(here >= Math.min(2, all) || (startsPage && here >= 1), `${tag}: "${L.blocks[l.blockIndex].text}" on page ${pi + 1} has ${here} line(s) of what follows`);
          }
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100, `checked ${checked}`);
});

test("opening bracket: a styled run's leading space after '(' is not drawn", () => {
  const runs: StyledRun[] = [{ text: "Voir (", fontFamily: "lora" }, { text: " Galates 1.8", bold: true, fontFamily: "lora" }, { text: ") et la suite.", fontFamily: "lora" }];
  trimAfterOpeningBracket(runs);
  assert.equal(runs.map((r) => r.text).join(""), "Voir (Galates 1.8) et la suite.");
  const spaceOnly: StyledRun[] = [{ text: "Lire [", fontFamily: "lora" }, { text: "  ", italic: true, fontFamily: "lora" }, { text: " Amen", bold: true, fontFamily: "lora" }];
  trimAfterOpeningBracket(spaceOnly);
  assert.equal(spaceOnly.map((r) => r.text).join(""), "Lire [Amen");
  const s = {
    semanticBlocks: [{ type: "Body", text: "Voir ( Galates 1.8)." }],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "Voir (" },
        { type: "text", text: " Galates 1.8", marks: [{ type: "italic" }] },
        { type: "text", text: ")." },
      ] }],
    },
  } as unknown as CalibratedSnapshot;
  const b = styledBlocksFromSnapshot(s).find((x) => x.type === "Body")!;
  assert.equal(b.runs.map((r) => r.text).join(""), "Voir (Galates 1.8).");
});

/** Fill colour of each text object, per PDF page (uncompressed stream). */
function pdfTextColors(pdf: Buffer): string[][] {
  const src = pdf.toString("latin1");
  const streams = [...src.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1]).filter((t) => /\bBT\b/.test(t));
  return streams.map((t) => {
    const out: string[] = [];
    let fill = "";
    for (const m of t.matchAll(/([\d.]+ [\d.]+ [\d.]+) scn|\bBT\b/g)) {
      if (m[1]) fill = m[1];
      else out.push(fill);
    }
    return out;
  });
}

test("rendered PDF: no page ends on a heading, at default and max settings (long wrapped headings)", async () => {
  // Headings get their own colour so they can be found in the drawn PDF.
  const HEAD = "#123456";
  const headRgb = [0x12, 0x34, 0x56].map((v) => String(v / 255)).join(" ");
  const pages: AnyPage[] = [
    allPageSpecs().find((x) => x.format === "a4" && x.orientation === "portrait")!,
    allPageSpecs().find((x) => x.format === "half-letter" && x.orientation === "portrait")!,
    resolveFit(1024, 600),
    resolveFit(600, 1024),
  ];
  let checked = 0;
  for (const page of pages) {
    for (const max of [false, true]) {
      const blocks = headingDoc(3);
      const s = docSnap(page, blocks, (max
        ? { textSizePt: 72, paragraphSpacingPt: 48, lineSpacing: 2, margins: { top: "2in", right: "2in", bottom: "2in", left: "2in" } }
        : {}) as Partial<CalibratedSnapshot>);
      (s.content as { content: Array<{ type: string; content: Array<{ marks: Array<{ attrs: Record<string, unknown> }> }> }> }).content
        .forEach((n) => { if (n.type !== "paragraph") n.content[0].marks[0].attrs.color = HEAD; });
      const drawn = pdfTextColors(await buildPdf(s, { compress: false }));
      assert.equal(drawn.length, layoutSnapshot(s).pages.length);
      drawn.slice(0, -1).forEach((cols, i) => {
        assert.ok(cols.length > 0);
        if (cols.every((c) => c === headRgb)) return; // headings alone taller than a page at 24 pt
        assert.notEqual(cols[cols.length - 1], headRgb, `${JSON.stringify(page)} ${max ? "max" : "default"}: PDF page ${i + 1} ends on a heading`);
        checked++;
      });
      assert.ok(drawn.flat().includes(headRgb), "heading colour found in the PDF");
    }
  }
  assert.ok(checked > 20, `checked ${checked}`);
});

test("words: headings and body break only between words; an oversized word shrinks its line (≥ 24 pt)", () => {
  const spec = allPageSpecs().find((x) => x.format === "half-letter" && x.orientation === "portrait")!;
  const long = "Inébranlables";
  const s = docSnap(spec, [
    { type: "H1", text: `Jésus-Christ et les ${long}` },
    { type: "Body", text: `Il reste ${long} et suffisance pour chacun, même ${long}.` },
  ], { textSizePt: 72, lineSpacing: 2, paragraphSpacingPt: 48, margins: { top: "2in", right: "2in", bottom: "2in", left: "2in" } } as Partial<CalibratedSnapshot>);
  const L = layoutSnapshot(s);
  const ppt = L.frame.contentWidth > 0 ? 1 : 1;
  for (const l of L.pages.flatMap((p) => p.lines)) {
    if (l.kind !== "text") continue;
    const t = L.blocks[l.blockIndex].text;
    assert.ok(!midWord(t, l.end), `"${t.slice(l.start, l.end)}" breaks inside a word`);
    assert.ok(!t.slice(l.start, l.end).trimEnd().endsWith("-"), "no break after a hyphen");
    assert.ok(l.y + l.lineHeight <= L.frame.bottom + 1e-6, "line clipped at the bottom");
  }
  // The body keeps its size except on the line holding the oversized word.
  const body = L.pages.flatMap((p) => p.lines).filter((l) => L.blocks[l.blockIndex].type === "Body");
  const sizes = new Set(body.map((l) => Math.round(l.size * 1000)));
  assert.ok(sizes.size > 1 && Math.max(...body.map((l) => l.size)) > Math.min(...body.map((l) => l.size)) * ppt);
});

test("margins: max is min(2 in, 20% of the shorter side), clamped (never rejected) in settings and exports", () => {
  const hl = allPageSpecs().find((x) => x.format === "half-letter" && x.orientation === "portrait")!;
  const a4 = allPageSpecs().find((x) => x.format === "a4" && x.orientation === "portrait")!;
  assert.equal(marginMaxIn(hl), 1.1);
  assert.equal(marginMaxIn(a4), 1.65);
  assert.equal(maxMarginIn({ format: "letter", orientation: "portrait" }), 1.7);
  assert.equal(marginMaxIn({ format: "legal", orientation: "landscape" }), 1.7);
  const s = docSnap(hl, [{ type: "Body", text: "Un mot." }], { margins: { top: "2in", right: "2in", bottom: "0.5in", left: "50mm" } } as Partial<CalibratedSnapshot>);
  const L = layoutSnapshot(s);
  const ppi = L.frame.left / 1.1;
  assert.ok(Math.abs(L.frame.top / ppi - 1.1) < 1e-9);
  assert.ok(Math.abs((L.frame.height - L.frame.bottom) / ppi - 0.5) < 1e-9);
  const parsed = presentationSettingsSchema.safeParse({
    theme: "light", typeScaleStep: 0, lineHeight: 1.55, bionic: false, calibrationTarget: "paper-a4",
    page: { format: "half-letter", orientation: "portrait", margins: { top: "2in", right: "1in", bottom: "1.5in", left: "0.5in" } },
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.deepEqual(parsed.data!.page!.margins, { top: "1.1in", right: "1in", bottom: "1.1in", left: "0.5in" });
});

test("PDF: a run is advanced by the width actually drawn (U+202F fallback), so no gap after '('", async () => {
  const spec = allPageSpecs().find((x) => x.format === "a4" && x.orientation === "portrait")!;
  const para = (pre: string) => ({ type: "paragraph", content: [
    { type: "text", text: pre },
    { type: "text", text: "Galates 1.8", marks: [{ type: "textStyle", attrs: { color: "#5c4a1f", fontFamily: null } }, { type: "italic" }] },
    { type: "text", text: ")." },
  ] });
  const xs = async (pre: string) => {
    const s = docSnap(spec, [{ type: "Body", text: "x" }]);
    s.content = { type: "doc", content: [para(pre)] } as CalibratedSnapshot["content"];
    s.semanticBlocks = [{ type: "Body", text: `${pre}Galates 1.8).` }];
    const src = (await buildPdf(s, { compress: false })).toString("latin1");
    return [...src.matchAll(/1 0 0 1 ([\d.]+) [\d.]+ Tm/g)].map((m) => Number(m[1]));
  };
  // Narrow no-break space (French « ! ») vs a thin space: the italic run must
  // start right after the "(" either way (same advance as what is drawn).
  const nnbsp = await xs("« Amen\u202f!\u00a0» (");
  const thin = await xs("« Amen\u2009!\u00a0» (");
  assert.equal(nnbsp.length, 3);
  assert.ok(Math.abs(nnbsp[1] - thin[1]) < 0.01, `italic run at ${nnbsp[1]} vs ${thin[1]}`);
});

test("words: a '/' between letters is not a break; the joined word shrinks its line instead (≥ 24 pt)", () => {
  for (const format of ["a5", "half-letter"]) {
    const spec = allPageSpecs().find((x) => x.format === format && x.orientation === "portrait")!;
    const joined = "rassemblées/unies";
    const s = docSnap(spec, [{ type: "Body", text: `Les brebis ${joined} reviennent au berger.` }],
      { textSizePt: 72, lineSpacing: 2, paragraphSpacingPt: 48, margins: { top: "2in", right: "2in", bottom: "2in", left: "2in" } } as Partial<CalibratedSnapshot>);
    const L = layoutSnapshot(s);
    const lines = L.pages.flatMap((p) => p.lines).filter((l) => l.kind === "text");
    const t = L.blocks[0].text;
    const holder = lines.find((l) => t.slice(l.start, l.end).includes(joined));
    assert.ok(holder, `${format}: "${joined}" stays on one line: ${lines.map((l) => JSON.stringify(t.slice(l.start, l.end))).join(" | ")}`);
    const others = lines.filter((l) => l !== holder);
    assert.ok(others.length > 0 && holder.size < others[0].size, `${format}: only the line with the joined word shrinks`);
    assert.ok(holder.size >= 24 * (others[0].size / 48) - 1e-6, `${format}: floor 24 pt`);
    for (const l of lines) assert.ok(!midWord(t, l.end));
  }
});

test("text size: max is 48 pt on A5 and half-letter, 72 pt elsewhere; exports clamp to it", () => {
  for (const f of ["a5", "half-letter"]) assert.equal(maxTextSizePt(f), 48);
  for (const f of ["a4", "letter", "legal", "4:3", "16:10", "16:9", "custom", "fit-screen"]) assert.equal(maxTextSizePt(f), 72);
  const text: CalibratedSnapshot["semanticBlocks"] = [{ type: "H1", text: "Un titre" }, { type: "Body", text: SENT.repeat(3) }];
  for (const spec of allPageSpecs()) {
    const at = (pt: number) => layoutSnapshot(docSnap(spec, text, { textSizePt: pt } as Partial<CalibratedSnapshot>));
    const cap = maxTextSizePt(spec.format);
    const sizes = (L: ReturnType<typeof at>) => L.pages.flatMap((p) => p.lines.map((l) => l.size));
    assert.deepEqual(sizes(at(72)), sizes(at(cap)), `${spec.format} ${spec.orientation}: 72 pt renders as ${cap} pt`);
    if (cap < 72) assert.notDeepEqual(sizes(at(40)), sizes(at(cap)));
  }
  const fit = layoutSnapshot(docSnap(resolveFit(1024, 600), text, { textSizePt: 72 } as Partial<CalibratedSnapshot>));
  const fit60 = layoutSnapshot(docSnap(resolveFit(1024, 600), text, { textSizePt: 60 } as Partial<CalibratedSnapshot>));
  assert.notDeepEqual(fit.pages[0].lines[0].size, fit60.pages[0].lines[0].size, "fit-screen keeps 72 pt");
});

test("words: a joined word too wide even at 24 pt breaks after its '/', never inside a word", () => {
  for (const format of ["a5", "half-letter"]) {
    const spec = allPageSpecs().find((x) => x.format === format && x.orientation === "portrait")!;
    const joined = "réconfortements/encouragements"; // wider than the column at 24 pt
    const s = docSnap(spec, [{ type: "Body", text: `Il donne ${joined} chaque matin.` }],
      { textSizePt: 72, lineSpacing: 2, paragraphSpacingPt: 48, margins: { top: "2in", right: "2in", bottom: "2in", left: "2in" } } as Partial<CalibratedSnapshot>);
    const L = layoutSnapshot(s);
    const t = L.blocks[0].text;
    const lines = L.pages.flatMap((p) => p.lines).filter((l) => l.kind === "text");
    const shown = lines.map((l) => t.slice(l.start, l.end).trimEnd());
    const i = shown.indexOf("réconfortements/");
    assert.ok(i >= 0 && shown[i + 1] === "encouragements", `${format}: ${shown.join(" | ")}`);
    const base = Math.max(...lines.map((l) => l.size));
    for (const l of lines) assert.ok(l.size >= base * (24 / 48) - 1e-6, `${format}: floor 24 pt`);
    for (const l of lines.slice(0, -1)) {
      const c = t[l.end - 1];
      assert.ok(/\s/.test(c) || c === "/", `${format}: "${t.slice(l.start, l.end)}" ends inside a word`);
    }
  }
});
