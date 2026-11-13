import { test } from "node:test";
import assert from "node:assert/strict";
import { blankSermon } from "../newSermon";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";

test("a newly created sermon is A4 Portrait", () => {
  const d = blankSermon(undefined, new Date("2026-01-01T00:00:00Z"), "11111111-1111-4111-8111-111111111111");
  assert.equal(d.presentationSettings.calibrationTarget, "paper-a4");
  assert.equal(d.presentationSettings.page?.format, "a4");
  assert.equal(d.presentationSettings.page?.orientation, "portrait");
  assert.equal(d.title, "Untitled sermon");
});

test("A4 Portrait even when the open sermon uses another page; reading prefs carry over", () => {
  const open = { ...DEFAULT_PRESENTATION_SETTINGS, theme: "light" as const, calibrationTarget: "screen-16-10" as const };
  const d = blankSermon(open);
  assert.equal(d.presentationSettings.calibrationTarget, "paper-a4");
  assert.equal(d.presentationSettings.page?.format, "a4");
  assert.equal(d.presentationSettings.page?.orientation, "portrait");
  assert.equal(d.presentationSettings.theme, "light");
  assert.equal(open.calibrationTarget, "screen-16-10"); // existing sermon's settings untouched
});
