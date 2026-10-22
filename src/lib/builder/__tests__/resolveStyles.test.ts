import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/core";
import { resolveBuilderStyles } from "../resolveStyles";
import { buildCalibratedSnapshot } from "../../calibration";
import { buildExportPayload } from "../../export-client/payload";
import { exportRequestSchema } from "../../sermon/schema";
import { createInputFromDoc } from "../../autosave/autosaveController";
import type { SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";

// Made-up fixture only.
const doc: JSONContent = { type: "doc", content: [
  { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Fixture heading" }] },
  { type: "paragraph", attrs: { style: { color: "#8F3A3A" } }, content: [{ type: "text", text: "Fixture body" }] },
  { type: "section", attrs: { columns: 2 }, content: [
    { type: "column", content: [{ type: "paragraph", content: [{ type: "text", text: "Left" }] }] },
    { type: "column", content: [{ type: "quote", content: [{ type: "text", text: "Right quote" }] }] },
  ] },
] };

describe("resolveBuilderStyles", () => {
  it("returns the same object when there are no global styles", () => {
    assert.equal(resolveBuilderStyles(doc, undefined), doc);
    assert.equal(resolveBuilderStyles(doc, {}), doc);
    assert.equal(resolveBuilderStyles(doc, { paragraph: {} }), doc);
  });
  it("merges globals under block values, including inside sections", () => {
    const out = resolveBuilderStyles(doc, {
      paragraph: { style: { font: "inter", color: "#111111" }, spacing: { mb: 12 } },
      quote: { style: { italic: true } },
    });
    const [h, p, sec] = out.content!;
    assert.equal(h.attrs?.style, undefined);
    assert.deepEqual(p.attrs?.style, { font: "inter", color: "#8F3A3A" });
    assert.deepEqual(p.attrs?.spacing, { mb: 12 });
    assert.deepEqual(sec.content![0].content![0].attrs?.style, { font: "inter", color: "#111111" });
    assert.deepEqual(sec.content![1].content![0].attrs?.style, { italic: true });
    assert.equal(doc.content![1].attrs?.style.font, undefined, "input not mutated");
  });
});

describe("export payload carries block styles", () => {
  it("resolved style/spacing and builder nodes pass the export request schema", () => {
    const content = resolveBuilderStyles(doc, { paragraph: { style: { size: 30 }, spacing: { pl: 24 } } });
    const snapshot = buildCalibratedSnapshot({ target: "screen-16-9", typeScaleStep: 0, lineHeight: 1.7, theme: "light", content: content as never });
    for (const format of ["pdf", "png", "pptx"] as const) {
      const payload = buildExportPayload({ snapshot, format, filenameStem: "fixture", includeNotes: false, notes: "", accentHex: "#2B6CB0" });
      const body = JSON.parse(JSON.stringify(payload));
      assert.deepEqual(body.content.content[1].attrs.style, { size: 30, color: "#8F3A3A" });
      assert.deepEqual(body.content.content[1].attrs.spacing, { pl: 24 });
      assert.equal(body.content.content[2].type, "section");
      const r = exportRequestSchema.safeParse(body);
      assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
    }
  });
});

describe("sermon.globalStyles is part of the sermon", () => {
  it("is sent when creating/restoring a sermon on the server, and omitted when absent", () => {
    const base: SermonDocument = { id: "local-1", title: "Fixture", updatedAt: "2026-01-01T00:00:00.000Z", content: doc as never, presentationSettings: DEFAULT_PRESENTATION_SETTINGS, notes: "" };
    assert.equal("globalStyles" in createInputFromDoc(base), false);
    const gs = { heading: { style: { font: "lora" as const } } };
    assert.deepEqual(createInputFromDoc({ ...base, globalStyles: gs }).globalStyles, gs);
    // A .sermon file stores the SermonDocument as JSON: globalStyles round-trips.
    const back = JSON.parse(JSON.stringify({ ...base, globalStyles: gs })) as SermonDocument;
    assert.deepEqual(back.globalStyles, gs);
  });
});

describe("Preach / page view renders block styles like Edit", () => {
  it("applies resolved style + spacing, clamps size to 24pt, renders builder nodes", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement, Fragment } = await import("react");
    const { renderSermon } = await import("../../reading/renderSermon");
    const content = resolveBuilderStyles(doc, { paragraph: { style: { size: 12, highlight: "#FFF3B0" }, spacing: { pl: 24 } } });
    const html = renderToStaticMarkup(createElement(Fragment, null, renderSermon(content, { bionic: false, theme: "light" })));
    assert.match(html, /color:#8F3A3A/i);
    assert.match(html, /font-size:24pt/);
    assert.match(html, /padding-left:24px/);
    assert.match(html, /background-image:linear-gradient\(#FFF3B0, #FFF3B0\)/i);
    assert.match(html, /<section class="sermon-section"[^>]*data-columns="2"/);
    assert.match(html, /<blockquote class="sermon-quote"/);
  });
});
