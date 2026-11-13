import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT_THEME,
  PRINT_FORMATS,
  SCREEN_FORMATS,
  formatTheme,
} from "../export/frames";

test("Print formats (A4, A5, Letter) use the print theme: white page, dark text", () => {
  assert.deepEqual([...PRINT_FORMATS], ["a4", "a5", "letter"]);
  for (const format of PRINT_FORMATS) {
    assert.equal(formatTheme(format), "print");
    assert.equal(formatTheme({ format, orientation: "portrait" }), "print");
    assert.equal(formatTheme({ format, orientation: "landscape" }), "print");
  }
  assert.equal(FORMAT_THEME.print.pageBackground, "#ffffff");
  assert.equal(FORMAT_THEME.print.text, "#141210");
  // Other paper sizes, not in the default picker, still print.
  assert.equal(formatTheme("half-letter"), "print");
  assert.equal(formatTheme("legal"), "print");
  assert.equal(formatTheme("paper-a4"), "print");
});

test("Screen formats (4:3, 16:10, 16:9, Fit this screen) use screen-dark", () => {
  assert.deepEqual([...SCREEN_FORMATS], ["4:3", "16:10", "16:9", "fit-screen"]);
  for (const format of SCREEN_FORMATS) {
    assert.equal(formatTheme(format), "screen-dark", format);
    assert.equal(formatTheme({ format, orientation: "landscape" }), "screen-dark");
    assert.equal(formatTheme({ format, orientation: "portrait" }), "screen-dark");
  }
  assert.equal(formatTheme({ kind: "fit", width: 1320, height: 2112, orientation: "portrait" }), "screen-dark");
  assert.equal(FORMAT_THEME["screen-dark"].pageBackground, "#141210");
  // Custom in px is a screen; custom on paper units is print.
  assert.equal(formatTheme({ format: "custom", orientation: "landscape", custom: { width: 10, height: 16, unit: "in" } }), "print");
  assert.equal(formatTheme({ format: "custom", orientation: "landscape", custom: { width: 1920, height: 1080, unit: "px", dpi: 96 } }), "screen-dark");
});
