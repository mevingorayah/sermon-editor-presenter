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
