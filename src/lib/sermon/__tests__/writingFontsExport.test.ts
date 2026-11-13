import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { exportFontId } from "../export/fonts";
import { APP_METRIC_CHARS, APP_WIDTHS } from "../export/appFontMetrics";
import { exportFontName, metricCompatibleCss, metricCompatibleOffice } from "../export/textMeasure";
import { buildPdf } from "../export/pdf";
import { buildPptx } from "../export/pptx";

const FACES = [
  { id: "eb-garamond", css: "EB Garamond", exportFamily: "EB Garamond Export" },
  { id: "crimson-pro", css: "Crimson Pro", exportFamily: "Crimson Pro Export" },
  { id: "noto-serif", css: "Noto Serif", exportFamily: "Noto Serif Export" },
  { id: "source-sans-3", css: "Source Sans 3", exportFamily: "Sermon Export Sans D" },
  { id: "noto-sans", css: "Noto Sans", exportFamily: "Noto Sans Export" },
  { id: "ibm-plex-sans", css: "IBM Plex Sans", exportFamily: "Sermon Export Sans F" },
] as const;

const FRENCH = "éèêàçôûïœ«» ÉÈÊÀÇÔÛÏŒ";

const snapshot = () => ({
  target: "paper-a4",
  theme: "light" as const,
  bionic: false as const,
  lineHeight: 1.55,
  typeScaleStep: 0,
  margins: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
  semanticBlocks: [],
  flattenGradient: true,
  content: {
    type: "doc",
    content: FACES.map((f) => ({
      type: "paragraph",
      content: [{ type: "text", text: `suppléments ${FRENCH}`, marks: [{ type: "textStyle", attrs: { fontFamily: `"${f.css}"` } }] }],
    })),
  },
});

test("each new face has bundled metrics covering French accents", () => {
  for (const f of FACES) {
    assert.equal(exportFontId(f.id), f.id);
    assert.match(metricCompatibleCss(f.id), new RegExp(f.exportFamily.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(metricCompatibleCss(f.id), /Literata Export|Inter Export/);
    assert.equal(metricCompatibleOffice(f.id), f.css);
    for (const style of ["Regular", "Bold", "Italic", "BoldItalic"] as const) {
      const name = `${f.id}-${style}`;
      const widths = APP_WIDTHS[name];
      assert.ok(widths, name);
      for (const ch of FRENCH.replace(/\s/g, "")) {
        const i = APP_METRIC_CHARS.indexOf(ch);
        assert.ok(i >= 0, `metric charset has ${ch}`);
        assert.ok(widths[i] > 0, `${name} missing ${ch}`);
      }
    }
    assert.equal(exportFontName(f.id), `${f.id}-Regular`);
  }
});

test("PDF embeds the real face files; PPTX references the real family names", async () => {
  const pdf = await buildPdf(snapshot() as never, { compress: false });
  const body = pdf.toString("latin1");
  // pdfkit embeds the instanced files by their PostScript names, not the disk id.
  for (const ps of [
    "EBGaramondExport",
    "CrimsonProExport",
    "NotoSerifExport",
    "SermonExportSansD",
    "NotoSansExport",
    "SermonExportSansF",
  ]) {
    assert.match(body, new RegExp(ps));
  }
  assert.doesNotMatch(body, /\/BaseFont \/(Helvetica|Times)/);
  const zip = await JSZip.loadAsync(await buildPptx(snapshot() as never));
  const xml = (
    await Promise.all(
      Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .map((n) => zip.file(n)!.async("string")),
    )
  ).join("\n");
  for (const f of FACES) {
    assert.match(xml, new RegExp(f.css.replace(/ /g, "[ ]?")));
  }
  assert.doesNotMatch(xml, /Times New Roman|Calibri|Literata|Inter Export/);
  assert.match(xml, /suppléments/);
});
