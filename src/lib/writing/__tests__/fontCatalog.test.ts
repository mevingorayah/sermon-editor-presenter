import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FONT_SANS,
  FONT_SERIF,
  FONT_MONO,
  SERIF_FONTS,
  SANS_FONTS,
  GOOGLE_FONTS_HREF,
  writingFontId,
} from "@/lib/writing/fontCatalog";
import { fontCategory, mapFontFamily } from "@/lib/sermon/export/fonts";

test("catalog has 8 serif + 8 sans Google fonts and keeps system stacks", () => {
  assert.equal(SERIF_FONTS.length, 8);
  assert.equal(SANS_FONTS.length, 8);
  assert.equal(writingFontId(FONT_SANS), "sans");
  assert.equal(writingFontId(FONT_SERIF), "serif");
  assert.equal(writingFontId(FONT_MONO), "mono");
  // Existing saved sermons store these exact stacks.
  assert.equal(writingFontId('system-ui, -apple-system, "Segoe UI", sans-serif'), "sans");
  assert.equal(writingFontId("ui-serif, Georgia, serif"), "serif");
});

test("stored family names and ids map for export category (French-capable fonts)", () => {
  assert.equal(writingFontId("lora"), "lora");
  assert.equal(writingFontId('"Lora", serif'), "lora");
  assert.equal(writingFontId('"Open Sans", sans-serif'), "open-sans");
  assert.equal(writingFontId('"EB Garamond", serif'), "eb-garamond");
  assert.equal(writingFontId('"IBM Plex Sans", sans-serif'), "ibm-plex-sans");
  assert.equal(fontCategory(mapFontFamily('"Inter", sans-serif')), "sans");
  assert.equal(fontCategory(mapFontFamily('"EB Garamond", serif')), "serif");
  assert.equal(GOOGLE_FONTS_HREF.includes("display=swap"), true);
  assert.equal(GOOGLE_FONTS_HREF.startsWith("https://fonts.googleapis.com/css2?"), true);
});
