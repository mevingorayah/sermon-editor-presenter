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
