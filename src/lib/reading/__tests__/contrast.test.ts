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
