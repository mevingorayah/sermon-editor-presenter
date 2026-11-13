import { ALIASES_BY_LENGTH, foldBookKey, type BookId } from "./books";

export interface ParsedReference {
  book: BookId;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  /** Inclusive. `null` means "through the end of `endChapter`". */
  endVerse: number | null;
}

const RANGE_DASH = /[\u2010-\u2015\u2212-]/g; // hyphen, en dash, em dash, minus

/**
 * Parse a French or English scripture reference.
 * Examples: "Romains 11.33–34", "Rom 11:33-34", "Jean 3.16", "1 Co 13.4-7",
 * "Genesis 1:1", "John 3:16–4:2". Returns null when the book or numbers are
 * missing or the range runs backwards.
 */
export function parseReference(str: string): ParsedReference | null {
  if (typeof str !== "string") return null;
  const raw = str.trim().replace(/\u00a0/g, " ");
  if (!raw) return null;
  const folded = foldBookKey(raw).replace(RANGE_DASH, "-");
  let book: BookId | null = null;
  let rest = "";
  for (const { alias, id } of ALIASES_BY_LENGTH) {
    if (!folded.startsWith(alias)) continue;
    const next = folded[alias.length];
    // Book name must be a whole token (end, or a non-letter: space, digit, punctuation).
    if (next !== undefined && /\p{L}/u.test(next)) continue;
    book = id;
    rest = folded.slice(alias.length).trim();
    break;
  }
  if (!book) return null;
  rest = rest.replace(/^[\s.,;:]+/, "").trim();
  if (!rest) return null;

  // chapter[:.]verse [[-] [chapter[:.]] verse]
  const verseRange = /^(\d+)\s*[.:]\s*(\d+)(?:\s*-\s*(?:(\d+)\s*[.:]\s*)?(\d+))?\s*$/.exec(rest);
  if (verseRange) {
    const startChapter = Number(verseRange[1]);
    const startVerse = Number(verseRange[2]);
    const endChapter = verseRange[3] ? Number(verseRange[3]) : startChapter;
    const endVerse = verseRange[4] ? Number(verseRange[4]) : startVerse;
    return finish(book, startChapter, startVerse, endChapter, endVerse);
  }

  // Whole chapter, or chapter range: "Romains 11" / "Romains 11–12"
  const chapterRange = /^(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(rest);
  if (chapterRange) {
    const startChapter = Number(chapterRange[1]);
    const endChapter = chapterRange[2] ? Number(chapterRange[2]) : startChapter;
    return finish(book, startChapter, 1, endChapter, null);
  }
  return null;
}

function finish(
  book: BookId,
  startChapter: number,
  startVerse: number,
  endChapter: number,
  endVerse: number | null,
): ParsedReference | null {
  if (![startChapter, startVerse, endChapter].every((n) => Number.isInteger(n) && n >= 1)) return null;
  if (endVerse !== null && !(Number.isInteger(endVerse) && endVerse >= 1)) return null;
  if (endChapter < startChapter) return null;
  if (endChapter === startChapter && endVerse !== null && endVerse < startVerse) return null;
  return { book, startChapter, startVerse, endChapter, endVerse };
}
