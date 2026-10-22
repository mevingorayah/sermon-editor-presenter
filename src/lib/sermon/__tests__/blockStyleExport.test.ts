/** Builder block styles in exports (made-up text only). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { CalibratedSnapshot } from "@/types/document";
import { legacySnapshot, LEGACY_PAGES } from "./fixtures/legacySermon";
import golden from "./fixtures/legacyGolden.json";
import { layoutSnapshot, pngFrame } from "../export/pngLayout";
import { buildPngPages } from "../export/png";
import { buildDocx } from "../export/docx";
import { buildPptx } from "../export/pptx";
import { buildPdf } from "../export/pdf";
import { allPageSpecs, pageSnapshotFields, pxPerPt } from "../export/frames";
import { calibratedSnapshotSchema } from "../schema";
import { parseSermonFile, serializeSermonFile } from "@/lib/sermon-file";

const h = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const T = (text: string) => ({ type: "text", text });
const WORDS = "Phrase inventée pour l’essai, avec quelques mots ordinaires et un exemple assez long. ";

test("old sermons (no styles) render byte-identical: layout, PNG, PPTX, DOCX", async () => {
  for (const [i, p] of LEGACY_PAGES.entries()) {
    for (const theme of ["dark", "light"] as const) {
      const s = legacySnapshot({ ...(p as object), theme });
      const z = await JSZip.loadAsync(await buildPptx(s));
      const slides = Object.keys(z.files).filter((f) => /slides\/slide\d+\.xml$/.test(f)).sort();
      const xml = (await Promise.all(slides.map((f) => z.file(f)!.async("string")))).join("|");
      const dz = await JSZip.loadAsync(await buildDocx(s));
      const got = {
        layout: h(JSON.stringify(layoutSnapshot(s))),
        png: (await buildPngPages(s)).map(h),
        pptx: h(xml),
        docx: h(await dz.file("word/document.xml")!.async("string")),
      };
      assert.deepEqual(got, (golden as Record<string, unknown>)[`${i}-${theme}`], `${i}-${theme}`);
    }
  }
});

function styled(extra: Partial<CalibratedSnapshot> = {}, size = 30, cols = 2): CalibratedSnapshot {
  const col = (n: number) => ({ type: "column", content: [{ type: "paragraph", content: [T(`Colonne ${n} : ` + WORDS)] }] });
  return legacySnapshot({
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, style: { weight: 400, color: "#123456", align: "right" } }, content: [T("Titre léger inventé")] },
        { type: "paragraph", attrs: { style: { size, font: "jetbrains-mono", highlight: "#FFF176" }, spacing: { mt: 20, mb: 20 } }, content: [T(WORDS)] },
        { type: "quote", content: [T("Citation inventée " + WORDS)] },
        { type: "illustration", attrs: { style: { background: "#F6F3EA", borderLeft: null } }, content: [T("Récit inventé " + WORDS)] },
        { type: "section", content: Array.from({ length: cols }, (_, i) => col(i + 1)) },
      ],
    } as CalibratedSnapshot["content"],
    ...extra,
  });
}

test("styles: size (24pt floor), weight, colour, align, highlight, font", () => {
  const L = layoutSnapshot(styled({}, 10));
  const b = L.styled;
  assert.equal(b[0].look?.weight, 400);
  assert.ok(b[0].runs.every((r) => !r.bold), "weight 400 overrides heading bold");
  assert.equal(b[0].look?.color, "#123456");
  assert.equal(b[1].runs[0].fontFamily, "jetbrains-mono");
  const body = L.pages.flatMap((p) => p.lines).find((l) => l.blockIndex === 1)!;
  assert.ok(Math.abs(body.size - 24 * pxPerPt(L.target)) < 1e-6, "10pt is floored to 24pt");
  const big = layoutSnapshot(styled({}, 60)).pages.flatMap((p) => p.lines).find((l) => l.blockIndex === 1)!;
  assert.ok(big.size > body.size, "size applies");
});

test("quote and illustration draw boxes; borderLeft null removes the rule", () => {
  const L = layoutSnapshot(styled());
  const boxes = L.pages.flatMap((p) => p.boxes ?? []);
  assert.ok(boxes.some((x) => x.border === "#BDBDBD"), "quote rule");
  assert.ok(boxes.some((x) => x.fill === "#F6F3EA" && !x.border), "illustration fill, no rule");
});

test("columns side by side when wide, stacked when narrow; never off the page", () => {
  const wide = layoutSnapshot(styled({}, 30, 2));
  const colLines = wide.pages.flatMap((p) => p.lines).filter((l) => wide.styled[l.blockIndex].column);
  const xs = new Set(colLines.map((l) => Math.round(l.x!)));
  assert.equal(xs.size, 2, "two columns");
  const narrow = layoutSnapshot(styled({ pageFormat: "half-letter", orientation: "portrait", textSizePt: 72, margins: { top: "2in", right: "2in", bottom: "2in", left: "2in" } } as never, 72, 3));
  const nx = new Set(narrow.pages.flatMap((p) => p.lines).filter((l) => narrow.styled[l.blockIndex].column).map((l) => Math.round(l.x!)));
  assert.equal(nx.size, 1, "stacked");
});

test("max settings sweep: no line or box outside the margins, all frames", async () => {
  let checked = 0;
  const seen = new Set<string>();
  for (const spec of allPageSpecs()) {
    for (const m of ["0.25in", "2in"]) for (const pt of [24, 96]) for (const cols of [1, 2, 3]) {
      const s = styled(pageSnapshotFields({ ...spec, textSizePt: 72, lineSpacing: 2, paragraphSpacingPt: 48, margins: { top: m, right: m, bottom: m, left: m } }) as never, pt, cols);
      const L = layoutSnapshot(s);
      const f = L.frame;
      assert.equal(L.target.format, spec.format);
      seen.add(`${f.width}x${f.height}`);
      for (const p of L.pages) {
        for (const l of p.lines) {
          const x = l.x ?? f.left, w = l.width ?? f.contentWidth;
          assert.ok(l.y >= f.top - 1e-6 && l.y + l.lineHeight <= f.bottom + 1e-6, `${spec.format} ${m} vertical`);
          assert.ok(x >= f.left - 1e-6 && x + w <= f.left + f.contentWidth + 1e-6, "horizontal");
          checked++;
        }
        for (const b of p.boxes ?? []) assert.ok(b.y >= 0 && b.y + b.h <= f.height + 1e-6 && b.x + b.w <= f.left + f.contentWidth + 1e-6, "box");
      }
    }
  }
  assert.ok(checked > 200);
  assert.ok(seen.size > 1, "sweep covers several frames");
  const s = styled();
  assert.ok((await buildPdf(s)).length > 0);
  assert.ok((await buildPngPages(s)).length > 0);
  const dx = await (await JSZip.loadAsync(await buildDocx(s))).file("word/document.xml")!.async("string");
  assert.match(dx, /F6F3EA/i);
  assert.match(dx, /123456/);
  const px = await JSZip.loadAsync(await buildPptx(s));
  const sx = await px.file("ppt/slides/slide1.xml")!.async("string");
  assert.match(sx, /123456/);
});

test("schemas accept globalStyles; .sermon keeps and checks them", () => {
  const snap = { ...legacySnapshot(), globalStyles: { quote: { style: { color: "#112233" } } } };
  assert.ok(calibratedSnapshotSchema.safeParse(snap).success);
  const doc = { id: "local-test", title: "Essai", updatedAt: new Date(0).toISOString(), content: { type: "doc", content: [] }, presentationSettings: undefined, notes: "", globalStyles: { quote: { style: { color: "#112233" } } } };
  const text = serializeSermonFile({ ...doc } as never);
  const legacyServer = JSON.stringify({ id: "local-x", meta: { title: "Ancien", updatedAt: new Date(0).toISOString() }, content: { type: "doc", content: [] }, globalStyles: { quote: { style: { color: "#112233" } } } });
  assert.deepEqual((parseSermonFile(legacyServer).sermon as { globalStyles?: unknown }).globalStyles, { quote: { style: { color: "#112233" } } });
  assert.throws(() => parseSermonFile(legacyServer.replace("#112233", "not-a-colour")));
  void text;
});
