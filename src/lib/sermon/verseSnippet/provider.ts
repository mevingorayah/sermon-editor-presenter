import {
  formatReference,
  getPassage as getBundledPassage,
  parseReference,
  type TranslationId as BundledId,
  type Verse,
} from "@/lib/bible";
import { isBundledTranslation, type PassageProvider, type PassageResult } from "./types";

/**
 * Passage lookup for verse snippets.
 *
 * Production calls Backend's bundled LSG 1910 / WEB API (`@/lib/bible`
 * `getPassage` / `parseReference`, PR #42). Those texts are lazy-loaded
 * per book from `/bibles/{lsg|web}/{BOOK}.json` and work offline once
 * cached. Licensed translations are not bundled — the editor shows a
 * Bible Gateway link and a paste area instead.
 *
 * Unit tests may `setPassageProvider(createFixtureProvider())` with
 * made-up verses. That override is never the production default.
 */

let installed: PassageProvider | null = null;

export function setPassageProvider(provider: PassageProvider | null): void {
  installed = provider;
}

export function getInstalledPassageProvider(): PassageProvider | null {
  return installed;
}

export function getPassageProvider(): PassageProvider {
  return installed ?? bundledProvider;
}

export async function getPassage(
  ref: string,
  translation: string,
): Promise<PassageResult | null> {
  return getPassageProvider().getPassage(ref, translation);
}

function bundledId(translation: string): BundledId | null {
  if (!isBundledTranslation(translation)) return null;
  return translation.toLowerCase() as BundledId;
}

/** Join the verses Backend returned, verbatim, with a single space. */
export function joinVerseTexts(verses: Verse[]): string {
  return verses.map((v) => v.text).join(" ");
}

const bundledProvider: PassageProvider = {
  async getPassage(ref, translation) {
    const id = bundledId(translation);
    if (!id) return null;
    try {
      const verses = await getBundledPassage(ref, id);
      if (!verses || verses.length === 0) return null;
      const parsed = parseReference(ref);
      const lang = id === "lsg" ? "fr" : "en";
      const formatted = parsed ? formatReference(parsed, lang) : null;
      return { text: joinVerseTexts(verses), ref: formatted ?? ref.trim() };
    } catch {
      // Relative `/bibles/...` fetch throws in Node (no document base URL).
      return null;
    }
  },
};

/** One obviously-fake passage used by the test fixture. */
export interface FixturePassage {
  /** Any parseable reference that should resolve to this passage (first is canonical). */
  refs: string[];
  translations: Record<string, string>;
}

/**
 * Tiny made-up passages for unit tests only. The wording is deliberately
 * not Scripture, so it can never be mistaken for a bundled Bible text.
 */
export const FIXTURE_PASSAGES: readonly FixturePassage[] = [
  {
    refs: ["Jean 3:16", "Jn 3:16", "John 3:16", "Jn 3.16"],
    translations: {
      LSG: "FIXTURE LSG: Ceci est un verset inventé pour les tests, pas un texte biblique.",
      WEB: "FIXTURE WEB: This is a made-up test verse, not Scripture.",
    },
  },
  {
    refs: ["Jean 3:16-18", "Jn 3.16-18", "John 3:16-18"],
    translations: {
      LSG: "FIXTURE LSG RANGE: Versets de test 16 à 18, texte inventé.",
      WEB: "FIXTURE WEB RANGE: Made-up test verses 16 to 18, not Scripture.",
    },
  },
  {
    refs: ["Psaumes 23:1", "Psalm 23:1", "Ps 23:1"],
    translations: {
      LSG: "FIXTURE LSG: Psaume de test, texte inventé.",
      WEB: "FIXTURE WEB: Test psalm line, not Scripture.",
    },
  },
];

function parsedKey(ref: string): string | null {
  const parsed = parseReference(ref);
  if (!parsed) return null;
  return `${parsed.book}.${parsed.startChapter}.${parsed.startVerse}-${parsed.endChapter}.${parsed.endVerse ?? ""}`;
}

function fixtureIndex(passages: readonly FixturePassage[]): Map<string, FixturePassage> {
  const map = new Map<string, FixturePassage>();
  for (const p of passages) {
    for (const r of p.refs) {
      const key = parsedKey(r);
      if (key) map.set(key, p);
      map.set(r.trim().toLowerCase(), p);
    }
  }
  return map;
}

/**
 * A provider that only knows the made-up `FIXTURE_PASSAGES` (or a custom
 * list). Use this in unit tests; do not ship it as the production default.
 */
export function createFixtureProvider(
  passages: readonly FixturePassage[] = FIXTURE_PASSAGES,
): PassageProvider {
  const index = fixtureIndex(passages);
  return {
    async getPassage(ref, translation) {
      const parsed = parseReference(ref);
      const hit =
        (parsed ? index.get(parsedKey(ref) ?? "") : undefined) ??
        index.get(ref.trim().toLowerCase());
      if (!hit) return null;
      const text = hit.translations[translation];
      if (typeof text !== "string") return null;
      const lang = translation === "LSG" ? "fr" : "en";
      const display = parsed ? formatReference(parsed, lang) : null;
      return { text, ref: display ?? ref.trim() };
    },
  };
}
