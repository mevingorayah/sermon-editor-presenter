import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calibratedSnapshotSchema,
  createSermonSchema,
  exportRequestSchema,
  findCssVarColorMarks,
  findInvalidColorMarks,
  isContractColor,
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
    assert.equal(sanitizeFilenameStem("...---___"), "sermon-export");
    assert.equal(sanitizeFilenameStem(".pdf"), "sermon-export");
  });

  it("transliterates Kreol / French accents instead of dropping letters", () => {
    assert.equal(sanitizeFilenameStem("Ésaïe 40"), "Esaie-40");
    assert.equal(sanitizeFilenameStem("Leçon façile"), "Lecon-facile");
    assert.equal(sanitizeFilenameStem("Cœur brisé"), "Coeur-brise");
    assert.equal(sanitizeFilenameStem("Bondie ek nou lavi"), "Bondie-ek-nou-lavi");
  });

  it("removes apostrophes and quotes without adding a dash", () => {
    assert.equal(sanitizeFilenameStem("l'Évangile"), "lEvangile");
    assert.equal(sanitizeFilenameStem("L’amour de Dieu"), "Lamour-de-Dieu");
    assert.equal(sanitizeFilenameStem("«Le Berger»"), "Le-Berger");
  });

  it("turns other runs into one dash and trims - . _ at the ends", () => {
    assert.equal(sanitizeFilenameStem("Philippians 4:4–7"), "Philippians-4-4-7");
    assert.equal(sanitizeFilenameStem("Joy - Part 2"), "Joy-Part-2");
    assert.equal(sanitizeFilenameStem("_.draft.-"), "draft");
  });

  it("drops one trailing export extension, any case", () => {
    assert.equal(sanitizeFilenameStem("notes.pdf"), "notes");
    assert.equal(sanitizeFilenameStem("Sermon.DOCX"), "Sermon");
    assert.equal(sanitizeFilenameStem("slides.pptx.pptx"), "slides-pptx");
    assert.equal(sanitizeFilenameStem("v1.2"), "v1.2");
  });

  it("caps at 80 chars, cutting at the last dash", () => {
    const long = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const out = sanitizeFilenameStem(long);
    assert.ok(out.length <= 80);
    assert.match(out, /^word0-word1-.*word\d+$/);
    assert.equal(out.endsWith("-"), false);
    assert.equal(sanitizeFilenameStem("a".repeat(120)), "a".repeat(80));
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

describe("contract colors (strict)", () => {
  const withColor = (color: string) => ({
    ...validSnapshot,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "textStyle", attrs: { color } }],
            },
          ],
        },
      ],
    },
  });

  for (const ok of ["#5c4a1f", "#5C4A1F", "rgb(92, 74, 31)", "rgb(0,0,0)"]) {
    it(`accepts ${ok} in content marks and accent`, () => {
      assert.equal(calibratedSnapshotSchema.safeParse(withColor(ok)).success, true);
      assert.equal(isContractColor(ok), true);
    });
  }

  for (const bad of ["red", "#abc", "hsl(40, 50%, 24%)", "rgba(0,0,0,0.5)", "rgb(300, 0, 0)", "var(--edit-accent)"]) {
    it(`rejects ${bad} in content marks and accent`, () => {
      const r = calibratedSnapshotSchema.safeParse(withColor(bad));
      assert.equal(r.success, false);
      if (!r.success) {
        assert.match(r.error.issues[0].message, /content\.content\[0\]\.content\[0\]\.marks\[0\]\.color/);
      }
      const wrapped = exportRequestSchema.safeParse({
        format: "pptx",
        snapshot: validSnapshot,
        resolvedColors: { accent: bad },
      });
      assert.equal(wrapped.success, false);
    });
  }

  it("findInvalidColorMarks ignores empty color attrs", () => {
    assert.deepEqual(findInvalidColorMarks(withColor("").content), []);
  });
});

describe("createSermonSchema id", () => {
  it("accepts an optional UUID id", () => {
    const r = createSermonSchema.safeParse({ id: "3f1c2a4e-9b7d-4e2f-8a1b-2c3d4e5f6a7b" });
    assert.equal(r.success, true);
  });

  it("rejects non-UUID ids like seed ids", () => {
    const r = createSermonSchema.safeParse({ id: "seed-philippians-4:0" });
    assert.equal(r.success, false);
    if (!r.success) assert.deepEqual(r.error.issues[0].path, ["id"]);
  });
});
