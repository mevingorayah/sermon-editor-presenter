import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSavedTime, saveStatusView, type SaveStatusKind } from "../saveStatusView";

const at = new Date(2026, 9, 22, 14, 5);
const ALL: SaveStatusKind[] = [
  "saved-server", "saved-local", "saving", "offline",
  "restoring", "retrying", "failed-network", "failed-server",
];

test("never shows 'Saved' while any change is pending", () => {
  for (const s of ALL) {
    const v = saveStatusView(s, { pending: true, savedAt: at });
    assert.ok(!v.label.startsWith("Saved"), `${s} → ${v.label}`);
  }
});

test("saved shows time; saving and failure wording", () => {
  assert.match(saveStatusView("saved-server", { pending: false, savedAt: at }).label, /^Saved \d{1,2}[:.h]\d{2}/);
  assert.equal(saveStatusView("saving", { pending: false, savedAt: null }).label, "Saving…");
  for (const s of ["retrying", "failed-network", "failed-server", "offline"] as const) {
    const v = saveStatusView(s, { pending: false, savedAt: at });
    assert.equal(v.label, "Not saved, retrying");
    assert.equal(v.tone, "error");
  }
});

test("time is always 24h HH:MM, including en-US", () => {
  const pm = new Date(2026, 9, 22, 14, 5);
  const am = new Date(2026, 9, 22, 9, 7);
  assert.equal(formatSavedTime(pm, "en-US"), "14:05");
  assert.equal(formatSavedTime(am, "en-US"), "09:07");
  assert.equal(formatSavedTime(pm, "en-GB"), "14:05");
  assert.doesNotMatch(formatSavedTime(pm, "en-US"), /AM|PM/i);
});

test("on open, nothing is shown until the first real save", () => {
  for (const s of ["saved-server", "saved-local"] as const) {
    const v = saveStatusView(s, { pending: false, savedAt: null });
    assert.equal(v.label, "");
    assert.equal(v.tone, "neutral");
  }
});
