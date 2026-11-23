import { test } from "node:test";
import assert from "node:assert/strict";
import { editPageBox, fitScale, initialLeftOpen } from "@/lib/editLayout/layout";

test("edit page box keeps the chosen size and orientation", () => {
  const a4p = editPageBox({ calibrationTarget: "paper-a4", page: { format: "a4", orientation: "portrait" } });
  const a4l = editPageBox({ calibrationTarget: "paper-a4", page: { format: "a4", orientation: "landscape" } });
  assert.equal(a4p.widthPx, 794);
  assert.ok(a4p.heightPx > a4p.widthPx);
  assert.equal(a4l.widthPx, a4p.heightPx);
  assert.equal(a4l.heightPx, a4p.widthPx);
  const tab = editPageBox({ calibrationTarget: "paper-a4", page: { format: "16:10", orientation: "landscape" } });
  assert.ok(Math.abs(tab.widthPx / tab.heightPx - 1.6) < 0.01);
});

test("fit scale never exceeds 1 and shrinks to the band", () => {
  assert.equal(fitScale(794, 2000), 1);
  assert.equal(fitScale(800, 400), 0.5);
  assert.equal(fitScale(0, 400), 1);
});

test("left panel default: expanded at 1280 and up, saved state wins", () => {
  assert.equal(initialLeftOpen(null, 1280), true);
  assert.equal(initialLeftOpen(null, 1279), false);
  assert.equal(initialLeftOpen("collapsed", 1920), false);
  assert.equal(initialLeftOpen("expanded", 800), true);
});
