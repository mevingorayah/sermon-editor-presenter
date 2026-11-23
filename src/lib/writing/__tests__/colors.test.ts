import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HIGHLIGHT_PRESETS,
  TEXT_COLORS,
  normalizeHex,
  pushRecent,
  RECENT_COLORS_MAX,
} from "@/lib/writing/colors";

test("text colour palette has the 6 specified presets with light and dark hex", () => {
  assert.equal(TEXT_COLORS.length, 6);
  assert.deepEqual(
    TEXT_COLORS.map((c) => [c.id, c.label, c.value, c.dark]),
    [
      ["ink", "Ink", "#1a1814", "#f2eee6"],
      ["crimson", "Crimson", "#a8201a", "#ff8a80"],
      ["royal-blue", "Royal blue", "#1d4e89", "#8ab4f8"],
      ["forest", "Forest", "#2e6b3a", "#81c995"],
      ["gold", "Gold", "#8a5a00", "#f6c453"],
      ["purple", "Purple", "#5b2a86", "#c58af9"],
    ],
  );
  for (const c of TEXT_COLORS) {
    assert.equal(normalizeHex(c.value), c.value.toUpperCase());
    assert.equal(normalizeHex(c.dark), c.dark.toUpperCase());
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
