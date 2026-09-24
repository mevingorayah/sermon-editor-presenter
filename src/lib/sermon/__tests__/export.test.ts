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
    { type: "H1", text: "Point One" },
    { type: "Body", text: "Joy is a command and a gift." },
  ],
  content: {
    type: "doc",
    content: [
      {
        type: "title",
        content: [
          {
            type: "text",
            text: "Joy Without Ceasing",
            marks: [
              {
                type: "textStyle",
                attrs: { color: "#8B6914", fontFamily: "ui-serif, Georgia, serif" },
              },
            ],
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 1, textAlign: "left" },
        content: [{ type: "text", text: "Introduction", marks: [{ type: "bold" }] }],
      },
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            text: "Rejoice ",
            marks: [{ type: "italic" }],
          },
          {
            type: "text",
            text: "always",
            marks: [{ type: "highlight" }],
          },
          { type: "text", text: "." },
        ],
      },
      {
        type: "scripture",
        attrs: { citation: "Philippians 4:4" },
        content: [
          {
            type: "text",
            text: "Rejoice in the Lord always; again I will say, rejoice.",
          },
        ],
      },
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Point One" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Joy is a command and a gift.",
            marks: [
              {
                type: "textStyle",
                attrs: {
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

describe("exportSnapshot", () => {
  it("generates a real DOCX buffer", async () => {
    const result = await exportSnapshot(snapshot, "docx", {
      filenameStem: "Joy-Without-Ceasing",
      resolvedColors: { accent: "#8B6914" },
    });
    assert.equal(
      result.contentType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.equal(result.filename, "Joy-Without-Ceasing.docx");
    assert.equal(result.buffer[0], 0x50);
    assert.equal(result.buffer[1], 0x4b);
    assert.ok(result.buffer.length > 1000);
  });

  it("generates DOCX with study notes when includeNotes", async () => {
    const withNotes = await exportSnapshot(snapshot, "docx", {
      includeNotes: true,
      notes: "Remember to pause after the scripture reading.",
      filenameStem: "",
    });
    assert.equal(withNotes.filename, "sermon-export.docx");
    assert.ok(withNotes.buffer.length > 1000);

    const without = await exportSnapshot(snapshot, "docx", {
      includeNotes: false,
      notes: "Remember to pause after the scripture reading.",
    });
    // Notes section should add bytes (best-effort size check)
    assert.ok(withNotes.buffer.length >= without.buffer.length);
  });

  it("generates a real PDF buffer", async () => {
    const result = await exportSnapshot(snapshot, "pdf", {
      filenameStem: "Joy-Without-Ceasing",
      includeNotes: true,
      notes: "Margin note for handout.",
      resolvedColors: { accent: "rgb(139, 105, 20)" },
    });
    assert.equal(result.contentType, "application/pdf");
    assert.equal(result.filename, "Joy-Without-Ceasing.pdf");
    assert.equal(result.buffer.subarray(0, 4).toString("utf8"), "%PDF");
    assert.ok(result.buffer.length > 500);
  });

  it("generates a real PNG buffer", async () => {
    const result = await exportSnapshot(snapshot, "png", {
      filenameStem: "Joy-Screen",
      includeNotes: true, // ignored for png
      notes: "should not appear",
      resolvedColors: { accent: "#8B6914" },
    });
    assert.equal(result.contentType, "image/png");
    assert.equal(result.filename, "Joy-Screen.png");
    // PNG signature
    assert.equal(result.buffer[0], 0x89);
    assert.equal(result.buffer[1], 0x50);
    assert.equal(result.buffer[2], 0x4e);
    assert.equal(result.buffer[3], 0x47);
    assert.ok(result.buffer.length > 1000);
  });

  it("generates a real PPTX buffer", async () => {
    const result = await exportSnapshot(snapshot, "pptx", {
      filenameStem: "Joy-Slides",
      resolvedColors: { accent: "#8B6914" },
    });
    assert.equal(
      result.contentType,
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    assert.equal(result.filename, "Joy-Slides.pptx");
    assert.equal(result.buffer[0], 0x50);
    assert.equal(result.buffer[1], 0x4b);
    assert.ok(result.buffer.length > 1000);
  });

  it("PPTX honours block alignment on body text", async () => {
    const JSZip = (await import("jszip")).default;
    const result = await exportSnapshot(snapshot, "pptx", {
      resolvedColors: { accent: "#5c4a1f" },
    });
    const zip = await JSZip.loadAsync(result.buffer);
    const slide = await zip.file("ppt/slides/slide2.xml")?.async("string");
    assert.ok(slide, "Introduction slide exists");
    // Centered paragraph under "Introduction" must carry algn="ctr".
    assert.match(slide!, /algn="ctr"/);
  });
});

