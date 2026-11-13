import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampLetterSpacing,
  clampLineSpacing,
  letterSpacingCss,
  lineSpacingCss,
} from "@/lib/writing/spacing";

test("letter spacing clamps to −0.05…0.30 em and rounds to 0.01", () => {
  assert.equal(clampLetterSpacing(-1), -0.05);
  assert.equal(clampLetterSpacing(1), 0.3);
  assert.equal(clampLetterSpacing(0.126), 0.13);
  assert.equal(letterSpacingCss(0.05), "0.05em");
  assert.equal(letterSpacingCss("-0.02em"), "-0.02em");
  assert.equal(letterSpacingCss(null), null);
});

test("line spacing clamps to 1.0…2.5 and rounds to 0.05", () => {
  assert.equal(clampLineSpacing(0.5), 1);
  assert.equal(clampLineSpacing(3), 2.5);
  assert.equal(clampLineSpacing(1.52), 1.5);
  assert.equal(lineSpacingCss(1.7), "1.7");
  assert.equal(lineSpacingCss(""), null);
});
