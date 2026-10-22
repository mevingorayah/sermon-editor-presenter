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
import { allPageSpecs, layoutSnapshot, type PageSpec } from "../export/pngLayout";
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

function docSnap(page: PageSpec, blocks: CalibratedSnapshot["semanticBlocks"], extra: Partial<CalibratedSnapshot> = {}): CalibratedSnapshot {
  return {
    target: "screen-16-9",
    pageFormat: page.format,
    orientation: page.orientation,
    textSizePt: page.textSizePt,
    ...(page.custom ? { customPage: page.custom } : {}),
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
const SENT = "La lumière douce se lève sur les collines et chacun avance avec confiance. ";
function headingDoc(shift: number): CalibratedSnapshot["semanticBlocks"] {
  const blocks: CalibratedSnapshot["semanticBlocks"] = [{ type: "Title", text: "Un chemin tranquille" }];
  for (let i = 0; i < 5; i++) {
    blocks.push({ type: "Body", text: SENT.repeat(1 + ((i * 3 + shift) % 7)) + "Encore un mot. ".repeat(shift % 5) });
    blocks.push({ type: "H1", text: i === 4 ? "Conclusion" : `Partie ${i + 1}` });
    if (i % 2) blocks.push({ type: "H2", text: "Une petite remarque" });
    blocks.push({ type: "Body", text: SENT.repeat(2 + (shift % 3)) });
  }
  return blocks;
}

test("sweep: keep-with-next — no heading ends a page and the next block's first 2 lines follow it (all presets, default + max settings)", () => {
  let checked = 0;
  for (const spec of allPageSpecs()) {
    for (const max of [false, true]) {
      for (let shift = 0; shift < 24; shift++) {
        const v = max ? "2in" : "0.8in";
        const extra = max
          ? { textSizePt: 72, paragraphSpacingPt: 48, lineSpacing: 2, margins: { top: v, right: v, bottom: v, left: v } }
          : {};
        const s = docSnap(spec, headingDoc(shift), extra as Partial<CalibratedSnapshot>);
        const L = layoutSnapshot(s);
        const tag = `${spec.format} ${spec.orientation} ${max ? "max" : "default"} shift ${shift}`;
        for (const [pi, p] of L.pages.entries()) {
          if (pi === L.pages.length - 1 || p.lines.length === 0) continue;
          const last = L.blocks[p.lines[p.lines.length - 1].blockIndex];
          if (p.lines.every((l) => heads.has(L.blocks[l.blockIndex].type))) continue; // only headings fit
          assert.ok(!heads.has(last.type), `${tag}: heading "${last.text}" is the last block on page ${pi + 1}`);
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
