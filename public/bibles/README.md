# Bundled Bibles (public domain)

Offline copies of two public-domain Bible translations, split per book so the
client can lazy-load only the book it needs:

- `lsg/` — Louis Segond 1910 (French)
- `web/` — World English Bible, Classic / 2020 stable text (American English)

Each `{BOOK}.json` is `{ "chapter": { "verse": "text" } }` with USFM book ids
(GEN, EXO, … JHN, … REV). Only the 66 Protestant canon books are included.

## Source

Both distributions come from [eBible.org](https://ebible.org/), which publishes
USFM and verse-per-line (VPL) packages of the same text.

| Translation | eBible id | Details | USFM | VPL | Source files dated |
| --- | --- | --- | --- | --- | --- |
| Louis Segond 1910 | `fraLSG` | https://ebible.org/details.php?id=fraLSG | https://ebible.org/Scriptures/fraLSG_usfm.zip | https://ebible.org/Scriptures/fraLSG_vpl.zip | 30 Oct 2026 |
| World English Bible Classic | `eng-web` | https://ebible.org/scriptures/details.php?id=eng-web | https://ebible.org/Scriptures/eng-web_usfm.zip | https://ebible.org/Scriptures/eng-web_vpl.zip | 13 Nov 2026 |

SHA-256 of the VPL zips used to build this tree:

- `fraLSG_vpl.zip` — `fcdeac5aa1ebf857835a41bfa11f8fe5685c31ea602418a2998d4c870488f54b`
- `eng-web_vpl.zip` — `3d3c2f4da95c2ed6e5e4dba54a46ab2875ca82c6e076d95d34372654540033c7`

The matching USFM zips (`fraLSG_usfm.zip` dated 30 Oct 2026,
`eng-web_usfm.zip` dated 13 Nov 2026) were used only to spot-check verses, not
as the stored text.

To rebuild: place the unzipped VPL trees (or the `.zip` files plus extracted
`*_vpl/*.txt`) in a folder and run:

```
node scripts/bundle-bibles.mjs --src /path/to/ebible-src
```

## How the text is stored

Verse text is taken **verbatim from the official eBible VPL files**. The only
change is trimming leading and trailing whitespace. Accents, punctuation, and
typographic quotes/apostrophes are not normalised. USFM markup, footnotes,
cross-references, Strong’s tags, and words-of-Jesus markers are already absent
from VPL (they are present in the USFM sources).

Known, checked differences versus raw USFM (not bugs in the bundle):

- VPL includes psalm inscriptions (USFM `\d`, e.g. “A Psalm by David.”) at the
  start of verse 1, which is also how eBible presents those verses on the
  translation’s details page.
- LSG USFM sometimes trails a verse with a cross-reference heading such as
  “V. 2-5: cf. …”. VPL correctly omits those headings; they are markup, not
  verse text.

The `eng-web` package also contains deuterocanonical books. Those are **not**
written into `web/`.

## Verse counts versus 31,102

31,102 is the usual Protestant (KJV-style) total. These editions differ
because of versification, not because verses were dropped or invented:

- **WEB (66 books): 31,103 verses** (+1). Book-level differences versus LSG
  are listed below; WEB follows English/KJV-like numbering in most places
  (e.g. 3 John has 14 verses, 2 Corinthians 13 has 14, Acts 19 has 41).
- **LSG (66 books): 31,170 verses** (+68). Most of the extra 66 verses are
  in the Psalms: French/Hebrew numbering treats the inscription as verse 1
  (and sometimes 1–2), so 62 psalms have more verses than WEB. Other
  well-known shifts include 1 Samuel 20:43, 1 Kings 22:54, Job 38–41
  (chapter break differs), Isaiah 8:23 / 9:1, Mark 9:51 and 10:53, Acts
  19:40 (no v. 41), Romans 14/16 doxology placement, 2 Corinthians 13:13
  (no v. 14), 3 John 15, and Revelation 12:18.

See `manifest.json` for the per-book counts used by the automated test.
