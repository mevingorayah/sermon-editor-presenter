import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EXPORT_THEME,
  EXPORT_THEME_FIELD,
  exportThemeFields,
} from "../theme";

test("export theme defaults to light", () => {
  assert.equal(DEFAULT_EXPORT_THEME, "light");
});

test("dark applies to pdf, png, pptx; docx stays light", () => {
  for (const f of ["pdf", "png", "pptx"] as const) {
    assert.deepEqual(exportThemeFields(f, "dark"), { [EXPORT_THEME_FIELD]: "dark" });
    assert.deepEqual(exportThemeFields(f, "light"), { [EXPORT_THEME_FIELD]: "light" });
  }
  assert.deepEqual(exportThemeFields("docx", "dark"), { [EXPORT_THEME_FIELD]: "light" });
});
