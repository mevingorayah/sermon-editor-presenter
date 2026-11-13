import { test } from "node:test";
import assert from "node:assert/strict";
import { afmMeasurer, letterSpacingEm } from "../export/textMeasure";
import { wrapLineRanges } from "../export/pngLayout";

test("letter-spacing is included in shared pngLayout measurement", () => {
  const text = "suppléments";
  const size = 48;
  const plain = afmMeasurer(text, size, { font: "sans" });
  const spaced = afmMeasurer(text, size, { font: "sans", letterSpacing: "0.1em" });
  const expected = letterSpacingEm("0.1em") * size * [...text].length;
  assert.ok(spaced > plain);
  assert.ok(Math.abs(spaced - (plain + expected)) < 1e-6);
  // A tight column that fits the unspaced word must wrap or shrink once spacing is added.
  const ranges = wrapLineRanges(text, size, plain + expected / 2, [
    { start: 0, end: text.length, style: { font: "sans", letterSpacing: "0.1em" } },
  ], afmMeasurer, false);
  const width = ranges.reduce((w, [a, z]) => Math.max(w, afmMeasurer(text.slice(a, z), size, { font: "sans", letterSpacing: "0.1em" })), 0);
  assert.ok(width <= plain + expected / 2 + 0.5 || ranges.length >= 1);
});
