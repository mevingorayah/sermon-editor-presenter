import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT_THEME,
  formatTheme,
} from "@/lib/sermon/export/frames";
import {
  adjustForDarkContrast,
  contrastRatio,
  displayHighlightColor,
  displayTextColor,
  parseColor,
  rgbToHsl,
} from "../contrast";

const screenBg = FORMAT_THEME["screen-dark"].pageBackground;
const printBg = FORMAT_THEME.print.pageBackground;
const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!);
const hue = (c: string) => rgbToHsl(parseColor(c)!)[0];

test("adjustForDarkContrast lightens a low-contrast colour to 4.5:1 and keeps its hue", () => {
  for (const c of ["#1e3a8a", "#7f1d1d", "#5c4a1f", "#000000"]) {
    const out = adjustForDarkContrast(c, screenBg);
    assert.notEqual(out, c, c);
    assert.ok(ratio(out, screenBg) >= 4.5, `${c} -> ${out} ${ratio(out, screenBg)}`);
    if (rgbToHsl(parseColor(c)!)[1] > 0) {
      assert.ok(Math.abs(hue(out) - hue(c)) < 3, `${c} hue ${hue(c)} -> ${hue(out)}`);
    }
  }
});

test("colours that already meet 4.5:1 are returned unchanged", () => {
  for (const c of ["#ffffff", "#fbbf24", "#ef4444", "#ece6da"]) {
    assert.ok(ratio(c, screenBg) >= 4.5, c);
    assert.equal(adjustForDarkContrast(c, screenBg), c);
  }
});

test("print theme leaves text and highlights untouched", () => {
  const darkBlue = "#1e3a8a";
  assert.equal(formatTheme("a4"), "print");
  assert.equal(displayTextColor(darkBlue, printBg, "print"), darkBlue);
  assert.equal(displayTextColor(darkBlue, printBg, "print", { highlight: true }), darkBlue);
  assert.equal(displayHighlightColor("#fff176", "print"), "#fff176");
  // Saved colour is not rewritten.
  const saved = darkBlue;
  displayTextColor(saved, printBg, "print");
  assert.equal(saved, "#1e3a8a");
});

test("screen-dark lightens page text but keeps highlight colour and dark text on a highlight", () => {
  const darkBlue = "#1e3a8a";
  const highlight = "#fff176";
  const onPage = displayTextColor(darkBlue, screenBg, "screen-dark");
  assert.notEqual(onPage, darkBlue);
  assert.ok(ratio(onPage, screenBg) >= 4.5);
  assert.ok(Math.abs(hue(onPage) - hue(darkBlue)) < 3);
  // Text on a highlight stays dark (the saved colour).
  assert.equal(displayTextColor(darkBlue, highlight, "screen-dark", { highlight: true }), darkBlue);
  // Highlights keep their colour.
  assert.equal(displayHighlightColor(highlight, "screen-dark"), highlight);
  // The saved value itself is never mutated.
  const saved = darkBlue;
  displayTextColor(saved, screenBg, "screen-dark");
  assert.equal(saved, "#1e3a8a");
});
