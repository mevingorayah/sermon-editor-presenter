/** @jsxRuntime automatic */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { getSchema, type JSONContent } from "@tiptap/react";
import { Node as PMNode } from "@tiptap/pm/model";
import { createSchemaExtensions } from "@/extensions/schema";
import { renderSermon } from "../renderSermon";
import { contrastRatio, parseColor, DARK_STAGE_BG } from "../contrast";
import {
  FONTS,
  HIGHLIGHT_PRESETS,
  TEXT_PRESETS,
  fontFamilyCss,
  fontIdOf,
  fontSizeCss,
  fontSizePt,
  normalizeHex,
} from "@/lib/marks/presets";

/** A1 writing tools (spec v2 §4.2, §4.4, §4.16a; MK1–MK4, PG2, W1, W6, F3). */

type Mark = { type: string; attrs?: Record<string, unknown> };
const para = (...runs: [string, Mark[]][]): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph", content: runs.map(([text, marks]) => ({ type: "text", text, marks })) }],
});
const html = (doc: JSONContent, bionic = false, theme: "light" | "dark" = "light") =>
  renderToStaticMarkup(<>{renderSermon(doc, { bionic, theme })}</>);
const schema = getSchema(createSchemaExtensions());

const MARK_TAGS: [string, string][] = [
  ["bold", "strong"],
  ["italic", "em"],
  ["underline", "u"],
  ["strike", "s"],
  ["superscript", "sup"],
  ["subscript", "sub"],
];

for (const [mark, tag] of MARK_TAGS) {
  test(`schema has the ${mark} mark and Preach renders it as <${tag}>`, () => {
    assert.ok(schema.marks[mark], mark);
    for (const theme of ["light", "dark"] as const) {
      for (const bionic of [false, true]) {
        const out = html(para(["Grace abounds", [{ type: mark }]]), bionic, theme);
        assert.match(out, new RegExp(`<${tag}>`), `${mark} ${theme} bionic=${bionic}`);
        assert.equal(out.replace(/<[^>]+>/g, ""), "Grace abounds");
      }
    }
  });
}

test("MK2: superscript and subscript exclude each other in the schema", () => {
  const sup = schema.marks.superscript, sub = schema.marks.subscript;
  assert.ok(sup.excludes(sub));
  assert.ok(sub.excludes(sup));
  const set = sup.create().addToSet(sub.create().addToSet([]));
  assert.deepEqual(set.map((m) => m.type.name), ["superscript"]);
});

test("every A1 mark and attribute survives the schema round-trip (file stores it)", () => {
  const doc = para(
    ["a", [{ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "strike" }]],
    ["b", [{ type: "superscript" }]],
    ["c", [{ type: "subscript" }]],
    ["d", [{ type: "textStyle", attrs: { color: "#A8201A", preset: "crimson", fontFamily: "lora", fontSize: "24pt" } }]],
    ["e", [{ type: "highlight", attrs: { color: "#FFF176", preset: "yellow" } }]],
  );
  const json = PMNode.fromJSON(schema, doc).toJSON();
  const runs = json.content[0].content as { marks: Mark[] }[];
  assert.deepEqual(runs[0].marks.map((m) => m.type).sort(), ["bold", "italic", "strike", "underline"]);
  assert.equal(runs[1].marks[0].type, "superscript");
  assert.equal(runs[2].marks[0].type, "subscript");
  assert.deepEqual(
    { ...runs[3].marks[0].attrs },
    { color: "#A8201A", preset: "crimson", fontFamily: "lora", fontSize: "24pt" },
  );
  assert.deepEqual({ ...runs[4].marks[0].attrs }, { color: "#FFF176", preset: "yellow" });
});

test("justify is an allowed alignment and renders in Preach", () => {
  assert.ok(schema.nodes.paragraph.spec.attrs?.textAlign);
  const out = html({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: "justify" }, content: [{ type: "text", text: "x" }] }] });
  assert.match(out, /text-align:justify/);
});

test("PG2: 10 fonts (5 serif + 5 sans) plus JetBrains Mono", () => {
  assert.equal(FONTS.filter((f) => f.group === "serif").length, 5);
  assert.equal(FONTS.filter((f) => f.group === "sans").length, 5);
  assert.deepEqual(FONTS.filter((f) => f.group === "mono").map((f) => f.id), ["jetbrains-mono"]);
  for (const f of FONTS) assert.match(fontFamilyCss(f.id)!, new RegExp(`^var\\(${f.cssVar}\\), "${f.label}"`));
});

test("F3: legacy font stacks migrate to FontIds", () => {
  assert.equal(fontIdOf("serif"), "source-serif-4");
  assert.equal(fontIdOf("sans"), "inter");
  assert.equal(fontIdOf("mono"), "jetbrains-mono");
  assert.equal(fontIdOf('system-ui, -apple-system, "Segoe UI", sans-serif'), "inter");
  assert.equal(fontIdOf("ui-serif, Georgia, serif"), "source-serif-4");
  assert.equal(fontIdOf("ui-monospace, monospace"), "jetbrains-mono");
  assert.equal(fontIdOf("Lora"), "lora");
  assert.equal(fontFamilyCss("Courier New"), "Courier New");
});

test("Preach renders the same font stack as Edit for a FontId", () => {
  const out = html(para(["x", [{ type: "textStyle", attrs: { fontFamily: "jetbrains-mono" } }]]));
  assert.ok(out.includes(`font-family:${fontFamilyCss("jetbrains-mono")!.replace(/"/g, "&quot;")}`), out);
});

test("font size is stored in pt and rendered relative to --doc-pt (proportional)", () => {
  assert.equal(fontSizePt("24pt"), 24);
  assert.equal(fontSizePt("7pt"), null);
  assert.equal(fontSizePt("97"), null);
  assert.equal(fontSizeCss("24pt"), "calc(var(--doc-pt, 1.3333px) * 24)");
  const out = html(para(["x", [{ type: "textStyle", attrs: { fontSize: "24pt" } }]]), true, "dark");
  assert.match(out, /font-size:calc\(var\(--doc-pt, 1.3333px\) \* 24\)/);
});

test("W1: hex is normalised to #RRGGBB uppercase; invalid is rejected", () => {
  assert.equal(normalizeHex("#a8201a"), "#A8201A");
  assert.equal(normalizeHex("abc"), "#AABBCC");
  assert.equal(normalizeHex("#abcd"), null);
  assert.equal(normalizeHex("zzz"), null);
});

test("W6: 6 text presets meet 4.5:1 in their own theme", () => {
  assert.equal(TEXT_PRESETS.length, 6);
  const cream = parseColor("#f4f1ea")!, dark = parseColor(DARK_STAGE_BG)!;
  for (const p of TEXT_PRESETS) {
    assert.ok(contrastRatio(parseColor(p.light)!, cream) >= 4.5, `${p.id} light`);
    assert.ok(contrastRatio(parseColor(p.dark)!, dark) >= 4.5, `${p.id} dark`);
  }
});

test("6 highlight presets keep body text ≥4.5:1 in both themes", () => {
  assert.equal(HIGHLIGHT_PRESETS.length, 6);
  const ink = parseColor("#1a1814")!, inkDark = parseColor("#f2eee6")!;
  for (const p of HIGHLIGHT_PRESETS) {
    assert.ok(contrastRatio(parseColor(p.light)!, ink) >= 4.5, `${p.id} light`);
    assert.ok(contrastRatio(parseColor(p.dark)!, inkDark) >= 4.5, `${p.id} dark`);
  }
});

test("text colour presets: light hex in light Preach, tabled dark variant in dark", () => {
  for (const p of TEXT_PRESETS) {
    const doc = para(["x", [{ type: "textStyle", attrs: { color: p.light, preset: p.id } }]]);
    assert.match(html(doc, false, "light"), new RegExp(`color:${p.light}`));
    assert.match(html(doc, false, "dark"), new RegExp(`color:${p.dark}`));
  }
  // A preset hex without a preset id still maps to its dark variant.
  assert.match(html(para(["x", [{ type: "textStyle", attrs: { color: "#a8201a" } }]]), false, "dark"), /color:#FF8A80/);
});

test("custom colour under 4.5:1 is lightened in dark Preach, hue kept", () => {
  const out = html(para(["x", [{ type: "textStyle", attrs: { color: "#1D1D6B" } }]]), false, "dark");
  const c = out.match(/color:(#[0-9a-f]{6})/i)![1];
  assert.ok(contrastRatio(parseColor(c)!, parseColor(DARK_STAGE_BG)!) >= 4.5);
  const [r, g, b] = parseColor(c)!;
  assert.ok(b > r && b > g);
});

test("highlight presets: light value in light Preach, dark variant in dark", () => {
  for (const p of HIGHLIGHT_PRESETS) {
    const doc = para(["x", [{ type: "highlight", attrs: { color: p.light, preset: p.id } }]]);
    assert.match(html(doc, false, "light"), new RegExp(`background-color:${p.light}`));
    assert.match(html(doc, false, "dark"), new RegExp(`background-color:${p.dark}`));
  }
});

test("A3: bionic adds nothing inside user bold, and no nested <strong>", () => {
  const out = html(para(["Glorious mercy ", [{ type: "bold" }]], ["endures", []]), true);
  assert.match(out, /^<p><strong>Glorious mercy <\/strong>/);
  assert.doesNotMatch(out, /<strong>(?:(?!<\/strong>).)*<strong/);
  assert.match(out, /<strong data-bionic="">endu<\/strong>/);
});

test("MK4: short sup/sub runs are not split by bionic; longer ones are", () => {
  for (const type of ["superscript", "subscript"]) {
    for (const t of ["16", "1er", "abc"]) {
      const out = html(para([t, [{ type }]]), true);
      assert.doesNotMatch(out, /data-bionic/, `${type} ${t}`);
    }
    assert.match(html(para(["footnote", [{ type }]]), true), /data-bionic/);
  }
});

test("R4: a JetBrains Mono run gets bionic like any other run", () => {
  const out = html(para(["monospace", [{ type: "textStyle", attrs: { fontFamily: "jetbrains-mono" } }]]), true);
  assert.match(out, /<strong data-bionic="">monos<\/strong>/);
});

test("Scripture stays plain with every A1 mark", () => {
  const out = html(
    {
      type: "doc",
      content: [{
        type: "scripture",
        attrs: { citation: "Jn 3:16" },
        content: MARK_TAGS.map(([type]) => ({ type: "text", text: `word ${type} `, marks: [{ type }] })),
      }],
    },
    true,
  );
  assert.doesNotMatch(out, /data-bionic/);
  for (const [, tag] of MARK_TAGS) assert.match(out, new RegExp(`<${tag}>`));
});
