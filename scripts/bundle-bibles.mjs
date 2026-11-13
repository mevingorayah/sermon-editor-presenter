#!/usr/bin/env node
/**
 * Build public/bibles/{lsg|web}/{BOOK}.json from eBible.org VPL sources.
 *
 * Usage:
 *   node scripts/bundle-bibles.mjs --src /tmp/bibles/src
 *   node scripts/bundle-bibles.mjs --download
 *
 * Only the 66 Protestant canon books are written. WEB's deuterocanon in the
 * upstream package is skipped on purpose. Text is copied from VPL verbatim
 * after trimming trailing/leading whitespace; no other normalisation.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "bibles");

/** VPL 3-letter ids → USFM book ids used for filenames. */
export const VPL_TO_USFM = {
  GEN: "GEN", EXO: "EXO", LEV: "LEV", NUM: "NUM", DEU: "DEU", JOS: "JOS", JDG: "JDG", RUT: "RUT",
  "1SA": "1SA", "2SA": "2SA", "1KI": "1KI", "2KI": "2KI", "1CH": "1CH", "2CH": "2CH", EZR: "EZR", NEH: "NEH",
  EST: "EST", JOB: "JOB", PSA: "PSA", PRO: "PRO", ECC: "ECC", SOL: "SNG", ISA: "ISA", JER: "JER",
  LAM: "LAM", EZE: "EZK", DAN: "DAN", HOS: "HOS", JOE: "JOL", AMO: "AMO", OBA: "OBA", JON: "JON",
  MIC: "MIC", NAH: "NAM", HAB: "HAB", ZEP: "ZEP", HAG: "HAG", ZEC: "ZEC", MAL: "MAL",
  MAT: "MAT", MAR: "MRK", LUK: "LUK", JOH: "JHN", ACT: "ACT", ROM: "ROM", "1CO": "1CO", "2CO": "2CO",
  GAL: "GAL", EPH: "EPH", PHI: "PHP", COL: "COL", "1TH": "1TH", "2TH": "2TH", "1TI": "1TI", "2TI": "2TI",
  TIT: "TIT", PHM: "PHM", HEB: "HEB", JAM: "JAS", "1PE": "1PE", "2PE": "2PE", "1JO": "1JN", "2JO": "2JN",
  "3JO": "3JN", JUD: "JUD", REV: "REV",
};

const CANON = [...new Set(Object.values(VPL_TO_USFM))];

const SOURCES = {
  lsg: {
    id: "fraLSG",
    name: "Louis Segond 1910",
    language: "fr",
    detailsUrl: "https://ebible.org/details.php?id=fraLSG",
    usfmUrl: "https://ebible.org/Scriptures/fraLSG_usfm.zip",
    vplUrl: "https://ebible.org/Scriptures/fraLSG_vpl.zip",
    vplName: "fraLSG_vpl.txt",
  },
  web: {
    id: "eng-web",
    name: "World English Bible Classic (2020 stable text)",
    language: "en",
    detailsUrl: "https://ebible.org/scriptures/details.php?id=eng-web",
    usfmUrl: "https://ebible.org/Scriptures/eng-web_usfm.zip",
    vplUrl: "https://ebible.org/Scriptures/eng-web_vpl.zip",
    vplName: "eng-web_vpl.txt",
  },
};

function parseVpl(text) {
  /** @type {Record<string, Record<string, Record<string, string>>>} */
  const books = {};
  /** @type {Record<string, number>} */
  const skipped = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const space = line.indexOf(" ");
    const space2 = line.indexOf(" ", space + 1);
    if (space < 0 || space2 < 0) continue;
    const vplBook = line.slice(0, space);
    const chv = line.slice(space + 1, space2);
    const verseText = line.slice(space2 + 1).trim();
    const colon = chv.indexOf(":");
    if (colon < 0) continue;
    const chapter = chv.slice(0, colon);
    const verse = chv.slice(colon + 1);
    const book = VPL_TO_USFM[vplBook];
    if (!book) {
      skipped[vplBook] = (skipped[vplBook] ?? 0) + 1;
      continue;
    }
    (books[book] ??= {})[chapter] ??= {};
    books[book][chapter][verse] = verseText;
  }
  return { books, skipped };
}

function countVerses(books) {
  /** @type {Record<string, number>} */
  const perBook = {};
  let total = 0;
  for (const book of CANON) {
    const n = Object.values(books[book] ?? {}).reduce((s, ch) => s + Object.keys(ch).length, 0);
    perBook[book] = n;
    total += n;
  }
  return { perBook, total, books: Object.keys(books).length };
}

async function sha256(file) {
  const buf = await readFile(file);
  return createHash("sha256").update(buf).digest("hex");
}

function findVpl(srcDir, fileName) {
  const direct = path.join(srcDir, fileName);
  if (existsSync(direct)) return direct;
  // unzipped folder, e.g. fraLSG_vpl/fraLSG_vpl.txt
  const nested = path.join(srcDir, fileName.replace(/\.txt$/, ""), fileName);
  if (existsSync(nested)) return nested;
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf("--src");
  const srcDir = srcIdx >= 0 ? args[srcIdx + 1] : path.join(ROOT, ".bible-src");
  const manifest = {
    generated: new Date().toISOString(),
    note: "66 Protestant canon books only. Text is verbatim from eBible VPL (whitespace trimmed).",
    translations: {},
  };

  for (const [key, src] of Object.entries(SOURCES)) {
    const vplPath = findVpl(srcDir, src.vplName);
    if (!vplPath) {
      throw new Error(`Missing ${src.vplName} under ${srcDir}. Pass --src to the unzipped eBible VPL folder.`);
    }
    const text = await readFile(vplPath, "utf8");
    const { books, skipped } = parseVpl(text);
    const counts = countVerses(books);
    if (counts.books !== 66) throw new Error(`${key}: expected 66 books, got ${counts.books}`);
    const dest = path.join(OUT, key);
    await mkdir(dest, { recursive: true });
    for (const book of CANON) {
      await writeFile(path.join(dest, `${book}.json`), JSON.stringify(books[book] ?? {}));
    }
    const zipName = path.basename(src.vplUrl);
    const zipPath = path.join(srcDir, zipName);
    manifest.translations[key] = {
      ...src,
      books: 66,
      verses: counts.total,
      versesPerBook: counts.perBook,
      skippedDeuterocanonVerses: skipped,
      vplSha256: existsSync(zipPath) ? await sha256(zipPath) : null,
    };
    console.log(`${key}: ${counts.books} books, ${counts.total} verses, skipped`, skipped);
  }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
