import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calibratedSnapshotSchema,
  createSermonSchema,
  exportRequestSchema,
  updateContentSchema,
} from "../schema";
import { parseExportRequest } from "../export/parseRequest";

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
    const rest = { ...validSnapshot }; delete (rest as { flattenGradient?: unknown }).flattenGradient;
    const r = calibratedSnapshotSchema.safeParse(rest);
    assert.equal(r.success, false);
  });
});

describe("parseExportRequest", () => {
  it("accepts raw snapshot and defaults to docx", () => {
    const r = parseExportRequest(validSnapshot);
    assert.equal(r.format, "docx");
    assert.equal(r.snapshot.target, "paper-letter");
  });

  it("honors ?format=pdf", () => {
    const r = parseExportRequest(
      validSnapshot,
      new URLSearchParams("format=pdf"),
    );
    assert.equal(r.format, "pdf");
  });

  it("accepts wrapper form", () => {
    const r = parseExportRequest({
      format: "pdf",
      snapshot: validSnapshot,
    });
    assert.equal(r.format, "pdf");
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
