import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReference, parseReference } from "../index";

test("parses French and English book names and abbreviations", () => {
  assert.deepEqual(parseReference("Romains 11.33–34"), {
    book: "ROM", startChapter: 11, startVerse: 33, endChapter: 11, endVerse: 34,
  });
  assert.deepEqual(parseReference("Rom 11:33-34"), {
    book: "ROM", startChapter: 11, startVerse: 33, endChapter: 11, endVerse: 34,
  });
  assert.deepEqual(parseReference("Jean 3.16"), {
    book: "JHN", startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16,
  });
  assert.deepEqual(parseReference("1 Co 13.4-7"), {
    book: "1CO", startChapter: 13, startVerse: 4, endChapter: 13, endVerse: 7,
  });
  assert.deepEqual(parseReference("Genesis 1:1"), {
    book: "GEN", startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1,
  });
  assert.equal(parseReference("1 Corinthiens 13.4")?.book, "1CO");
  assert.equal(parseReference("Éphésiens 2.8")?.book, "EPH");
  assert.equal(parseReference("1 Jean 1.9")?.book, "1JN");
  assert.equal(parseReference("Jean 1.1")?.book, "JHN");
  assert.equal(parseReference("Apocalypse 21.4")?.book, "REV");
  assert.equal(parseReference("Psalm 23:1")?.book, "PSA");
  assert.equal(parseReference("Psaume 23.1")?.book, "PSA");
});

test("accepts en dash, em dash and hyphen ranges, including cross-chapter", () => {
  const same = { book: "ROM", startChapter: 11, startVerse: 33, endChapter: 11, endVerse: 34 };
  assert.deepEqual(parseReference("Romains 11.33–34"), same); // en dash
  assert.deepEqual(parseReference("Romains 11.33—34"), same); // em dash
  assert.deepEqual(parseReference("Romains 11.33-34"), same);
  assert.deepEqual(parseReference("John 3:16–4:2"), {
    book: "JHN", startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2,
  });
  assert.deepEqual(parseReference("Romains 11.33–12.2"), {
    book: "ROM", startChapter: 11, startVerse: 33, endChapter: 12, endVerse: 2,
  });
});

test("rejects invalid references", () => {
  for (const s of [
    "",
    "   ",
    "Nope 1:1",
    "Genesis",
    "11:33",
    "Genesis 0:1",
    "Genesis 1:0",
    "Genesis 1:5-3",
    "Genesis 2:1–1:5",
    "Jean 3:16–2:1",
  ]) {
    assert.equal(parseReference(s), null, s);
  }
});

test("formatReference uses language-specific names, separators and an en dash", () => {
  assert.equal(formatReference("Jean 3.16", "fr"), "Jean 3.16");
  assert.equal(formatReference("Jean 3.16", "en"), "John 3:16");
  assert.equal(formatReference("Rom 11:33-34", "fr"), "Romains 11.33–34");
  assert.equal(formatReference("Romains 11.33–12.2", "en"), "Romans 11:33–12:2");
  assert.equal(formatReference("1 Co 13.4-7", "fr"), "1 Corinthiens 13.4–7");
  assert.equal(formatReference("Genesis 1:1", "en"), "Genesis 1:1");
  assert.equal(formatReference("not a ref", "en"), null);
});
