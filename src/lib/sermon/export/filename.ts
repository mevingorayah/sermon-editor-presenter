/**
 * Download filename stems (slice 2 Q2 rules, UI UX decision).
 *
 * Shared by the export route (Content-Disposition) and the Frontend preview,
 * so "Will save as: …" always matches the file the server sends.
 *
 * 1. Accents are transliterated, never dropped: "Ésaïe 40" → "Esaie-40".
 *    Apostrophes and quote marks are removed: "l'Évangile" → "lEvangile".
 * 2. Any other run of characters outside [A-Za-z0-9._-] becomes one "-";
 *    "-", "." and "_" are stripped from both ends.
 * 3. One trailing export extension (.docx/.pdf/.png/.pptx, any case) is
 *    removed first, so "notes.pdf" never becomes "notes.pdf.docx".
 * 4. Max 80 characters, cut at the last "-" before the limit when possible.
 * 5. Empty result → "sermon-export".
 */

export const FILENAME_STEM_MAX = 80;
export const FILENAME_STEM_FALLBACK = "sermon-export";

/** Letters NFD does not decompose into base + combining mark. */
const SPECIAL_LETTERS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ø: "o",
  Ø: "O",
  đ: "d",
  Đ: "D",
  ł: "l",
  Ł: "L",
  þ: "th",
  Þ: "TH",
};

const EXPORT_EXT_RE = /\.(docx|pdf|png|pptx)$/i;
const APOSTROPHES_QUOTES_RE = /['‘’ʼ`´"“”«»]/g;

function transliterate(s: string): string {
  return s
    .replace(/[ßæÆœŒøØđĐłŁþÞ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function trimEnds(s: string): string {
  return s.replace(/^[-._]+|[-._]+$/g, "");
}

export function sanitizeFilenameStem(raw: string | undefined | null): string {
  let s = (raw ?? "").trim().replace(EXPORT_EXT_RE, "");
  s = transliterate(s)
    .replace(APOSTROPHES_QUOTES_RE, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-");
  s = trimEnds(s);

  if (s.length > FILENAME_STEM_MAX) {
    const cut = s.slice(0, FILENAME_STEM_MAX);
    const lastDash = cut.lastIndexOf("-");
    s = trimEnds(lastDash > 0 ? cut.slice(0, lastDash) : cut);
  }

  return s || FILENAME_STEM_FALLBACK;
}

/**
 * Append the extension to a stem. A stem that is already clean (as the
 * export route passes it) is used as-is, so a second extension is never
 * stripped: "a.pdf.docx" -> stem "a.pdf" -> "a.pdf.docx", not "a.docx".
 */
export function filenameWithExt(
  stem: string | undefined | null,
  ext: string,
): string {
  const s = stem ?? "";
  const clean =
    s.length > 0 &&
    s.length <= FILENAME_STEM_MAX &&
    /^[A-Za-z0-9._-]+$/.test(s) &&
    trimEnds(s) === s;
  return `${clean ? s : sanitizeFilenameStem(s)}.${ext}`;
}
