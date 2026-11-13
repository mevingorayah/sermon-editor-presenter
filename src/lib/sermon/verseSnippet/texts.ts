import {
  DEFAULT_TRANSLATION,
  isTranslationId,
  type VerseSnippetAttrs,
  type VerseTextMap,
} from "./types";

/** Read a text map from a node attr that may be a string (HTML) or object. */
export function normalizeTextMap(raw: unknown): VerseTextMap {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return normalizeTextMap(parsed);
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object") return {};
  const out: VerseTextMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function normalizeAttrs(
  attrs: Partial<VerseSnippetAttrs> | Record<string, unknown> | undefined | null,
): VerseSnippetAttrs {
  const raw = (attrs ?? {}) as Record<string, unknown>;
  const translation =
    typeof raw.translation === "string" && raw.translation
      ? raw.translation
      : DEFAULT_TRANSLATION;
  return {
    ref: typeof raw.ref === "string" ? raw.ref : "",
    translation: isTranslationId(translation) ? translation : raw.translation ? String(raw.translation) : DEFAULT_TRANSLATION,
    texts: normalizeTextMap(raw.texts),
  };
}

/** The verbatim text shown for the currently selected translation. */
export function currentPassageText(attrs: Partial<VerseSnippetAttrs> | Record<string, unknown> | undefined | null): string {
  const a = normalizeAttrs(attrs);
  const text = a.texts[a.translation];
  return typeof text === "string" ? text : "";
}

/**
 * Return a new text map with `text` stored exactly as given under
 * `translation`. Other entries are left untouched.
 */
export function withTranslationText(
  texts: VerseTextMap | undefined,
  translation: string,
  text: string,
): VerseTextMap {
  return { ...normalizeTextMap(texts), [translation]: text };
}

export function emptyVerseSnippetAttrs(): VerseSnippetAttrs {
  return { ref: "", translation: DEFAULT_TRANSLATION, texts: {} };
}
