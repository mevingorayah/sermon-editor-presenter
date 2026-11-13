import type { BookId } from "./books";
import { parseReference, type ParsedReference } from "./parse";

export type TranslationId = "lsg" | "web";

/** chapter → verse → text (keys are decimal strings, as stored in the JSON files). */
export type BookJson = Record<string, Record<string, string>>;

export interface Verse {
  book: BookId;
  chapter: number;
  verse: number;
  text: string;
}

export type BookLoader = (translation: TranslationId, book: BookId) => Promise<BookJson | null>;

const cache = new Map<string, BookJson>();
let bookLoader: BookLoader = defaultBookLoader;

/** Tests (and Node scripts) can point this at the files on disk. The default is a fetch of `/bibles/{lsg|web}/{BOOK}.json`. */
export function setBookLoader(loader: BookLoader | null): void {
  bookLoader = loader ?? defaultBookLoader;
  cache.clear();
}

async function defaultBookLoader(translation: TranslationId, book: BookId): Promise<BookJson | null> {
  if (typeof fetch !== "function") return null;
  const res = await fetch(`/bibles/${translation}/${book}.json`);
  if (!res.ok) return null;
  return (await res.json()) as BookJson;
}

export async function loadBook(translation: TranslationId, book: BookId): Promise<BookJson | null> {
  const key = `${translation}:${book}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const data = await bookLoader(translation, book);
  if (data) cache.set(key, data);
  return data;
}

/**
 * Load the verses covered by `ref` from a bundled translation.
 * Unparseable references return null. Missing verses in the range are skipped
 * (so a versification gap does not fail the call).
 */
export async function getPassage(
  ref: string | ParsedReference,
  translation: TranslationId,
): Promise<Verse[] | null> {
  if (translation !== "lsg" && translation !== "web") return null;
  const parsed = typeof ref === "string" ? parseReference(ref) : ref;
  if (!parsed) return null;
  const book = await loadBook(translation, parsed.book);
  if (!book) return null;
  const verses: Verse[] = [];
  for (let ch = parsed.startChapter; ch <= parsed.endChapter; ch++) {
    const chapter = book[String(ch)];
    if (!chapter) continue;
    const nums = Object.keys(chapter).map(Number).filter((n) => Number.isInteger(n) && n >= 1).sort((a, b) => a - b);
    const from = ch === parsed.startChapter ? parsed.startVerse : 1;
    const to = ch === parsed.endChapter ? (parsed.endVerse ?? nums[nums.length - 1] ?? 0) : (nums[nums.length - 1] ?? 0);
    for (const v of nums) {
      if (v < from || v > to) continue;
      verses.push({ book: parsed.book, chapter: ch, verse: v, text: chapter[String(v)] });
    }
  }
  return verses;
}
