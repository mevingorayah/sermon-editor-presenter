import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DARK_STAGE_BG,
  contrastRatio,
  ensureContrast,
  parseColor,
  readingHighlightColor,
  readingTextColor,
  rgbToHsl,
} from "../contrast";

const bg = parseColor(DARK_STAGE_BG)!;
const ratio = (c: string) => contrastRatio(parseColor(c)!, bg);
const hue = (c: string) => rgbToHsl(parseColor(c)!)[0];

test("parses #RRGGBB and rgb()", () => {
  assert.deepEqual(parseColor("#ff0000"), [255, 0, 0]);
  assert.deepEqual(parseColor("rgb(0, 128, 255)"), [0, 128, 255]);
  assert.equal(parseColor("var(--x)"), null);
});

test("low-contrast colour is lightened to >= 4.5:1 and keeps its hue", () => {
  for (const c of ["#1e3a8a", "#7f1d1d", "#5c4a1f", "#000000", "rgb(20, 83, 45)"]) {
    const out = ensureContrast(c);
    assert.notEqual(out, c, c);
    assert.ok(ratio(out) >= 4.5, `${c} -> ${out} ratio ${ratio(out)}`);
    if (rgbToHsl(parseColor(c)!)[1] > 0) {
      assert.ok(Math.abs(hue(out) - hue(c)) < 3, `${c} hue ${hue(c)} -> ${hue(out)}`);
    }
    // Lightened only as far as needed.
    assert.ok(ratio(out) < 5, `${c} overshoot ${ratio(out)}`);
  }
});

test("colours that already pass are returned exactly as written", () => {
  for (const c of ["#ffffff", "#fbbf24", "#ef4444", "rgb(200, 200, 200)"]) {
    assert.ok(ratio(c) >= 4.5);
    assert.equal(ensureContrast(c), c);
  }
});

test("light theme never changes colours", () => {
  assert.equal(readingTextColor("#1e3a8a", "light"), "#1e3a8a");
  assert.equal(readingHighlightColor("#fde68a", "light"), "#fde68a");
});

test("dark theme highlight uses a dark variant of the same hue", () => {
  const out = readingHighlightColor("#fde68a", "dark");
  assert.ok(rgbToHsl(parseColor(out)!)[2] <= 0.31);
  assert.ok(Math.abs(hue(out) - hue("#fde68a")) < 3);
});

test("unparseable colours pass through", () => {
  assert.equal(readingTextColor("var(--edit-accent)", "dark"), "var(--edit-accent)");
});

// Q3 / UI UX rule: text on a highlight in dark Preach reaches 4.5:1 against
// that highlight's dark colour. Mirrors TEXT_COLORS in FormatToolbar.tsx.
import {
  DARK_HIGHLIGHT_BG as HL_DEFAULT,
  effectiveDarkBackground,
  readingHighlightColor as hlDark,
  readingTextColor as textOn,
  contrastRatio as ratioOf,
  parseColor as rgbOf,
  rgbToHsl as hslOf,
} from "../contrast";

const TEXT_PRESETS = ["#5c5c5c", "#5c4a1f", "#9b3e36", "#376080", "#336640"];
// Old files keep the previous swatch values (no migration); they must still pass.
const LEGACY_TEXT = ["#9a948a", "#d47870", "#6a9fc4", "#6aaa7a", "#6b6b6b", "#b0463d", "#3f6f93", "#3d7a4c"];
const DARK_HIGHLIGHTS = [
  HL_DEFAULT,
  ...["#fff176", "#fde68a", "#fef08a", "#d4a84b", "#93c5fd", "#86efac", "#f9a8d4", "#c4b5fd"].map((c) => hlDark(c, "dark")),
];

test("every text preset reaches 4.5:1 on every dark highlight, keeping its hue", () => {
  for (const bg of DARK_HIGHLIGHTS) {
    for (const c of [...TEXT_PRESETS, ...LEGACY_TEXT, "#1e3a8a"]) {
      const out = textOn(c, "dark", bg);
      const r = ratioOf(rgbOf(out)!, rgbOf(bg)!);
      assert.ok(r >= 4.5, `${c} on ${bg} -> ${out} = ${r.toFixed(2)}`);
      const [h0, s0] = hslOf(rgbOf(c)!);
      const [h1, , l1] = hslOf(rgbOf(out)!);
      // Near-white outputs lose hue to 8-bit rounding; skip them and greys.
      if (s0 > 0.15 && l1 < 0.95) assert.ok(Math.abs(h1 - h0) < 4, `${c} hue drift`);
    }
  }
});

test("effective background: highlight colour, default highlight, else the page", () => {
  assert.equal(effectiveDarkBackground(null, false), "#12110f");
  assert.equal(effectiveDarkBackground(null, true), "#655F33");
  assert.equal(effectiveDarkBackground("#93c5fd", true), hlDark("#93c5fd", "dark"));
  assert.equal(textOn("#9a948a", "light", "#655F33"), "#9a948a");
});

test("dark highlights: #17 yellow preset is exact; others darken until body text reaches 4.5:1", () => {
  assert.equal(hlDark("#FFF176", "dark"), "#655F33");
  assert.equal(hlDark("#123456", "dark", "yellow"), "#655F33");
  assert.equal(hlDark("#fde68a", "light"), "#fde68a");
  const fg = rgbOf("#ede8df")!;
  for (const c of ["#fde68a", "#fef08a", "#86efac", "#ffffff", "#00ffff", "#d4a84b"]) {
    const d = hlDark(c, "dark");
    assert.ok(ratioOf(fg, rgbOf(d)!) >= 4.5, `${c} -> ${d}`);
    const [h0, s0] = hslOf(rgbOf(c)!);
    if (s0 > 0.15) assert.ok(Math.abs(hslOf(rgbOf(d)!)[0] - h0) < 4, `${c} hue`);
  }
});

test("plain highlight = yellow preset: every text preset reaches 4.5:1 on it", () => {
  const plain = effectiveDarkBackground(null, true);
  assert.equal(plain, hlDark("#FFF176", "dark"));
  for (const c of TEXT_PRESETS) {
    const out = textOn(c, "dark", plain);
    assert.ok(ratioOf(rgbOf(out)!, rgbOf(plain)!) >= 4.5, `${c} -> ${out}`);
  }
  assert.ok(ratioOf(rgbOf("#ede8df")!, rgbOf(plain)!) >= 4.5, "body text");
});

test("sermon-marks.css: dark plain highlight is #655F33, no #3d2e0e", () => {
  const css = readFileSync(new URL("../../../styles/sermon-marks.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /#3d2e0e/i);
  assert.match(
    css,
    /\[data-reading-mode\]\[data-theme="dark"\] mark\.sermon-highlight\s*\{\s*background:\s*#655F33;/i,
  );
});

test("Muted gray #5c5c5c: dark Preach lifts it to >= 4.5:1 on the page and every dark highlight; light keeps it", () => {
  for (const bg of ["#12110f", ...DARK_HIGHLIGHTS]) {
    const out = textOn("#5c5c5c", "dark", bg);
    assert.ok(ratioOf(rgbOf(out)!, rgbOf(bg)!) >= 4.5, `on ${bg} -> ${out}`);
  }
  assert.equal(textOn("#5c5c5c", "light"), "#5c5c5c");
  assert.equal(textOn("#9a948a", "light"), "#9a948a"); // legacy files unchanged
});

/** Light-theme highlight backgrounds, read from the source. */
function lightHighlightBackgrounds(): Array<[string, [number, number, number]]> {
  const css = readFileSync(new URL("../../../styles/sermon-marks.css", import.meta.url), "utf8");
  const m = css.match(/mark\.sermon-highlight,\s*\.sermon-highlight\s*\{[^}]*background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  assert.ok(m, "light highlight rgba() not found in sermon-marks.css");
  const [r, g, b, a] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  const over = (bg: string): [number, number, number] =>
    rgbOf(bg)!.map((c, i) => Math.round([r, g, b][i] * a + c * (1 - a))) as [number, number, number];
  const ts = readFileSync(new URL("../contrast.ts", import.meta.url), "utf8");
  const y = ts.match(/YELLOW_PRESET_LIGHT = "(#[0-9a-fA-F]{6})"/);
  assert.ok(y, "YELLOW_PRESET_LIGHT not found in contrast.ts");
  return [
    [`amber highlight on white`, over("#ffffff")],
    [`amber highlight on Edit #f4f1ea`, over("#f4f1ea")],
    [`amber highlight on light Preach #f7f3eb`, over("#f7f3eb")],
    [`yellow preset ${y[1]}`, rgbOf(y[1])!],
  ];
}

test("every text colour preset in FormatToolbar.tsx is >= 4.5:1 on white, Edit #f4f1ea and every light highlight", () => {
  const src = readFileSync(new URL("../../../components/editor/FormatToolbar.tsx", import.meta.url), "utf8");
  const block = src.match(/export const TEXT_COLORS = \[([\s\S]*?)\] as const;/);
  assert.ok(block, "TEXT_COLORS not found in FormatToolbar.tsx; point this test at the new preset list");
  const values = [...block[1].matchAll(/value:\s*"(#[0-9a-fA-F]{6})"/g)].map((m) => m[1]);
  assert.ok(values.length >= 5, `found ${values.length} presets`);
  assert.deepEqual(values.map((v) => v.toLowerCase()), TEXT_PRESETS);
  for (const v of values) {
    const bgs: Array<[string, [number, number, number]]> = [
      ["white", rgbOf("#ffffff")!],
      ["Edit #f4f1ea", rgbOf("#f4f1ea")!],
      ...lightHighlightBackgrounds(),
    ];
    for (const [name, bg] of bgs) {
      const r = ratioOf(rgbOf(v)!, bg);
      assert.ok(r >= 4.5, `${v} is ${r.toFixed(2)}:1 on ${name}`);
    }
  }
});
