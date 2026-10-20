import { describe, it } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { filenameWithExt, sanitizeFilenameStem } from "../export/filename";
import { buildDocx, docxPageSize } from "../export/docx";
import { buildPptx } from "../export/pptx";
import { citationCaps } from "../export/contentWalk";
import { POST } from "../../../app/api/export/route";

const snapshot = (target = "paper-letter") => ({
  target,
  theme: "light",
  bionic: false,
  margins: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
  semanticBlocks: [],
  content: {
    type: "doc",
    content: [
      { type: "paragraph", content: [
        { type: "text", text: "under", marks: [{ type: "underline" }] },
        { type: "text", text: " gone", marks: [{ type: "strike" }] },
      ] },
      { type: "scripture", attrs: { citation: "Philippiens 4:4" },
        content: [{ type: "paragraph", content: [{ type: "text", text: "Réjouissez-vous" }] }] },
    ],
  },
});

async function xml(buf: Buffer, path: RegExp) {
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files).filter((f) => path.test(f));
  return (await Promise.all(files.map((f) => zip.file(f)!.async("string")))).join("\n");
}

describe("export fixes after batch 8b1ba7a", () => {
  it("keeps a second extension: a.pdf.docx", () => {
    const stem = sanitizeFilenameStem("a.pdf.docx");
    assert.equal(stem, "a.pdf");
    assert.equal(filenameWithExt(stem, "docx"), "a.pdf.docx");
  });
  it("citations print in capitals, accents kept", () => {
    assert.equal(citationCaps("Ésaïe 40:31"), "ÉSAÏE 40:31");
  });
  it("DOCX page size follows the target", () => {
    assert.equal(docxPageSize("paper-letter").width, 12240);
    assert.equal(docxPageSize("paper-a4").width, Math.round(8.27 * 1440));
    assert.ok(docxPageSize("screen-16-9").width > docxPageSize("screen-16-9").height);
  });
  it("DOCX keeps underline, strike, Letter size and caps citation", async () => {
    const d = await xml(await buildDocx(snapshot() as never), /word\/document\.xml/);
    assert.match(d, /<w:u w:val="single"\/>/);
    assert.match(d, /<w:strike\/>/);
    assert.match(d, /w:w="12240"/);
    assert.match(d, /PHILIPPIENS 4:4/);
  });
  it("PPTX keeps underline, strike and caps citation", async () => {
    const d = await xml(await buildPptx(snapshot("screen-16-9") as never), /ppt\/slides\/slide\d+\.xml/);
    assert.match(d, /u="sng"/);
    assert.match(d, /strike="sngStrike"/);
    assert.match(d, /PHILIPPIENS 4:4/);
  });
  it("non-JSON body returns 400 NOT_JSON", async () => {
    const res = await POST(new Request("http://x/api/export", { method: "POST", body: "{nope" }));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "NOT_JSON");
  });
});

describe("long sermon export (retest 9facff1)", () => {
  const long = (target: string) => {
    const para = (i: number) => ({ type: "paragraph", content: [{ type: "text", text: `Paragraphe ${i} : ` + "Christ suffit, et sa Parole seule suffit ; rien ne manque ! ".repeat(12) }] });
    return { ...snapshot(target), lineHeight: 1.7, typeScaleStep: 0,
      content: { type: "doc", content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Introduction" }] },
        ...Array.from({ length: 30 }, (_, i) => para(i)),
        { type: "scripture", attrs: { citation: "Romains 6.1–11" }, content: [{ type: "text", text: "Que dirons-nous donc ? ".repeat(60) }] },
        { type: "paragraph", content: [{ type: "text", text: "Amen. FIN-DU-SERMON" }] },
      ] } };
  };
  it("PPTX keeps every paragraph, the reading and the last line", async () => {
    const d = await xml(await buildPptx(long("screen-16-9") as never), /ppt\/slides\/slide\d+\.xml/);
    for (let i = 0; i < 30; i++) assert.match(d, new RegExp(`Paragraphe ${i} `));
    assert.match(d, /ROMAINS 6\.1–11/);
    assert.match(d, /FIN-DU-SERMON/);
  });
  it("PNG returns every page in a zip when one frame isn't enough", async () => {
    const { exportSnapshot } = await import("../export");
    const r = await exportSnapshot(long("screen-16-9") as never, "png", { filenameStem: "long" });
    assert.equal(r.contentType, "application/zip");
    assert.equal(r.filename, "long.zip");
    const zip = await JSZip.loadAsync(r.buffer);
    const names = Object.keys(zip.files);
    assert.ok(names.length > 1);
    assert.equal(names[0], "long-01.png");
  });
  it("PDF embeds Literata, not Helvetica or Times", async () => {
    const { buildPdf } = await import("../export/pdf");
    const pdf = (await buildPdf(long("paper-a4") as never)).toString("latin1");
    assert.match(pdf, /Literata/);
    assert.doesNotMatch(pdf, /\/BaseFont \/(Helvetica|Times)/);
  });
});
