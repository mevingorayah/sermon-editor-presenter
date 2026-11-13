/**
 * Verse snippet types and translation catalogue.
 *
 * Bundled LSG 1910 and WEB texts are owned by Backend. This module only
 * names the translations and describes how a passage is requested.
 */

/** Bundled translations: resolved offline via `@/lib/bible` (PR #42). */
export const BUNDLED_TRANSLATIONS = ["LSG", "WEB"] as const;
export type BundledTranslation = (typeof BUNDLED_TRANSLATIONS)[number];

/**
 * Licensed translations: no text is bundled. The editor shows an
 * "Open on Bible Gateway" link and a paste area. Pasted text is stored
 * verbatim per translation and restored when the writer switches back.
 */
export const PASTE_TRANSLATIONS = ["ESV", "NIV", "NASB1995", "SG21", "SEMEUR"] as const;
export type PasteTranslation = (typeof PASTE_TRANSLATIONS)[number];

export const ALL_TRANSLATIONS = [
  ...BUNDLED_TRANSLATIONS,
  ...PASTE_TRANSLATIONS,
] as const;
export type TranslationId = (typeof ALL_TRANSLATIONS)[number];

export interface TranslationInfo {
  id: TranslationId;
  /** Short label shown in the menu and in Preach/export captions. */
  label: string;
  /** Longer name for the menu (accessible). */
  title: string;
  kind: "bundled" | "paste";
  /**
   * Bible Gateway `version` query value. Only used for paste translations.
   * @see https://www.biblegateway.com/passage/?search=John%203:16&version=ESV
   */
  bibleGatewayCode?: string;
}

export const TRANSLATIONS: readonly TranslationInfo[] = [
  { id: "LSG", label: "LSG 1910", title: "Louis Segond 1910 (bundled, offline)", kind: "bundled" },
  { id: "WEB", label: "WEB", title: "World English Bible (bundled, offline)", kind: "bundled" },
  { id: "ESV", label: "ESV", title: "English Standard Version", kind: "paste", bibleGatewayCode: "ESV" },
  { id: "NIV", label: "NIV", title: "New International Version", kind: "paste", bibleGatewayCode: "NIV" },
  { id: "NASB1995", label: "NASB 1995", title: "New American Standard Bible 1995", kind: "paste", bibleGatewayCode: "NASB1995" },
  { id: "SG21", label: "Segond 21", title: "Segond 21", kind: "paste", bibleGatewayCode: "SG21" },
  { id: "SEMEUR", label: "Semeur", title: "Bible du Semeur", kind: "paste", bibleGatewayCode: "BDS" },
] as const;

export const TRANSLATION_BY_ID: Readonly<Record<TranslationId, TranslationInfo>> =
  Object.fromEntries(TRANSLATIONS.map((t) => [t.id, t])) as Record<
    TranslationId,
    TranslationInfo
  >;

export const DEFAULT_TRANSLATION: TranslationId = "LSG";

export function isTranslationId(value: string): value is TranslationId {
  return (ALL_TRANSLATIONS as readonly string[]).includes(value);
}

export function isBundledTranslation(value: string): value is BundledTranslation {
  return (BUNDLED_TRANSLATIONS as readonly string[]).includes(value);
}

export function isPasteTranslation(value: string): value is PasteTranslation {
  return (PASTE_TRANSLATIONS as readonly string[]).includes(value);
}

export function translationLabel(id: string): string {
  return isTranslationId(id) ? TRANSLATION_BY_ID[id].label : id;
}

/** Per-translation verbatim text map stored on the node. */
export type VerseTextMap = Record<string, string>;

/** TipTap node attributes for `verseSnippet`. */
export interface VerseSnippetAttrs {
  ref: string;
  translation: string;
  texts: VerseTextMap;
}

/** Result of `PassageProvider.getPassage`. */
export interface PassageResult {
  /** Passage text, verbatim as the provider returned it. */
  text: string;
  /** Reference as the provider resolved it (may be canonicalised). */
  ref: string;
}

/**
 * Resolves a reference to passage text. Production uses Backend's bundled
 * LSG 1910 / WEB API (`@/lib/bible`). Unit tests may install a made-up fixture.
 * Returns `null` when the passage is not available.
 */
export interface PassageProvider {
  getPassage(ref: string, translation: string): Promise<PassageResult | null>;
}

/** CSS font stack: Literata when the app font is loaded, else existing serif. */
export const VERSE_SNIPPET_FONT_FAMILY =
  'var(--font-literata), Literata, var(--edit-font-body), var(--rm-font-body), Georgia, "Times New Roman", serif';

/** Export font id for verse snippet runs (Literata is the bundled serif). */
export const VERSE_SNIPPET_EXPORT_FONT = "literata" as const;
