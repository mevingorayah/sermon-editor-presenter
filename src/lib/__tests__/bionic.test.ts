import { test } from "node:test";
import assert from "node:assert/strict";
import { bionicParts, clampBionicStrength, DEFAULT_BIONIC_STRENGTH, MIN_BIONIC_STRENGTH } from "../bionic";

const join = (s: string) => bionicParts(s).map((p) => p.text).join("");

test("bionic keeps text identical, punctuation rendered once", () => {
  for (const s of [
    "Grace — and peace.",
    "Wait... what?!",
    "“Fear not,” he said - (John 3:16) …",
    "— ... !! ,",
    "\"Hello,\" world!",
    "« Bonjour » ; mes amis : oui, non.",
  ]) {
    assert.equal(join(s), s);
  }
});

test("punctuation-only token produces a single part", () => {
  const parts = bionicParts("—");
  assert.deepEqual(parts, [{ bold: false, text: "—" }]);
});

test("strength defaults to 45% and the floor cannot turn bionic off", () => {
  assert.equal(DEFAULT_BIONIC_STRENGTH, 0.45);
  assert.ok(MIN_BIONIC_STRENGTH > 0);
  assert.equal(clampBionicStrength(0), MIN_BIONIC_STRENGTH);
  assert.equal(clampBionicStrength(-1), MIN_BIONIC_STRENGTH);
  assert.equal(clampBionicStrength(2), 1);
  assert.equal(clampBionicStrength(undefined), 0.45);
  const word = "supplement"; // 10 letters
  const low = bionicParts(word, MIN_BIONIC_STRENGTH).filter((p) => p.bold).map((p) => p.text).join("");
  const mid = bionicParts(word, 0.45).filter((p) => p.bold).map((p) => p.text).join("");
  const high = bionicParts(word, 1).filter((p) => p.bold).map((p) => p.text).join("");
  assert.ok(low.length >= 1);
  assert.ok(mid.length > low.length);
  assert.equal(high, word);
  assert.equal(bionicParts(word, 0).filter((p) => p.bold).map((p) => p.text).join("").length, low.length);
});
