/**
 * Protestant canon (66 books) and the French / English names + abbreviations
 * accepted by parseReference.
 */
export const CANON_BOOKS = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT",
  "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH",
  "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER",
  "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON",
  "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL",
  "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO",
  "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI",
  "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN",
  "3JN", "JUD", "REV",
] as const;

export type BookId = (typeof CANON_BOOKS)[number];
export type RefLanguage = "en" | "fr";

export interface BookNames {
  id: BookId;
  en: string;
  fr: string;
  /** Folded aliases (lowercase, accents stripped). Longer aliases are tried first. */
  aliases: readonly string[];
}

/** Display names plus aliases. Numbered books include "1 john", "1jn", "1 jn", "i john", etc. */
export const BOOKS: readonly BookNames[] = [
  { id: "GEN", en: "Genesis", fr: "Genèse", aliases: ["genese", "genesis", "gen", "gn", "ge"] },
  { id: "EXO", en: "Exodus", fr: "Exode", aliases: ["exodus", "exode", "exod", "exo", "ex"] },
  { id: "LEV", en: "Leviticus", fr: "Lévitique", aliases: ["levitique", "leviticus", "lev", "lv"] },
  { id: "NUM", en: "Numbers", fr: "Nombres", aliases: ["nombres", "numbers", "numb", "num", "nm", "nb"] },
  { id: "DEU", en: "Deuteronomy", fr: "Deutéronome", aliases: ["deuteronomy", "deuteronomio", "deuteronome", "deut", "deu", "dt"] },
  { id: "JOS", en: "Joshua", fr: "Josué", aliases: ["joshua", "josue", "josh", "jos"] },
  { id: "JDG", en: "Judges", fr: "Juges", aliases: ["judges", "juges", "judg", "jdg", "jg"] },
  { id: "RUT", en: "Ruth", fr: "Ruth", aliases: ["ruth", "rut", "rt", "ru"] },
  { id: "1SA", en: "1 Samuel", fr: "1 Samuel", aliases: ["1 samuel", "1samuel", "1 sam", "1sam", "1 sa", "1sa", "1 s", "i samuel", "i sam", "i sa"] },
  { id: "2SA", en: "2 Samuel", fr: "2 Samuel", aliases: ["2 samuel", "2samuel", "2 sam", "2sam", "2 sa", "2sa", "2 s", "ii samuel", "ii sam", "ii sa"] },
  { id: "1KI", en: "1 Kings", fr: "1 Rois", aliases: ["1 kings", "1kings", "1 kgs", "1kgs", "1 ki", "1ki", "1 rois", "1rois", "1 r", "i kings", "i rois", "i kgs"] },
  { id: "2KI", en: "2 Kings", fr: "2 Rois", aliases: ["2 kings", "2kings", "2 kgs", "2kgs", "2 ki", "2ki", "2 rois", "2rois", "2 r", "ii kings", "ii rois", "ii kgs"] },
  { id: "1CH", en: "1 Chronicles", fr: "1 Chroniques", aliases: ["1 chronicles", "1chronicles", "1 chroniques", "1chroniques", "1 chr", "1chr", "1 ch", "1ch", "i chronicles", "i chroniques"] },
  { id: "2CH", en: "2 Chronicles", fr: "2 Chroniques", aliases: ["2 chronicles", "2chronicles", "2 chroniques", "2chroniques", "2 chr", "2chr", "2 ch", "2ch", "ii chronicles", "ii chroniques"] },
  { id: "EZR", en: "Ezra", fr: "Esdras", aliases: ["esdras", "ezra", "esd", "ezr"] },
  { id: "NEH", en: "Nehemiah", fr: "Néhémie", aliases: ["nehemiah", "nehemie", "neh", "ne"] },
  { id: "EST", en: "Esther", fr: "Esther", aliases: ["esther", "est"] },
  { id: "JOB", en: "Job", fr: "Job", aliases: ["job", "jb"] },
  { id: "PSA", en: "Psalm", fr: "Psaume", aliases: ["psaumes", "psaume", "psalms", "psalm", "psa", "ps"] },
  { id: "PRO", en: "Proverbs", fr: "Proverbes", aliases: ["proverbes", "proverbs", "prov", "pro", "prv", "pr"] },
  { id: "ECC", en: "Ecclesiastes", fr: "Ecclésiaste", aliases: ["ecclesiaste", "ecclesiastes", "qoheleth", "qoelet", "eccl", "ecc", "ec"] },
  { id: "SNG", en: "Song of Songs", fr: "Cantique des Cantiques", aliases: ["cantique des cantiques", "cantique des cantique", "song of solomon", "song of songs", "song of sol", "cantiques", "cantique", "canticles", "songs", "song", "sol", "sng", "ss", "ct"] },
  { id: "ISA", en: "Isaiah", fr: "Ésaïe", aliases: ["isaiah", "esaie", "isa", "is", "es"] },
  { id: "JER", en: "Jeremiah", fr: "Jérémie", aliases: ["jeremiah", "jeremie", "jer", "jr"] },
  { id: "LAM", en: "Lamentations", fr: "Lamentations", aliases: ["lamentations", "lamentation", "lam", "lm"] },
  { id: "EZK", en: "Ezekiel", fr: "Ézéchiel", aliases: ["ezekiel", "ezechiel", "ezek", "ezk", "eze", "ez"] },
  { id: "DAN", en: "Daniel", fr: "Daniel", aliases: ["daniel", "dan", "dn", "da"] },
  { id: "HOS", en: "Hosea", fr: "Osée", aliases: ["hosea", "osee", "hos", "os"] },
  { id: "JOL", en: "Joel", fr: "Joël", aliases: ["joel", "jol", "jl"] },
  { id: "AMO", en: "Amos", fr: "Amos", aliases: ["amos", "amo", "am"] },
  { id: "OBA", en: "Obadiah", fr: "Abdias", aliases: ["obadiah", "abdias", "obad", "oba", "ob", "ab"] },
  { id: "JON", en: "Jonah", fr: "Jonas", aliases: ["jonah", "jonas", "jon"] },
  { id: "MIC", en: "Micah", fr: "Michée", aliases: ["micah", "michee", "mic", "mi"] },
  { id: "NAM", en: "Nahum", fr: "Nahum", aliases: ["nahum", "nahm", "nam", "na"] },
  { id: "HAB", en: "Habakkuk", fr: "Habacuc", aliases: ["habakkuk", "habacuc", "hab"] },
  { id: "ZEP", en: "Zephaniah", fr: "Sophonie", aliases: ["zephaniah", "sophonie", "zeph", "zep", "soph"] },
  { id: "HAG", en: "Haggai", fr: "Aggée", aliases: ["haggai", "aggee", "hag", "ag"] },
  { id: "ZEC", en: "Zechariah", fr: "Zacharie", aliases: ["zechariah", "zacharie", "zech", "zec", "za"] },
  { id: "MAL", en: "Malachi", fr: "Malachie", aliases: ["malachi", "malachie", "mal", "ml"] },
  { id: "MAT", en: "Matthew", fr: "Matthieu", aliases: ["matthew", "matthieu", "matt", "mat", "mt"] },
  { id: "MRK", en: "Mark", fr: "Marc", aliases: ["mark", "marc", "mrk", "mar", "mk", "mc", "mr"] },
  { id: "LUK", en: "Luke", fr: "Luc", aliases: ["luke", "luc", "luk", "lk", "lc", "lu"] },
  { id: "JHN", en: "John", fr: "Jean", aliases: ["john", "jean", "jhn", "joh", "jn"] },
  { id: "ACT", en: "Acts", fr: "Actes", aliases: ["actes des apotres", "acts of the apostles", "actes", "acts", "act", "ac"] },
  { id: "ROM", en: "Romans", fr: "Romains", aliases: ["romains", "romans", "rom", "ro", "rm"] },
  { id: "1CO", en: "1 Corinthians", fr: "1 Corinthiens", aliases: ["1 corinthians", "1corinthians", "1 corinthiens", "1corinthiens", "1 cor", "1cor", "1 co", "1co", "i corinthians", "i corinthiens", "i cor", "i co"] },
  { id: "2CO", en: "2 Corinthians", fr: "2 Corinthiens", aliases: ["2 corinthians", "2corinthians", "2 corinthiens", "2corinthiens", "2 cor", "2cor", "2 co", "2co", "ii corinthians", "ii corinthiens", "ii cor", "ii co"] },
  { id: "GAL", en: "Galatians", fr: "Galates", aliases: ["galatians", "galates", "gal", "ga"] },
  { id: "EPH", en: "Ephesians", fr: "Éphésiens", aliases: ["ephesians", "ephesiens", "eph", "ep"] },
  { id: "PHP", en: "Philippians", fr: "Philippiens", aliases: ["philippians", "philippiens", "phil", "php", "ph"] },
  { id: "COL", en: "Colossians", fr: "Colossiens", aliases: ["colossians", "colossiens", "col"] },
  { id: "1TH", en: "1 Thessalonians", fr: "1 Thessaloniciens", aliases: ["1 thessalonians", "1thessalonians", "1 thessaloniciens", "1thessaloniciens", "1 thess", "1thess", "1 thes", "1thes", "1 th", "1th", "i thessalonians", "i thessaloniciens", "i th"] },
  { id: "2TH", en: "2 Thessalonians", fr: "2 Thessaloniciens", aliases: ["2 thessalonians", "2thessalonians", "2 thessaloniciens", "2thessaloniciens", "2 thess", "2thess", "2 thes", "2thes", "2 th", "2th", "ii thessalonians", "ii thessaloniciens", "ii th"] },
  { id: "1TI", en: "1 Timothy", fr: "1 Timothée", aliases: ["1 timothy", "1timothy", "1 timothee", "1timothee", "1 tim", "1tim", "1 ti", "1ti", "1 tm", "1tm", "i timothy", "i timothee", "i tim"] },
  { id: "2TI", en: "2 Timothy", fr: "2 Timothée", aliases: ["2 timothy", "2timothy", "2 timothee", "2timothee", "2 tim", "2tim", "2 ti", "2ti", "2 tm", "2tm", "ii timothy", "ii timothee", "ii tim"] },
  { id: "TIT", en: "Titus", fr: "Tite", aliases: ["titus", "tite", "tit", "tt"] },
  { id: "PHM", en: "Philemon", fr: "Philémon", aliases: ["philemon", "phlm", "phm"] },
  { id: "HEB", en: "Hebrews", fr: "Hébreux", aliases: ["hebrews", "hebreux", "heb", "he"] },
  { id: "JAS", en: "James", fr: "Jacques", aliases: ["james", "jacques", "jas", "jam", "jc", "ja"] },
  { id: "1PE", en: "1 Peter", fr: "1 Pierre", aliases: ["1 peter", "1peter", "1 pierre", "1pierre", "1 pet", "1pet", "1 pe", "1pe", "1 pi", "1pi", "1 p", "i peter", "i pierre"] },
  { id: "2PE", en: "2 Peter", fr: "2 Pierre", aliases: ["2 peter", "2peter", "2 pierre", "2pierre", "2 pet", "2pet", "2 pe", "2pe", "2 pi", "2pi", "2 p", "ii peter", "ii pierre"] },
  { id: "1JN", en: "1 John", fr: "1 Jean", aliases: ["1 john", "1john", "1 jean", "1jean", "1 jhn", "1jhn", "1 jn", "1jn", "1 joh", "i john", "i jean"] },
  { id: "2JN", en: "2 John", fr: "2 Jean", aliases: ["2 john", "2john", "2 jean", "2jean", "2 jhn", "2jhn", "2 jn", "2jn", "ii john", "ii jean"] },
  { id: "3JN", en: "3 John", fr: "3 Jean", aliases: ["3 john", "3john", "3 jean", "3jean", "3 jhn", "3jhn", "3 jn", "3jn", "iii john", "iii jean"] },
  { id: "JUD", en: "Jude", fr: "Jude", aliases: ["jude", "jud"] },
  { id: "REV", en: "Revelation", fr: "Apocalypse", aliases: ["revelation", "revelations", "apocalypse", "apoc", "rev", "ap"] },
];

export const BOOK_BY_ID: Readonly<Record<BookId, BookNames>> = Object.fromEntries(
  BOOKS.map((b) => [b.id, b]),
) as Record<BookId, BookNames>;

/** Aliases sorted longest-first so "1 corinthiens" wins over "1 co" and "jean" does not steal "1 jean". */
export const ALIASES_BY_LENGTH: readonly { alias: string; id: BookId }[] = BOOKS
  .flatMap((b) => b.aliases.map((alias) => ({ alias, id: b.id })))
  .sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));

/** Lowercase and strip combining marks so "Éphésiens" and "Ephesiens" match. */
export function foldBookKey(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
