import { test } from "node:test";
import assert from "node:assert/strict";
import { saveStatusView, type SaveStatusKind } from "../saveStatusView";

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
