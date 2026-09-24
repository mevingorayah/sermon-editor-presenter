import { test } from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/react";
import { buildCalibratedSnapshot } from "../../calibration";
import { exportRequestSchema, findCssVarColorMarks } from "../../sermon/schema";
import { parseExportRequest } from "../../sermon/export/parseRequest";
import {
  buildExportPayload,
  defaultFilenameStem,
  fallbackFilename,
  filenameFromContentDisposition,
} from "../payload";

const content: JSONContent = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "Joy Without Ceasing" }] },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Rejoice",
          marks: [{ type: "textStyle", attrs: { color: "var(--edit-accent)" } }],
        },
      ],
    },
  ],
};

function snap(target: "screen-16-9" | "paper-letter" = "screen-16-9") {
  return buildCalibratedSnapshot({
    target,
    typeScaleStep: 0,
    lineHeight: 1.7,
    theme: "dark",
    content,
  });
}

test("filename stem defaults from title, sanitized; empty → sermon-export", () => {
  assert.equal(defaultFilenameStem("Joy Without Ceasing"), "Joy-Without-Ceasing");
  assert.equal(defaultFilenameStem("  "), "sermon-export");
  assert.equal(defaultFilenameStem(undefined), "sermon-export");
  assert.equal(fallbackFilename("My talk!", "png"), "My-talk.png");
  assert.equal(fallbackFilename("", "pptx"), "sermon-export.pptx");
});

test("payload: flattened colors, accent hex, stem, notes off by default", () => {
  const payload = buildExportPayload({
    snapshot: snap(),
    format: "png",
    filenameStem: "Joy-Without-Ceasing",
    includeNotes: false,
    notes: "private notes",
  });
  assert.equal(payload.format, "png");
  assert.equal(payload.filenameStem, "Joy-Without-Ceasing");
  assert.equal(payload.includeNotes, false);
  assert.equal("notes" in payload, false);
  assert.deepEqual(payload.resolvedColors, { accent: "#5c4a1f" });
  assert.equal(payload.bionic, false);
  assert.equal(payload.flattenGradient, true);
  assert.equal(payload.theme, "dark", "screen PNG follows the calibrated theme");
  assert.deepEqual(findCssVarColorMarks(payload.content), []);
  // Live snapshot content is untouched.
  assert.equal(findCssVarColorMarks(snap().content).length, 1);
});

test("payload: notes only for DOCX/PDF when opted in; print formats light", () => {
  const docx = buildExportPayload({
    snapshot: snap(),
    format: "docx",
    filenameStem: "x",
    includeNotes: true,
    notes: "Study notes",
  });
  assert.equal(docx.includeNotes, true);
  assert.equal(docx.notes, "Study notes");
  assert.equal(docx.theme, "light");

  const pptx = buildExportPayload({
    snapshot: snap(),
    format: "pptx",
    filenameStem: "x",
    includeNotes: true,
    notes: "Study notes",
  });
  assert.equal(pptx.includeNotes, false);
  assert.equal("notes" in pptx, false);

  const paperPng = buildExportPayload({
    snapshot: buildCalibratedSnapshot({
      target: "paper-letter",
      typeScaleStep: 0,
      lineHeight: 1.7,
      theme: "light",
      content,
    }),
    format: "png",
    filenameStem: "x",
    includeNotes: false,
    notes: "",
  });
  assert.equal(paperPng.theme, "light");
});

test("payload passes Backend schema (strict) for every format", () => {
  for (const format of ["docx", "pdf", "png", "pptx"] as const) {
    const body = buildExportPayload({
      snapshot: snap("paper-letter"),
      format,
      filenameStem: "",
      includeNotes: true,
      notes: "n",
    });
    const roundTrip = JSON.parse(JSON.stringify(body));
    assert.doesNotThrow(() => exportRequestSchema.parse(roundTrip), format);
    const parsed = parseExportRequest(roundTrip);
    assert.equal(parsed.format, format);
    assert.equal(parsed.filenameStem, "");
  }
});

test("un-flattened var content is what Backend would 400 on", () => {
  const raw = { ...snap(), format: "docx" };
  assert.throws(() => exportRequestSchema.parse(JSON.parse(JSON.stringify(raw))));
});

test("Content-Disposition parsing", () => {
  assert.equal(
    filenameFromContentDisposition('attachment; filename="Joy.docx"'),
    "Joy.docx",
  );
  assert.equal(
    filenameFromContentDisposition("attachment; filename*=UTF-8''Joy%20Now.pdf; filename=\"x.pdf\""),
    "Joy Now.pdf",
  );
  assert.equal(filenameFromContentDisposition(null), null);
  assert.equal(filenameFromContentDisposition("attachment"), null);
});
