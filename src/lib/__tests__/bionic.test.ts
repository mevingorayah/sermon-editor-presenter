import { test } from "node:test";
import assert from "node:assert/strict";
import { bionicParts } from "../bionic";

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
