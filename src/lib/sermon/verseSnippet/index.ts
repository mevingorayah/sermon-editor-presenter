export type {
  BundledTranslation,
  PassageProvider,
  PassageResult,
  PasteTranslation,
  TranslationId,
  TranslationInfo,
  VerseSnippetAttrs,
  VerseTextMap,
} from "./types";

export {
  ALL_TRANSLATIONS,
  BUNDLED_TRANSLATIONS,
  DEFAULT_TRANSLATION,
  PASTE_TRANSLATIONS,
  TRANSLATIONS,
  TRANSLATION_BY_ID,
  VERSE_SNIPPET_EXPORT_FONT,
  VERSE_SNIPPET_FONT_FAMILY,
  isBundledTranslation,
  isPasteTranslation,
  isTranslationId,
  translationLabel,
} from "./types";

export { parseReference, formatReference } from "@/lib/bible";
export type { ParsedReference } from "@/lib/bible";
export { bibleGatewayUrl } from "./bibleGateway";
export {
  currentPassageText,
  emptyVerseSnippetAttrs,
  normalizeAttrs,
  normalizeTextMap,
  withTranslationText,
} from "./texts";
export {
  FIXTURE_PASSAGES,
  createFixtureProvider,
  getInstalledPassageProvider,
  getPassage,
  getPassageProvider,
  setPassageProvider,
} from "./provider";
export type { FixturePassage } from "./provider";

export { VerseSnippet } from "./extension";
