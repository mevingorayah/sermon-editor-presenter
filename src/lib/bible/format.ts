import { BOOK_BY_ID, type RefLanguage } from "./books";
import { parseReference, type ParsedReference } from "./parse";

/**
 * Format a parsed (or parseable) reference in `lang`.
 * French uses a full stop between chapter and verse; English uses a colon.
 * Ranges use an en dash. Returns null when `ref` cannot be parsed.
 */
export function formatReference(ref: string | ParsedReference, lang: RefLanguage): string | null {
  const parsed = typeof ref === "string" ? parseReference(ref) : ref;
  if (!parsed) return null;
  const name = BOOK_BY_ID[parsed.book][lang];
  const sep = lang === "fr" ? "." : ":";
  const start = `${parsed.startChapter}${sep}${parsed.startVerse}`;
  if (parsed.endChapter === parsed.startChapter && (parsed.endVerse === null || parsed.endVerse === parsed.startVerse)) {
    // Single verse, or "whole rest of chapter" shown as chapter.startVerse– (rare).
    if (parsed.endVerse === null && parsed.startVerse === 1) return `${name} ${parsed.startChapter}`;
    if (parsed.endVerse === null) return `${name} ${start}–`;
    return `${name} ${start}`;
  }
  if (parsed.endChapter === parsed.startChapter) {
    return `${name} ${start}–${parsed.endVerse}`;
  }
  if (parsed.endVerse === null) {
    if (parsed.startVerse === 1) return `${name} ${parsed.startChapter}–${parsed.endChapter}`;
    return `${name} ${start}–${parsed.endChapter}${sep}`;
  }
  return `${name} ${start}–${parsed.endChapter}${sep}${parsed.endVerse}`;
}
