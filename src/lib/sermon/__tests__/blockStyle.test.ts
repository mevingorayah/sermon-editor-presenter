/**
 * Block builder fields: backward compatibility + validation limits.
 * Fixtures use SYNTHETIC text only (repo is public; no real sermon text).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  createSermonSchema,
  updateContentSchema,
  updateSermonSchema,
} from "../schema";
import {
  blockSpacingSchema,
  blockStyleSchema,
  findBlockLayoutIssues,
  globalStylesSchema,
  normalizeBlockLayout,
  normalizeGlobalStyles,
  effectiveBlockSizePt,
  PRESENTATION_MIN_PT,
} from "../blockStyle";

type Node = Record<string, unknown>;
const text = (t: string, marks?: Node[]): Node =>
  marks ? { type: "text", text: t, marks } : { type: "text", text: t };

const OLD_SERMON_DOC = {
  type: "doc",
  content: [
    { type: "title", content: [text("Sample title")] },
    { type: "paragraph", attrs: { textAlign: "left" }, content: [text("Plain body.")] },
  ],
};

/** Shaped like a real 82-block sermon: headings, scripture, marks, colours, cues. */
function bigFixture(): Node {
  const blocks: Node[] = [{ type: "title", content: [text("Lorem Ipsum Dolor")] }];
  let refs = 0;
  let cues = 0;
  for (let i = 1; blocks.length < 82; i++) {
    if (i % 9 === 0) {
      blocks.push({ type: "heading", attrs: { level: (i % 2) + 1, textAlign: null }, content: [text(`Point ${i}`)] });
    } else if (i % 5 === 0 && refs < 15) {
      refs++;
      blocks.push({
        type: "scripture",
        attrs: { citation: `Book ${refs}:${i}` },
        content: [text(`Synthetic verse ${refs} — àéîõü «quoted».`)],
      });
    } else {
      const content: Node[] = [text(`Paragraph ${i} lorem ipsum `), text("union", [{ type: "bold" }]), text(" sit amet.")];
      if (i % 7 === 0 && cues < 5) {
        cues++;
        content.push(text(" [Pause.]", [{ type: "italic" }, { type: "textStyle", attrs: { color: "#808080", fontFamily: null } }]));
      }
      if (i % 11 === 0) content.push(text(" highlighted", [{ type: "highlight", attrs: { color: "#F5D98A" } }]));
      blocks.push({ type: "paragraph", attrs: { textAlign: i % 13 === 0 ? "justify" : null }, content });
    }
  }
  return { type: "doc", content: blocks };
}

function roundTrip(doc: unknown): string {
  const parsed = updateContentSchema.parse({ content: doc });
  return JSON.stringify(normalizeBlockLayout(parsed.content), null, 2);
}

describe("backward compatibility", () => {
  it("old sermon without builder fields round-trips byte-identically", () => {
    assert.equal(roundTrip(OLD_SERMON_DOC), JSON.stringify(OLD_SERMON_DOC, null, 2));
  });

  it("82-block marked/coloured fixture round-trips byte-identically", () => {
    const doc = bigFixture();
    assert.equal((doc.content as unknown[]).length, 82);
    assert.equal(roundTrip(doc), JSON.stringify(doc, null, 2));
    assert.equal(normalizeBlockLayout(doc), doc, "same reference when nothing to normalise");
  });

  it("store create + autosave keeps an old-shape sermon identical", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sermons-bs-"));
    process.env.SERMON_DATA_DIR = tmp;
    try {
      const store: typeof import("../store") = await import(`../store.ts?bs=${Date.now()}`);
      const doc = bigFixture();
      const s = await store.createSermon({ title: "T", content: doc });
      assert.equal(JSON.stringify(s.content), JSON.stringify(doc));
      assert.equal("globalStyles" in s, false);
      const saved = await store.updateContent(s.id, { content: doc });
      assert.equal(JSON.stringify(saved.content), JSON.stringify(doc));
      const raw = JSON.parse(await fs.readFile(path.join(tmp, `${s.id}.json`), "utf8"));
      assert.equal(JSON.stringify(raw.content), JSON.stringify(doc));
      assert.equal("globalStyles" in raw, false);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("block style validation", () => {
  it("accepts a full valid style and spacing", () => {
    const r = blockStyleSchema.parse({
      font: "lora", size: 12.5, weight: 700, italic: true, color: "#abc",
      highlight: "rgb(245, 217, 138)", background: "#ffffff", borderLeft: null, align: "justify",
    });
    assert.equal(r.color, "#AABBCC");
    assert.equal(r.highlight, "#F5D98A");
    assert.equal(r.background, "#FFFFFF");
    assert.equal(r.borderLeft, null);
    assert.deepEqual(blockSpacingSchema.parse({ mt: 0, mb: 64, pt: 8, pr: 8, pb: 8, pl: 8 }).mb, 64);
  });

  it("empty objects are valid (= use global)", () => {
    assert.deepEqual(blockStyleSchema.parse({}), {});
    assert.deepEqual(blockSpacingSchema.parse({}), {});
  });

  const bad: Array<[string, unknown, RegExp]> = [
    ["size below 8", { size: 7.9 }, /at least 8 pt/],
    ["size above 96", { size: 97 }, /at most 96 pt/],
    ["weight 500", { weight: 500 }, /400 or 700/],
    ["unknown font", { font: "comic-sans" }, /font must be one of/],
    ["named colour", { color: "red" }, /Colour must be/],
    ["css var", { background: "var(--accent)" }, /Colour must be/],
    ["bad align", { align: "middle" }, /align must be one of/],
    ["unknown key", { underline: true }, /Unrecognized key/],
  ];
  for (const [name, val, re] of bad) {
    it(`rejects style: ${name}`, () => {
      const r = blockStyleSchema.safeParse(val);
      assert.equal(r.success, false);
      assert.match(r.error!.issues.map((i) => i.message).join("; "), re);
    });
  }

  for (const [name, val, re] of [
    ["negative", { mt: -1 }, /at least 0 px/],
    ["over 64", { pb: 65 }, /at most 64 px/],
    ["fractional", { pl: 1.5 }, /whole number/],
    ["string", { pr: "8" }, /number of px/],
  ] as Array<[string, unknown, RegExp]>) {
    it(`rejects spacing: ${name}`, () => {
      const r = blockSpacingSchema.safeParse(val);
      assert.equal(r.success, false);
      assert.match(r.error!.issues[0].message, re);
    });
  }
});

describe("content walk + sections", () => {
  const section = (columns: unknown, cols: number): Node => ({
    type: "section",
    attrs: { columns },
    content: Array.from({ length: cols }, () => ({
      type: "column",
      content: [{ type: "paragraph", content: [text("x")] }],
    })),
  });

  it("accepts styled blocks and a valid section", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "quote", attrs: { style: { italic: true }, spacing: { mt: 16 } }, content: [text("q")] },
        { type: "illustration", attrs: { style: { borderLeft: "#5C4A1F" } }, content: [text("i")] },
        section(2, 2),
      ],
    };
    assert.deepEqual(findBlockLayoutIssues(doc), []);
    assert.equal(updateContentSchema.safeParse({ content: doc }).success, true);
  });

  it("rejects bad columns, mismatched column count, stray column, bad style in doc", () => {
    assert.match(findBlockLayoutIssues({ type: "doc", content: [section(4, 4)] })[0].message, /1, 2 or 3/);
    assert.match(findBlockLayoutIssues({ type: "doc", content: [section(3, 2)] })[0].message, /columns: 3 but 2/);
    assert.match(findBlockLayoutIssues({ type: "doc", content: [{ type: "column", content: [] }] })[0].message, /only allowed inside a section/);
    const r = updateContentSchema.safeParse({
      content: { type: "doc", content: [{ type: "paragraph", attrs: { spacing: { mt: 99 } } }] },
    });
    assert.equal(r.success, false);
    assert.match(r.error!.issues[0].message, /content\.content\[0\]\.attrs\.spacing\.mt: Spacing must be at most 64 px/);
  });

  it("normalizeBlockLayout uppercases/expands hex in block attrs", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", attrs: { style: { color: "#abc", background: "rgb(0,0,0)" } } }] };
    const n = normalizeBlockLayout(doc) as { content: Array<{ attrs: { style: Node } }> };
    assert.deepEqual(n.content[0].attrs.style, { color: "#AABBCC", background: "#000000" });
    assert.equal((doc.content[0].attrs.style as Node).color, "#abc", "input not mutated");
  });
});

describe("globalStyles", () => {
  it("accepts per-type entries and normalises colours", () => {
    const gs = globalStylesSchema.parse({ scripture: { style: { italic: true, color: "#5c4a1f" }, spacing: { mb: 12 } } });
    assert.equal(gs.scripture?.style?.color, "#5C4A1F");
    const raw = { heading: { style: { color: "#fff" } } };
    assert.equal(normalizeGlobalStyles(raw).heading.style.color, "#FFFFFF");
  });

  it("rejects unknown block types", () => {
    assert.equal(globalStylesSchema.safeParse({ banner: {} }).success, false);
  });

  it("create/update schemas accept and omit globalStyles", () => {
    assert.equal(createSermonSchema.safeParse({ title: "x" }).success, true);
    assert.equal(createSermonSchema.safeParse({ globalStyles: { paragraph: { spacing: { mb: 8 } } } }).success, true);
    assert.equal(updateSermonSchema.safeParse({ globalStyles: null }).success, true);
    assert.equal(updateSermonSchema.safeParse({ globalStyles: { paragraph: { style: { size: 200 } } } }).success, false);
  });
});

describe("store globalStyles", () => {
  let tmp: string;
  let store: typeof import("../store");
  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sermons-gs-"));
    process.env.SERMON_DATA_DIR = tmp;
    store = await import(`../store.ts?gs=${Date.now()}`);
  });
  after(async () => fs.rm(tmp, { recursive: true, force: true }));

  it("sets, normalises and clears globalStyles", async () => {
    const s = await store.createSermon({ title: "G" });
    const u = await store.updateSermon(s.id, { globalStyles: { title: { style: { color: "#abc" } } } });
    assert.equal(u.globalStyles?.title?.style?.color, "#AABBCC");
    const c = await store.updateSermon(s.id, { globalStyles: null });
    assert.equal("globalStyles" in c, false);
  });
});

describe("effectiveBlockSizePt (Preach/export clamp)", () => {
  it("stores 8 pt but resolves to 24 pt in Preach/export", () => {
    assert.equal(blockStyleSchema.parse({ size: 8 }).size, 8);
    assert.equal(PRESENTATION_MIN_PT, 24);
    assert.equal(effectiveBlockSizePt({ size: 8 }), 24);
    assert.equal(effectiveBlockSizePt({}, { style: { size: 10 } }), 24);
  });
  it("keeps larger sizes and prefers block over global", () => {
    assert.equal(effectiveBlockSizePt({ size: 40 }, { style: { size: 30 } }), 40);
    assert.equal(effectiveBlockSizePt(undefined, { style: { size: 30 } }), 30);
    assert.equal(effectiveBlockSizePt(undefined, undefined, 24, 28), 28);
    assert.equal(effectiveBlockSizePt({ size: 8 }, null, 10), 10);
  });
});

describe("legacy font ids", () => {
  it("normalises sans/serif/mono in style and globalStyles", () => {
    assert.equal(blockStyleSchema.parse({ font: "serif" }).font, "literata");
    assert.equal(blockStyleSchema.parse({ font: "sans" }).font, "inter");
    assert.equal(blockStyleSchema.parse({ font: "mono" }).font, "jetbrains-mono");
    const gs = globalStylesSchema.parse({ paragraph: { style: { font: "serif" } } });
    assert.equal(gs.paragraph?.style?.font, "literata");
    assert.equal(normalizeGlobalStyles({ title: { style: { font: "sans" } } }).title.style.font, "inter");
  });

  it("sermon with sans/serif/mono everywhere saves on first builder edit, words and marks untouched", async () => {
    const legacy = () => ({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { fontFamily: "serif" }, content: [
          text("Alpha ", [{ type: "textStyle", attrs: { fontFamily: "sans", color: null } }]),
          text("beta", [{ type: "textStyle", attrs: { fontFamily: "mono" } }]),
        ] },
        { type: "scripture", attrs: { citation: "Book 1:1", style: { font: "serif" } }, content: [text("Gamma verse")] },
        { type: "heading", attrs: { level: 1, style: { font: "mono", size: 8 } }, content: [text("Delta")] },
      ],
    });
    const doc = legacy();
    const parsed = updateContentSchema.safeParse({ content: doc });
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
    const gsParsed = updateSermonSchema.safeParse({ globalStyles: { paragraph: { style: { font: "sans" } } } });
    assert.equal(gsParsed.success, true);

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sermons-legacy-"));
    process.env.SERMON_DATA_DIR = tmp;
    try {
      const store: typeof import("../store") = await import(`../store.ts?lg=${Date.now()}`);
      const s = await store.createSermon({ title: "L", content: legacy() });
      const saved = await store.updateContent(s.id, { content: legacy() });
      const c = saved.content as { content: Array<{ attrs: Node; content: Array<Node> }> };
      // Words unchanged
      const words = (d: typeof c) => d.content.map((b) => b.content.map((t) => t.text).join("")).join("|");
      assert.equal(words(c), words(legacy() as typeof c));
      // fontFamily outside `style` untouched
      assert.equal(c.content[0].attrs.fontFamily, "serif");
      assert.deepEqual(c.content[0].content, legacy().content[0].content);
      // style.font normalised
      assert.equal((c.content[1].attrs.style as Node).font, "literata");
      assert.equal((c.content[2].attrs.style as Node).font, "jetbrains-mono");
      assert.equal((c.content[2].attrs.style as Node).size, 8);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
