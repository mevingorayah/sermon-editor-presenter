import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSavedTime, saveStatusView } from "../saveStatusView";

const at = new Date(2026, 9, 22, 14, 5);

test("nothing shown on open until the first real save", () => {
  for (const kind of ["saving", "saved-folder", "saved-browser", "needs-permission"] as const) {
    const v = saveStatusView({ kind }, { started: false, savedAt: null });
    assert.equal(v.label, "");
    assert.equal(v.detail, "");
  }
});

test("Saving…, then Saved HH:MM with where-saved only in detail", () => {
  assert.equal(saveStatusView({ kind: "saving" }, { started: true, savedAt: at }).label, "Saving…");
  const f = saveStatusView({ kind: "saved-folder" }, { started: true, savedAt: at });
  assert.equal(f.label, "Saved 14:05");
  assert.equal(f.tone, "ok");
  assert.match(f.detail, /Sermons folder/);
  assert.doesNotMatch(f.label, /folder|browser/i);
  const b = saveStatusView({ kind: "saved-browser" }, { started: true, savedAt: at });
  assert.equal(b.label, "Saved 14:05");
  assert.match(b.detail, /browser/);
});

test("failure is red 'Not saved, retrying'", () => {
  const v = saveStatusView({ kind: "error", reason: "unknown" }, { started: true, savedAt: at });
  assert.equal(v.label, "Not saved, retrying");
  assert.equal(v.tone, "error");
  const c = saveStatusView({ kind: "conflict" }, { started: true, savedAt: at });
  assert.equal(c.tone, "error");
  assert.ok(c.label.startsWith("Not saved"));
});

test("time is always 24h HH:MM, including en-US", () => {
  assert.equal(formatSavedTime(at, "en-US"), "14:05");
  assert.equal(formatSavedTime(new Date(2026, 9, 22, 9, 7), "en-US"), "09:07");
  assert.doesNotMatch(formatSavedTime(at, "en-US"), /AM|PM/i);
});
