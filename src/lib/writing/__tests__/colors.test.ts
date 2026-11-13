import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIGHLIGHT_PRESETS,
  TEXT_COLORS,
  normalizeHex,
  pushRecent,
  RECENT_COLORS_MAX,
} from "@/lib/writing/colors";

test("text colour palette keeps 5 named presets (6 including Default in the UI)", () => {
  assert.equal(TEXT_COLORS.length, 5);
  for (const c of TEXT_COLORS) {
    assert.equal(normalizeHex(c.value), c.value.toUpperCase());
  }
});

test("highlight palette has 8 presets with light and dark hex", () => {
  assert.equal(HIGHLIGHT_PRESETS.length, 8);
  const ids = new Set(HIGHLIGHT_PRESETS.map((p) => p.id));
  assert.equal(ids.size, 8);
  for (const p of HIGHLIGHT_PRESETS) {
    assert.equal(normalizeHex(p.value)?.length, 7);
    assert.equal(normalizeHex(p.dark)?.length, 7);
  }
});

test("normalizeHex accepts #RGB and #RRGGBB, with or without #", () => {
  assert.equal(normalizeHex("#a82"), "#AA8822");
  assert.equal(normalizeHex("a8201a"), "#A8201A");
  assert.equal(normalizeHex("#A8201A"), "#A8201A");
  assert.equal(normalizeHex("  #fff  "), "#FFFFFF");
  assert.equal(normalizeHex("red"), null);
  assert.equal(normalizeHex("#ffff"), null);
  assert.equal(normalizeHex(""), null);
});

test("recent colours stay unique, newest first, and cap at 6", () => {
  const a = pushRecent([], "#abc");
  assert.deepEqual(a, ["#AABBCC"]);
  const b = pushRecent(a, "#123456");
  assert.deepEqual(b, ["#123456", "#AABBCC"]);
  const c = pushRecent(b, "#abc");
  assert.deepEqual(c, ["#AABBCC", "#123456"]);
  let list: string[] = [];
  for (let i = 0; i < 8; i++) list = pushRecent(list, `#00000${i}`);
  assert.equal(list.length, RECENT_COLORS_MAX);
  assert.equal(list[0], "#000007");
  assert.ok(!list.includes("#000000"));
});
