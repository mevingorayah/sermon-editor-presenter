import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";
import { blankSermon } from "../newSermon";
import { sanitizePresentationSettings, sanitizePageSettings } from "../sanitizeSettings";

test("old files without page settings stay without a page (legacy calibrationTarget still applies)", () => {
  const raw = { ...DEFAULT_PRESENTATION_SETTINGS };
  delete (raw as { page?: unknown }).page;
  const out = sanitizePresentationSettings(raw) as typeof raw;
  assert.equal("page" in out && out.page !== undefined, false);
  assert.equal(out.calibrationTarget, raw.calibrationTarget);
  assert.equal(out.theme, raw.theme);
});

test("tablet format migrates to 4:3 landscape; valid format+orientation are kept", () => {
  const migrated = sanitizePageSettings({ format: "tablet", orientation: "portrait", textSizePt: 32 });
  assert.deepEqual(migrated, { format: "4:3", orientation: "landscape", textSizePt: 32 });
  const kept = sanitizePageSettings({ format: "16:9", orientation: "portrait" });
  assert.deepEqual(kept, { format: "16:9", orientation: "portrait" });
  const fit = sanitizePageSettings({ format: "fit-screen", orientation: "landscape", pageSpec: { kind: "fit", width: 1000, height: 600 } });
  assert.equal(fit?.format, "fit-screen");
  assert.equal(fit?.orientation, "landscape");
});

test("unknown format or orientation is dropped, not replaced with the A4 default", () => {
  const out = sanitizePageSettings({ format: "billboard" as never, orientation: "diagonal" as never, textSizePt: 28 });
  assert.equal(out?.format, undefined);
  assert.equal(out?.orientation, undefined);
  assert.equal(out?.textSizePt, 28);
});

test("non-object settings pass through so a damaged file still fails schema", () => {
  assert.equal(sanitizePresentationSettings("nope"), "nope");
  assert.equal(sanitizePresentationSettings(null), null);
});

test("new sermons stay A4 portrait even when reading prefs are carried from a screen sermon", () => {
  const d = blankSermon({
    ...DEFAULT_PRESENTATION_SETTINGS,
    theme: "light",
    calibrationTarget: "screen-16-10",
    page: { format: "16:9", orientation: "landscape", textSizePt: 36 },
  });
  assert.equal(d.presentationSettings.page?.format, "a4");
  assert.equal(d.presentationSettings.page?.orientation, "portrait");
  assert.equal(d.presentationSettings.calibrationTarget, "paper-a4");
  assert.equal(d.presentationSettings.theme, "light");
});
