import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportSnapshot } from "../export";
import type { CalibratedSnapshot } from "@/types/document";

const snapshot: CalibratedSnapshot = {
  target: "paper-letter",
  margins: {
    top: "0.75in",
    right: "0.75in",
    bottom: "0.75in",
    left: "0.75in",
    binderGutter: "0.25in",
  },
  typeScaleStep: 0,
  lineHeight: 1.7,
  theme: "light",
  flattenGradient: true,
  bionic: false,
  semanticBlocks: [
    { type: "Title", text: "Joy Without Ceasing" },
    { type: "H1", text: "Introduction" },
    { type: "Body", text: "Rejoice in the Lord always." },
    {
      type: "Scripture",
      text: "Rejoice in the Lord always; again I will say, rejoice.",
      citation: "Philippians 4:4",
    },
  ],
  content: { type: "doc", content: [] },
};

describe("exportSnapshot", () => {
  it("generates a real DOCX buffer", async () => {
    const result = await exportSnapshot(snapshot, "docx");
    assert.equal(
      result.contentType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.match(result.filename, /\.docx$/);
    assert.equal(result.buffer[0], 0x50);
    assert.equal(result.buffer[1], 0x4b);
    assert.ok(result.buffer.length > 1000);
  });

  it("generates a real PDF buffer", async () => {
    const result = await exportSnapshot(snapshot, "pdf");
    assert.equal(result.contentType, "application/pdf");
    assert.match(result.filename, /\.pdf$/);
    assert.equal(result.buffer.subarray(0, 4).toString("utf8"), "%PDF");
    assert.ok(result.buffer.length > 500);
  });
});
