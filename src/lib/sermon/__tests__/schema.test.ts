import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calibratedSnapshotSchema,
  createSermonSchema,
  exportRequestSchema,
  findCssVarColorMarks,
  updateContentSchema,
} from "../schema";
import { parseExportRequest } from "../export/parseRequest";
import { sanitizeFilenameStem } from "../export/filename";

const validSnapshot = {
  target: "paper-letter",
  margins: {
    top: "0.75in",
    right: "0.75in",
    bottom: "0.75in",
    left: "0.75in",
    binderGutter: "0.25in",
  },
  typeScaleStep: 0,
  lineHeight: 1.7 as const,
  theme: "light" as const,
  flattenGradient: true as const,
  bionic: false as const,
  semanticBlocks: [
    { type: "Title" as const, text: "Joy" },
    { type: "Body" as const, text: "Hello" },
  ],
  content: { type: "doc", content: [] },
};

describe("calibratedSnapshotSchema", () => {
  it("accepts Frontend CalibratedSnapshot", () => {
    const r = calibratedSnapshotSchema.safeParse(validSnapshot);
    assert.equal(r.success, true);
  });

  it("rejects bionic true", () => {
    const r = calibratedSnapshotSchema.safeParse({
      ...validSnapshot,
      bionic: true,
    });
    assert.equal(r.success, false);
  });

  it("rejects missing flattenGradient true", () => {
    const rest = { ...validSnapshot };
    delete (rest as { flattenGradient?: unknown }).flattenGradient;
    const r = calibratedSnapshotSchema.safeParse(rest);
    assert.equal(r.success, false);
  });

  it("rejects CSS var(--…) in content color marks", () => {
    const r = calibratedSnapshotSchema.safeParse({
      ...validSnapshot,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Accented",
                marks: [
                  {
                    type: "textStyle",
                    attrs: { color: "var(--edit-accent)" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assert.equal(r.success, false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(" ");
      assert.match(msg, /var\(--/i);
    }
  });

  it("accepts concrete hex color marks", () => {
    const r = calibratedSnapshotSchema.safeParse({
      ...validSnapshot,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Accented",
                marks: [
                  { type: "textStyle", attrs: { color: "#8B6914" } },
                ],
              },
            ],
          },
        ],
      },
    });
    assert.equal(r.success, true);
  });
});

describe("findCssVarColorMarks", () => {
  it("locates var(-- in nested marks", () => {
    const hits = findCssVarColorMarks({
      type: "doc",
      content: [
        {
          type: "text",
          marks: [{ type: "textStyle", attrs: { color: "var(--x)" } }],
        },
      ],
    });
    assert.ok(hits.length >= 1);
  });
});

describe("parseExportRequest", () => {
  it("accepts raw snapshot and defaults to docx", () => {
    const r = parseExportRequest(validSnapshot);
    assert.equal(r.format, "docx");
    assert.equal(r.snapshot.target, "paper-letter");
    assert.equal(r.includeNotes, false);
  });

  it("honors ?format=pdf", () => {
    const r = parseExportRequest(
      validSnapshot,
      new URLSearchParams("format=pdf"),
    );
    assert.equal(r.format, "pdf");
  });

  it("query format wins over body format", () => {
    const r = parseExportRequest(
      { ...validSnapshot, format: "docx" },
      new URLSearchParams("format=png"),
    );
    assert.equal(r.format, "png");
  });

  it("accepts wrapper form", () => {
    const r = parseExportRequest({
      format: "pdf",
      snapshot: validSnapshot,
    });
    assert.equal(r.format, "pdf");
  });

  it("accepts new formats png and pptx", () => {
    assert.equal(
      parseExportRequest({ ...validSnapshot, format: "png" }).format,
      "png",
    );
    assert.equal(
      parseExportRequest({ ...validSnapshot, format: "pptx" }).format,
      "pptx",
    );
  });

  it("defaults includeNotes to false", () => {
    const r = parseExportRequest({ ...validSnapshot, format: "docx" });
    assert.equal(r.includeNotes, false);
  });

  it("honors includeNotes true and notes", () => {
    const r = parseExportRequest({
      ...validSnapshot,
      includeNotes: true,
      notes: "Study me",
      filenameStem: "Joy-Without-Ceasing",
      resolvedColors: { accent: "#8B6914" },
    });
    assert.equal(r.includeNotes, true);
    assert.equal(r.notes, "Study me");
    assert.equal(r.filenameStem, "Joy-Without-Ceasing");
    assert.equal(r.resolvedColors?.accent, "#8B6914");
  });

  it("rejects invalid query format", () => {
    assert.throws(
      () =>
        parseExportRequest(
          validSnapshot,
          new URLSearchParams("format=xlsx"),
        ),
      /Invalid format/,
    );
  });
});

describe("exportRequestSchema", () => {
  it("accepts snapshot with inline format", () => {
    const r = exportRequestSchema.safeParse({
      ...validSnapshot,
      format: "docx",
    });
    assert.equal(r.success, true);
  });

  it("accepts png/pptx formats", () => {
    assert.equal(
      exportRequestSchema.safeParse({ ...validSnapshot, format: "png" })
        .success,
      true,
    );
    assert.equal(
      exportRequestSchema.safeParse({ ...validSnapshot, format: "pptx" })
        .success,
      true,
    );
  });

  it("rejects unknown format", () => {
    const r = exportRequestSchema.safeParse({
      ...validSnapshot,
      format: "xlsx",
    });
    assert.equal(r.success, false);
  });
});

describe("sanitizeFilenameStem", () => {
  it("sanitizes title-like stems", () => {
    assert.equal(
      sanitizeFilenameStem("Joy Without Ceasing"),
      "Joy-Without-Ceasing",
    );
  });

  it("empty → sermon-export", () => {
    assert.equal(sanitizeFilenameStem(""), "sermon-export");
    assert.equal(sanitizeFilenameStem("   "), "sermon-export");
    assert.equal(sanitizeFilenameStem(undefined), "sermon-export");
  });
});

describe("createSermonSchema / updateContentSchema", () => {
  it("allows empty create", () => {
    assert.equal(createSermonSchema.safeParse({}).success, true);
  });

  it("requires content or document for autosave", () => {
    assert.equal(updateContentSchema.safeParse({}).success, false);
    assert.equal(
      updateContentSchema.safeParse({
        content: { type: "doc", content: [] },
      }).success,
      true,
    );
  });
});
