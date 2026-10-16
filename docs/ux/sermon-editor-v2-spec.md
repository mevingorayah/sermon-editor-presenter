# Sermon Editor v2: complete UX spec

**Product:** sermon-editor-presenter (`/edit` and `/preach`)
**Owner:** UI UX. Build: Frontend, Backend. Test: QA. Phasing: Project Manager.
**Base code:** `main` at `143c478`
**Status:** Ready for the pod to phase. Mevin gets a copy.
**Replaces/extends:** `edit-toolbar-slice-1.md`, `document-setup-save-export-slice-2.md` (their rules still hold unless this doc says otherwise)
**Credit:** The root cause in §2 and the gradient and connector notes come from Frontend's read-only investigation (`/workspace/fidelity-report.md`, Oct 2026).

---

## 0. How to read this

Each feature has the same sections: **Purpose**, **UI & interaction**, **States**, **Defaults**, **Accessibility**, **Data fields**, **Export** (DOCX / PDF / PNG / PPTX), and **Acceptance criteria** (AC). Plain-language summaries come first. Engineering detail follows.

---

## 1. Vision and principles

> **What you write is what you preach.**

The app is where a pastor writes a sermon and then carries it into the pulpit. Everything set in Edit, including colour, font, size, highlight, gradient, layout, columns and connector lines, looks the same in Preach. The only differences are that Preach is calmer and larger, and adds Bionic reading, the timer and page numbers.

Principles:
1. **Fidelity first.** One document model and one renderer for Edit, Preach and export previews.
2. **The pulpit is hostile.** No Wi-Fi, a sleeping screen, stray taps, little time. Preach has to survive all of them.
3. **Your sermons live on your PC.** Storage is local-first and free. The server does exports only. There is no AI in v2 (see the AI rule in §4.9).
4. **Scripture stays plain.** No Bionic, no gradients. The Word reads as the Word.
5. **French, Kreol and English are first-class.** Every accent and symbol works everywhere.
6. **Calm, not cluttered.** Tools appear when they're needed. Preach chrome is minimal and fades.
7. **Accessible.** WCAG 2.2 AA in the chrome, keyboard-complete, and respects reduced motion.

---

## 2. Current code gaps (grounded in `main` @ 143c478)

### 2.1 Why styles are lost in Preach (Frontend's root cause, confirmed by repro)
Frontend seeded a sermon with colour, font, highlight, italic, bold, underline, strike, alignment, a bullet list and Scripture. In Preach, the DOM had **no** inline style, `<mark>`, `<em>`, `<strong>` (except Bionic), `<u>` or `<s>`. The list was missing completely.

| # | Gap | Where |
|---|---|---|
| G1 | Preach does not use TipTap. `ReadingView` walks the JSON itself and calls `textOf(node)`, which joins text and **throws away every mark** (colour, font, highlight, bold, italic, underline, strike, code, link). | `src/components/reading/ReadingView.tsx:14-19`, used at :51, :59, :65, :72, :91 |
| G2 | `BionicText` only accepts a plain `string`, so marks can't survive even in principle. Bionic `<strong>` is the only bold left. | `src/components/reading/BionicText.tsx:6-19`, `src/lib/bionic.ts:35` |
| G3 | Lists, hard breaks and horizontal rules render as **nothing**. | `ReadingView.tsx:102-103` (`default: return null`) |
| G4 | Alignment is applied only to Scripture. Title, H1, H2 and paragraphs ignore `textAlign`. | `ReadingView.tsx:48-74` vs :80-86 |
| G5 | The extension list (the schema) is used by Edit only, so Preach has no schema and the two views drift apart. | `src/extensions/index.ts:11-45`, `SermonEditor.tsx:10,27` |
| G6 | Highlight CSS exists only in Edit. | `SermonEditor.module.css:290-291` |
| G7 | Preach uses a different body font (UI sans `--rm-font-ui`) from Edit (`--edit-font-body`, Source Serif). | `PreachShell.module.css:5`, `SermonEditor.module.css:203`, `globals.css:11` |
| G8 | Theme colour `var(--rm-fg)` on blocks. Once marks render, a user colour can become unreadable in the dark theme. | `ReadingView.module.css:34,42,51,58,93` |

### 2.2 Toolbar and colour popover faults
`src/components/editor/FormatToolbar.tsx`:
- **P1** Only **5** colours plus Default (`TEXT_COLORS`, :18-24). Mevin asked for 6 presets plus custom hex.
- **P2** No custom hex input, no validation, and no recent colours.
- **P3** The swatch palette is described as "readable on dark edit chrome", but the Edit page is cream (`--edit-bg #f4f1ea`, `globals.css:3`). Soft red `#d47870` and soft green `#6aaa7a` fail 4.5:1 contrast on cream.
- **P4** ARIA mismatch: `aria-haspopup="listbox"` with `role="option"` buttons (:288, :311, :326), but there are no arrow-key handlers, so the listbox pattern is broken for keyboard and screen-reader users.
- **P5** Focus doesn't move into the menu on open, and it closes on any outside `mousedown` (:104-111), which clashes with a hex text field.
- **P6** Colour swatches have no visible label or check mark. The active state is shown only by `swatchActive` styling, so state is carried by colour alone.
- **P7** Highlight is single-colour (`multicolor: false`, `extensions/index.ts:25-30`).
- **P8** Bold and underline have no buttons (StarterKit v3 includes the Bold and Underline marks, but they aren't exposed). There's no font-size control.
- **P9** Fonts are generic system stacks (`FONT_SANS/SERIF/MONO`, :7-15), so they differ between machines and break the "same everywhere" promise. Only Literata and Source Serif 4 are loaded (`app/layout.tsx:2-16`).
- **P10** Block buttons (Title/H1/H2/Body/Scripture, `SermonEditor.tsx:66-116`) have no `aria-pressed` state.

### 2.3 Other gaps
- **Export:** `buildCalibratedSnapshot` always sends `flattenGradient: true` and `bionic: false` (`src/lib/calibration.ts:59-60`). The export contract maps fonts to Sans/Serif/Mono only (`docs/api-export-contract.md:89`), so the new fonts, sizes and gradients don't export.
- **Bionic:** fixed at 45% (`bionic.ts:50`), with no strength control. Grapheme-aware via `Intl.Segmenter` (good), but it falls back to `Array.from`, which splits combining accents (e + U+0301) when Segmenter is missing.
- **Bionic punctuation:** `[\p{P}\p{S}]` trimming (`bionic.ts:19-20`) treats an inner apostrophe correctly, but a leading `«` with NBSP (French spacing) becomes its own token. That's acceptable, but it needs a test.
- **Storage:** the server file store (`src/lib/sermon/store.ts:19` `DATA_DIR`) is ephemeral on Cloud Run. **Mevin's decision is local-only storage** (§3.15), so `store.ts`, `/api/sermons*` and `SERMON_DATA_DIR` are deleted completely, including in dev (Backend's route-removal PR).
- **Sanitiser:** `sanitizeHtml` runs over every JSON string (`sanitize.ts:35-37`) but does not entity-encode. Text such as `<God & me>` survives as text because TipTap escapes on render. AC in §3.3 locks this down.
- **No metadata** beyond `title/createdAt/updatedAt` (`src/lib/sermon/types.ts:27-31`): no subtitle, author, place, date, status, timer, page settings or language.

---

## 3. Layout and wireframes

### 3.0 Edit

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☰ Sermons   Philippians 4 — Joy        Saved to Sermons folder  Status: In progress ▾  │
│                                          [Document ⚙] [Back up] [Preach ▶]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Title H1 H2 Body Scripture │ ↶ ↷ │ B I U │ Size 18▾ │ Font Lora ▾ │ A▾ ▮▾ ◐▾ │
│ ≡ ≡ ≡ ☰ │ Ω │ ⟋ Connect │ + Section                                           │
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ POINTS        │   ┌──────────── page 1 of 8 ────────────┐    │ NOTES         │
│ • Intro       │   │ REJOICE IN THE LORD                 │    │               │
│ ▸ I. Joy      │   │ Philippians 4:4-7                   │    │ TARGET 45:00  │
│   – a. always │   │ Mevin Gorayah · Église X · 18 oct.  │    │ EST.  ~38 min │
│ ▸ II. Peace   │   │ ┌ section ⠿ ─────────── [1|2|3] ✕ ┐ │    │ (130 wpm)     │
│ • Conclusion  │   │ │ Body text … ───────╮           │ │    │               │
│               │   │ └────────────────────│───────────┘ │    │ Per point:    │
│               │   │ ┌ section ⠿ ── [2 cols] ✕ ┐       │ │    │ I   15m       │
│               │   │ │ text │ [image]  ◄───────╯       │ │    │ II  15m       │
│               │   │ └──────┴──────────────────┘       │    │ Lang: FR ▾    │
│               │   └─────────────────────────────────────┘    │               │
└───────────────┴──────────────────────────────────────────────┴───────────────┘
```

### 3.0b Preach (single-page mode, dark theme)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◂ Edit   ▶ START  45:00 │ Bionic ──●──── │ ☰ Points │ 🔒 Locked │ Aa │ ⛶     │  ← fades after 3 s
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│         REJOICE IN THE LORD                (gradient title if set)           │
│         Philippians 4:4-7                                                    │
│                                                                              │
│         **Rej**oice **in** **th**e **Lo**rd **alw**ays …  (Bionic, user marks kept) │
│        ┃ « Réjouissez-vous toujours dans le Seigneur… »   (Scripture: plain) │
│                                         — Philippiens 4:4 LSG                │
│                                                                              │
│                                                                     8 ·      │  ← descending page no.
└──────────────────────────────────────────────────────────────────────────────┘
 Last page:                     ── END ──        [ ■ STOP ]
```

Responsive breakpoints: ≥1200 px shows three panes in Edit. 768–1199 px folds Points and Notes into drawers. <768 px gives a single column in Edit, with section columns collapsing to one (§4.10). Preach always shows one reading column, with spread mode only at ≥1200 px landscape.

---

## 4. Feature specs

### 4.1 Styling fidelity (Step A1, first item)

**Purpose.** Everything styled in Edit looks the same in Preach and in export previews.

**Design (engineering).** Based on Frontend's fix plan:
1. Split `src/extensions/index.ts` into `createSchemaExtensions()` (StarterKit, Title, Scripture, TextStyle, Color, FontFamily, FontSize, Highlight multicolor, TextAlign, Underline, Gradient, Section/Column, Image, Anchor) and `createEditorExtras()` (Placeholder, SearchAndReplace, PasteCleanup, connector tool). **Edit and Preach both use `createSchemaExtensions()`**, so they can't drift apart.
2. Preach renders through a **React node/mark renderer** (`src/lib/render/renderDoc.tsx`) driven by a mark→element map derived from the same extensions. It handles every node (lists, hardBreak, horizontalRule, image, section, column). There's no `default: return null`. An unknown node renders its children and logs a dev warning.
3. **Bionic is a layer on text leaves, applied *after* the marks.** Output looks like `<span style="color"><em><Bionic/></em></span>`. Bionic adds nothing inside text the writer has already bolded. User bold is weight 800; Bionic's maximum weight stays below it (§4.5), so user bold always reads as bold. Scripture always has Bionic off.
4. `textAlign` is applied to every TextAlign type (title, heading, paragraph, scripture), plus the new `justify` option.
5. A new `src/styles/marks.css` holds highlight, underline, gradient and connector styles with `--rm-*` light and dark tokens. A shared `--doc-font-body` token is used by both Edit and Preach.
6. **What Preach may change (the only allowed differences from Edit, as built in PR #12):** (a) one uniform size scale, keeping the same proportions between sizes; (b) dark theme: a user text colour below 4.5:1 on the background is lightened while keeping its hue, and highlights use their dark variant (the 6 presets have tuned light and dark values, §4.2); (c) Bionic only adds weight and never removes marks; Scripture stays plain. The Scripture citation is shown as a small ALL CAPS caption (`text-transform: uppercase`, not small caps), right-aligned under the quote. There is no halo or text-shadow outline anywhere, and justify is kept exactly as written. Column stacking at narrow widths (§4.10) is a layout rule that applies to Edit and Preach alike, so it is not a Preach difference. Anything else that differs between Edit and Preach is a bug.

**States.** Light or dark theme, Bionic on or off, and calibration scale −2…+2. All of them keep the marks.
**Defaults.** Preach opens with the theme last used (dark).
**Accessibility.** Semantic elements stay in place (`em`, `strong`, `u`, `mark`, `s`). Bionic bold is `aria-hidden`-neutral because the text is unchanged.
**Data.** No new fields. Content is the TipTap JSON.
**Export.** The same renderer feeds PNG/PDF previews. The DOCX/PPTX workers walk the marks (contract §5).
**AC.**
All ACs use the shared fixtures in `tests/fixtures/v2/`: `all-marks.sermon`, `accents.sermon` (the C1 sentence plus Kreol text), `v1-flat.json` (a real v1 file from `main@143c478`), `8-pages.sermon`, `4940-words.sermon`, `images.sermon`, `corrupt/*.sermon`.

- A1. Open `all-marks.sermon`. For every text run, compare Edit and Preach on `color`, `font-family`, `font-weight`, `font-style`, `text-decoration-line`, `background-color`, `text-align`, `background-image`, `text-shadow`, and the ratio of `font-size` to the body size. **Light theme:** all equal, except font-size, which differs by one uniform factor (±0.5 px), and weight added by Bionic. **Dark theme:** the same, except (a) a preset colour equals its tabled dark variant, (b) a custom colour under 4.5:1 is lightened to ≥4.5:1 with its OKLCH hue within ±5°, (c) highlights equal their dark variants. `text-shadow` is `none` everywhere. Justified paragraphs stay justified. The citation is the only element with `text-transform: uppercase` that Edit doesn't have, and it is right-aligned. Any other difference fails.
- A2. A unit test of the renderer covers every node and mark in `createSchemaExtensions()`. The test fails if an extension is added without a renderer mapping.
- A3. Bionic on at every strength plus user bold: no Bionic span or `<strong>` exists inside the user-bold run, there's no nested `<strong><strong>`, and the computed weight of user bold (800) is greater than the heaviest Bionic weight (700 at Max).
- A4. With Bionic on at every strength, Scripture blocks and the citation contain no Bionic-generated `<strong>` or weight span (DOM check), in single, spread and infinite views.
- R1. Regression: every #12 test (116 unit, 13 e2e) still passes after the renderer split, and the slice 1–2 ACs still pass.
- R2. A dark custom colour (`#1D1D6B`) on a highlight in dark Preach is lightened to ≥4.5:1 measured against the highlight underneath, not the page. Until built, this is logged as a known v2 limit and doesn't block.
- R3. User bold stays visibly heavier than Bionic bold at Light, Medium, Strong and Max (computed weight check plus visual snapshot).
- R4. A JetBrains Mono run gets Bionic like any other run, and the Bionic bold is visible (the mono font ships a bold weight).
- R5. Paste from Word and from Google Docs with colours, highlights and accents: text is NFC, allowed marks are kept, unknown styles are dropped.
- R6. A node of unknown type renders its children with no crash, in Edit and in Preach.
- R7. User marks inside Scripture (italic, colour, highlight) are kept in Edit, Preach and export; only Bionic and gradient are excluded.

### 4.2 Writing tools

**Purpose.** Normal writing tools a pastor expects: bold, italic, underline, size, colours, highlight and gradient.

**UI & interaction.** Toolbar row 1: `B I U`, Size, Font, `A▾` (text colour), `▮▾` (highlight), `◐▾` (gradient). Shortcuts: Ctrl/Cmd+B / I / U, Ctrl/Cmd+Shift+> or < to change size one step, Ctrl/Cmd+Shift+H for the last highlight colour.

- **Font size:** dropdown of 12, 14, 16, 18 (body default), 20, 24, 28, 32, 40, 48 pt, plus typing any value from 8 to 96. Stored as pt and rendered relative to the calibration scale, so Preach −2…+2 still scales everything proportionally.
- **Colour popover (`A▾`):** a dialog (`role="dialog"`, not listbox) with:
  - **6 presets** (each with light/dark-tuned values, all ≥4.5:1 on cream `#f4f1ea` and on dark `#121212` via the dark variant):

    | Name | Light (Edit/print) | Dark (Preach dark) |
    |---|---|---|
    | Ink (default) | `#1a1814` | `#f2eee6` |
    | Crimson | `#a8201a` | `#ff8a80` |
    | Royal blue | `#1d4e89` | `#8ab4f8` |
    | Forest | `#2e6b3a` | `#81c995` |
    | Gold | `#8a5a00` | `#f6c453` |
    | Purple | `#5b2a86` | `#c58af9` |

  - **Custom hex** field with `#` prefix. It accepts `#RGB` or `#RRGGBB`, normalises to `#RRGGBB` uppercase (the export contract needs `#RRGGBB`), shows a live swatch, and Apply is disabled with the inline message "Enter 3 or 6 hex digits, e.g. #A8201A" when invalid. A native colour picker is available as a secondary button.
  - **Recent:** the last 6 custom colours, saved in local preferences (not per doc).
  - **Contrast meter:** "Readable ✓ / Low contrast ⚠" against the light and dark backgrounds. It warns but doesn't block.
  - **Default** removes the colour.
  - Mapping of presets to theme variants: the mark stores `color: "#A8201A"` plus `preset: "crimson"`. Preach dark looks up the preset's dark variant. Custom colours keep the hex; in dark Preach a colour under 4.5:1 is lightened, keeping its hue (§4.1-6). No halo.
- **Highlight (`▮▾`):** 6 highlight colours (Yellow, Green, Blue, Pink, Orange, Lavender), each with light and dark variants at about 35% opacity on dark, plus None. Uses `Highlight.configure({ multicolor: true })` with `{ color, preset }`.
- **Gradient text (`◐▾`):**
  - Presets: Dawn (gold→crimson), Ocean (teal→royal blue), Glory (gold→purple), Ember (orange→red), Grace (rose→lavender), Pulpit Ink (ink→royal blue).
  - Custom two-stop: from hex, to hex, and angle 0–360° (dial plus number). It uses the same hex validation as the colour popover.
  - Stored as a **mark** `gradient { from, to, angle, preset? }`. Rendered on the **outer** span: `background-image: linear-gradient(angle, from, to); background-clip: text; -webkit-text-fill-color: transparent; box-decoration-break: clone`. Bionic children inherit the fill so the gradient doesn't restart on each fragment.
  - **Guardrails:** both stops must be ≥3:1 against the current background, otherwise the contrast meter warns. No halo or outline is added. Gradient is disabled inside Scripture (the button is greyed with the tooltip "Scripture stays plain"). Gradient plus highlight on the same run: the gradient wins and the highlight is dropped, with a toast. Find-highlight draws an outline instead of a background on gradient runs. In forced-colours or high-contrast mode, the gradient falls back to `from` as a solid colour.
  - Recommended use: titles and key phrases. Edit shows a gentle hint when a gradient covers more than 2 paragraphs.

**States.** Each button is pressed or unpressed according to the selection (`aria-pressed`). Mixed selection shows a "—" in Size.
**Defaults.** 18 pt body, Ink colour, no highlight.
**Accessibility.** Popovers trap focus, Esc closes them and returns focus to the trigger, the swatch grid uses arrow keys (`role="radiogroup"`), every swatch shows its name in a tooltip and is announced, and the active swatch shows a ✓ (not colour alone). Outside-click closes only when the hex field isn't dirty.
**Data.** Marks: `bold`, `italic`, `underline`, `strike`, `textStyle { color, preset?, fontFamily, fontSize }`, `highlight { color, preset? }`, `gradient { from, to, angle, preset? }`.
**Export.**

| | Bold/italic/underline/size/colour | Highlight | Gradient |
|---|---|---|---|
| DOCX | native run properties | native shading (nearest of 16 Word highlight colours, else `w:shd` with hex) | **fallback:** solid colour = midpoint of the stops (OKLab mix), with a note on the export dialog |
| PDF | native | native | true gradient if the renderer supports clip-text (Chromium print does), else midpoint |
| PNG | native (rasterised) | native | true gradient |
| PPTX | native | native highlight (Office 2019+) | gradient fill on runs where supported, else midpoint |

`flattenGradient` changes from a single boolean to a per-format setting: export sends `gradientMode: "native" | "midpoint"` per format (Backend contract change).
**AC.**
- W1. 6 presets plus Default are shown. A valid hex is applied and normalised to `#RRGGBB`. Invalid hex blocks Apply with the message. Recent keeps the last 6.
- W2. Trigger + Enter opens the dialog with focus on the active swatch. Arrows move between swatches and wrap. Enter applies. Tab reaches hex → Apply → Default. Esc closes and returns focus to the trigger. axe reports 0 violations. NVDA with Chrome announces "Crimson, selected".
- W3. A gradient run wrapping across 2 lines with Bionic at Max: the pixel colour sampled at each Bionic fragment boundary differs from the interpolated value by ΔE ≤ 3, and exactly one element carries `background-image`.
- W4. With the caret in Scripture, the gradient button is `aria-disabled` with the tooltip "Scripture stays plain". Pasting a gradient run into Scripture removes the gradient mark. Applying a gradient to a selection spanning Scripture leaves Scripture unmarked.
- W7. Gradient plus highlight on one run: the highlight is dropped with a toast, and neither Edit nor Preach shows a highlight on that run.
- W5. DOCX export of a gradient run produces the midpoint colour, and the export dialog shows "Gradients become solid colour in Word".
- W6. All 6 presets meet 4.5:1 in their own theme (automated check).

### 4.3 French/Kreol accents and symbols

**Purpose.** Every character Mevin types, including é è ê ë à â ç ô û ù ü ÿ œ æ, capitals É À Ç Œ, Kreol spellings, and `* ' " - _ & < >`, shows correctly in Edit, Preach, Bionic, filenames and exports.

**UI & interaction.**
- **Special characters palette (Ω):** tabs for **French** (é è ê ë à â î ï ô û ù ü ç œ æ, and their capitals), **Punctuation** (« » ‹ › “ ” ‘ ’ — – … · • † ‡ §), **Symbols** (* & < > _ # @ © ® ™ ° ± × ÷ ✝), and **Recent**. Click or Enter inserts the character at the cursor. Search by name ("cédille").
- **Smart typography (on by default, per-document toggle under Document ⚙):**
  - English: `"` gives “ ”, and `'` gives ’.
  - French: `"` gives « » with a **narrow no-break space** (U+202F) inside, and a NNBSP is inserted before `; : ! ?`.
  - Kreol: like French, but configurable.
  - `--` gives –, and `---` gives —.
  - Ctrl/Cmd+Z right after an auto-replacement undoes only the replacement, giving back the straight character.
  - Inside a link URL nothing is converted. A straight `*`, `_`, `&`, `<` or `>` is always kept literally (no Markdown auto-format on `*` or `_` unless the user enables input rules).
- Dead keys and OS input methods (AZERTY, Mac option keys, Windows US-International) must work. The editor must not intercept composition events (IME).

**Engineering rules.**
- Text is stored as NFC Unicode. Paste normalises to NFC (`PasteCleanup`).
- Bionic splits by **grapheme** (`Intl.Segmenter`). The fallback must not split combining marks: use the regex `\P{M}\p{M}*` instead of `Array.from`. The `œ` ligature counts as one grapheme.
- Bionic punctuation: leading `« ` (with NBSP or NNBSP), `“`, `(` and trailing `»`, `…`, `?!` are not bolded. Inner apostrophes (`l’Éternel`, `aujourd'hui`, Kreol `pa'n`) stay inside the word core. Hyphenated words (`peut-être`) are treated as **one word** (bold applies to the start of the whole token).
- Escaping: content is never set as raw HTML. TipTap JSON → React text nodes, and export workers XML-escape (`&amp; &lt; &gt; &quot; &apos;`). The `sanitize.ts` scrub stays (it removes scripts) but must **not** alter `<`, `>` or `&` in plain text that isn't a tag (test case below).
- Filenames: per the agreed rule (Backend #10), apostrophes and quotes including « » are dropped, other punctuation becomes `-`, and accents are kept where the OS allows.
- Fonts: all 10 fonts in §4.4 cover Latin Extended-A, so there are no fallback "tofu" glyphs.

**States.** Smart quotes on or off. Palette open or closed.
**Defaults.** Smart quotes on, style taken from the document language.
**Accessibility.** The palette is a dialog with a grid and arrow keys, and each glyph has an accessible name ("e accent aigu").
**Data.** `doc.settings.smartQuotes: boolean`, `doc.settings.language`.
**Export.** DOCX/PPTX: UTF-8 with fonts embedded or substituted (§4.4). PDF: fonts embedded with the subset including all used glyphs. PNG: rasterised.
**AC.**
- C1. Type `« L’Éternel est bon ! » — Kreol: "Bondie bon" * _ & <amen> peut-être œuvre`, save, reload, open Preach (Bionic on) and export to all 4 formats. Extract the text (DOCX `document.xml`, PPTX slide XML, PDF via `pdftotext`, PNG by manual OCR spot check). The NFC string equals the input byte for byte, including U+202F, «, », œ and ’. Each export filename follows the #10 rule.
- C2. A decomposed `e` + U+0301 is stored as NFC `é`, and Bionic never splits the accent from its letter.
- C3. `<amen>` is shown as literal text everywhere and never becomes a tag.
- C4. With language fr and smart quotes on, typing `"Amen"` gives U+00AB U+202F Amen U+202F U+00BB, and `Bon!` gives `Bon\u202F!`. One Ctrl+Z after the replacement gives the straight `"` and leaves the rest unchanged.
- C5. Windows 11 with Chrome and Edge, US-International (`'`+`e`) and French AZERTY (`é` key, `^`+`e`); macOS with Chrome, `⌥e e`. Each stores U+00E9 (NFC), with no duplicated characters after composition.
- C6. Kreol words with apostrophes (`pa'n`, `mo'nn`, `l'Éternel`) and hyphens are one Bionic token at every strength.
- C7. With `Intl.Segmenter` stubbed out, `e`+U+0301 and `œ` are never split by Bionic.
- C8. Search/replace and the point navigator treat `é` (NFC) and `é` (NFD) as the same. Search is accent-sensitive: `e` doesn't match `é`.
- C9. A title `« Bondié bon ! »` gives the #10 filename on Windows. An accented filename round-trips through the folder, the backup zip (UTF-8 flag set on zip entries) and Restore. A title made only of punctuation gives a non-empty filename ("Untitled sermon").
- C10. A per-paragraph language override is saved in the file and used for spellcheck and hyphenation of that paragraph.

### 4.4 Fonts (5 serif + 5 sans)

**Purpose.** A small, beautiful choice of free Google fonts that render the same on every machine and in exports, all supporting French accents.

**List** (all on Google Fonts under the OFL, all with `latin-ext`):

| Serif | Sans |
|---|---|
| **Lora** (doc default serif) | **Inter** (UI and default sans) |
| Merriweather | Open Sans |
| Playfair Display (titles) | Lato |
| Source Serif 4 (already loaded) | Montserrat |
| Literata (already loaded) | Nunito Sans |

Plus Mono (JetBrains Mono) kept for code and notes only, not in the main picker.

**UI.** The Font dropdown groups **Serif** and **Sans**, and each name is shown in its own face. Document ⚙ sets **document default fonts** for body and headings, and inline selection overrides them. A **Justify** option is added to the alignment group (≡ justified) with `hyphens: auto` taken from the document language. Justify is kept as written in Preach, at every width.

**Engineering.** Loaded via `next/font/google` in `app/layout.tsx` with `subsets: ["latin","latin-ext"]`, `display: "swap"` and CSS variables (`--font-lora` and so on). The stored value is the **font id** (`"lora"`) rather than a CSS stack, which fixes P9 and the export mapping. Fonts are self-hosted by next/font, so they're cached by the PWA for offline Preach (§4.12).

**Export.** The export server bundles the same 10 TTF/OTF files (Backend). PDF embeds subsets. DOCX embeds fonts (`w:embedTrueTypeFonts`) and names the family, with a fallback of Georgia or Arial. PPTX names the family, embeds where possible, and otherwise falls back to Georgia or Arial with a note. PNG is rasterised.

**AC.**
- F1. For each FontId, `document.fonts.check('16px <family>', 'éœÇŒ«»’')` is true, the canvas width of the C1 sentence differs from the Times fallback width, and visual snapshots are approved.
- F2. The PDF has the font embedded (`pdffonts` lists it).
- F3. The old values `serif`, `sans` and `mono` migrate to `source-serif-4`, `inter` and `jetbrains-mono`.
- F4. A justified paragraph with `lang="fr"` in a 300 px column: `peut-être` has no hyphen other than its own, and hyphenation points come only from the browser `fr` dictionary. In Preach the same paragraph is still justified (`text-align: justify`) at every width.

### 4.5 Bionic strength slider

**Purpose.** Mevin controls how strong the Bionic effect is.

**UI.** In the Preach toolbar: a Bionic toggle plus a slider with 5 steps, **Off · Light (30%) · Medium (45%, current behaviour) · Strong (60%) · Max (70%)**, showing a live preview. Shortcuts `[` and `]` change the step while in Preach. Edit has the same slider under Document ⚙ → Reading, so it can be set ahead of time.
**Engineering.** `bionicParts(text, ratio)`, where `n = max(1, ceil(graphemes × ratio))`. Bionic weight scales from 600 (Light) to 700 (Max). It never reaches user bold (800), and Bionic adds nothing inside user-bold text.
**States.** Off, or one of 4 strengths.
**Defaults.** Medium (45%).
**Accessibility.** `role="slider"` with `aria-valuetext="Bionic medium"`. Reduced motion has no effect, because nothing is animated.
**Data.** `doc.presentation.bionic: { enabled: boolean, strength: 0.3|0.45|0.6|0.7 }`, **saved per document** (migrated from the boolean `bionic`).
**Export.** Bionic is never exported (the contract keeps `bionic: false`).
**AC.** B1: after a step change, the Preach repaint finishes in ≤100 ms (Performance mark), and after reload `presentation.bionic.strength` in the file equals the chosen value. B2: Scripture stays plain at every strength. B3: two documents keep separate strengths.

### 4.6 Document settings and page numbers

**Purpose.** Define what a "page" is, and how Preach pages through the sermon.

**UI.** Document ⚙ dialog, Page tab:
- **Page size:** A4 (default for Mauritius), Letter, A5, Half Letter, Tablet 4:3, Screen 16:9, Screen 16:10, plus Custom (width × height mm).
- **Orientation:** Portrait or Landscape (shown with icons).
- **View:** **Single page**, **Spread** (two facing pages, ≥1200 px landscape only, otherwise it falls back to Single with a hint), or **Infinite scroll**.
- **Margins:** Narrow, Normal (default) or Wide.
- **Page numbers in Preach:** on (default) or off.

These map onto the existing calibration targets (`src/lib/calibration.ts:22-29`), which are kept for export. Page settings become the single source, and calibration reads them.

**Page numbers (Preach only).**
- Shown bottom-right, small (11 px), in a muted colour at 45% opacity, using the body font with tabular numerals. Format: `8 ·`.
- **Descending:** a sermon of N pages shows **N on the first page down to 1 on the last**, so the number tells the preacher how many pages are left. Edit always shows ascending "page 3 of 8" in the page gutter.
- The last page shows a subtle **"END" marker** in place of 1 (`1 · END`), and the STOP button sits under the final line (§4.8).
- Pagination is calculated in Preach on the current screen at the current scale. Page count changes when Calibrate, Bionic or a resize changes the layout, and the numbers recompute without jumping the reading position.
- **Infinite mode:** there are no page boxes, so it shows a thin progress counter bottom-right of the viewport, e.g. `≈ 3 pages left`, calculated as remaining scroll height ÷ viewport height (rounded up). It counts down to `END` at the bottom. The existing `ProgressBar` stays.
- **Spread:** each page of the pair has its own number (left 8, right 7).

**States.** Single, spread or infinite. Numbers on or off.
**Defaults.** A4 portrait, Single, Normal margins, numbers on.
**Accessibility.** Each page is a `region` labelled "Page 3 of 8, 6 remaining". Page numbers are `aria-hidden` (the region label carries the information). Page turns are announced politely.
**Data.** `doc.settings.page { size, widthMm?, heightMm?, orientation, view: "single"|"spread"|"infinite", margins, showPageNumbers }`.
**Export.** PDF and DOCX use the size and orientation with **ascending** print page numbers (print convention). An export option, "Use preaching countdown numbers", is off by default. PNG produces one image per page at the size. PPTX produces one slide per page with the slide size from the orientation.
**AC.**
- D1. An 8-page sermon in Preach shows 8 on page 1 and `1 · END` on page 8.
- D2. The first fully visible block before a scale change is still the first fully visible block afterwards (±1 line), and the page number equals the recomputed count minus that page's index.
- D3. In infinite mode at scroll 0%, 50% and 100%, the counter equals ceil(remaining ÷ viewport), and it shows `END` at the bottom ±2 px.
- D4. Spread falls back to Single below 1200 px.
- D5. PDF export of A5 landscape produces A5 landscape pages.

### 4.7 Title block

**Purpose.** Each sermon carries its context: what, which passage, by whom, where and when.

**UI.** A structured block at the top of page 1 (not free paragraphs):
- **Title** (required, falls back to "Untitled sermon")
- **Subtitle: Scripture passage**, e.g. "Philippiens 4:4-7". It's linked to Scripture insert (§4.12h), with a "Insert this passage" action.
- **Author** (defaults to the last used value, e.g. "Mevin Gorayah")
- **Place** (church name, with autocomplete from previous sermons)
- **Date**, with a date picker, shown in the document language format (`18 octobre 2026` / `18 October 2026`)

Each field can be styled with the normal marks (font, colour, gradient on the Title). A layout preset (Classic centred, Left editorial, Minimal) changes the arrangement. Fields left empty are hidden in Preach and export.
**Data.** `doc.meta { title, subtitle, author, place, date (ISO yyyy-mm-dd), titleLayout }`. The title node in the content is replaced by a `titleBlock` node whose attrs mirror `meta` (one source: `meta`, kept in sync).
**Migration.** An existing first `title` node becomes `meta.title`, keeping its marks in `titleBlock.content`.
**Export.** All 4 formats render the title block at the top of page 1 (PPTX: the title slide).
**Accessibility.** The title is `h1`, the subtitle is `p.subtitle`, and author, place and date are a `dl`, readable by screen readers.
**AC.**
- T1a. Each of the 5 fields saves and reloads with an equal value in the file.
- T1b. Each filled field shows in Preach.
- T1c. Each filled field is present in each of the 4 exports.
- T1d. An empty title shows and exports as "Untitled sermon".
- T2. With only the Title filled, the DOM has no empty `dt`/`dd`/`p`, and the DOCX XML has no empty paragraphs.
- T3. Date 2026-10-18: fr shows `18 octobre 2026`, en shows `18 October 2026`. mfe uses the French format until Mevin decides otherwise.

### 4.8 Preaching timer and STOP

**Purpose.** Help the preacher keep to time, without distraction.

**UI & interaction.**
- **Edit:** a "Target duration" field in Notes / Document ⚙ (mm:ss, default **45:00**, range 5:00–120:00), with the estimated length shown beside it (§4.12f).
- **Preach toolbar:** a **▶ START** icon button plus the time, in **8 pt ALL CAPS**, letter-spacing 0.08 em, tabular numerals, e.g. `45:00`. The timer stays visible even when the rest of the chrome fades (pinned top-right at 60% opacity).
- **Start** begins the countdown, one second per tick, derived from `Date.now()` against a stored start epoch, so it survives tab throttling, laptop sleep and the lock screen. Starting also turns on the wake lock (§4.12b) and the edit lock (§4.12d).
- Colours: normal is muted. At **05:00 and below** it turns **orange** (`#E8871E` dark / `#B35C00` light). **Past zero** it shows `+00:01`, `+00:02`… in **bold red** (`#FF5A4F` dark / `#C62828` light). There is no flashing. One gentle pulse at 05:00 and at 00:00 (suppressed with reduced motion).
- Pause and resume: tapping the time pauses it (shown as `PAUSED 12:34`). Long-press or a menu gives Reset.
- **STOP:** a button under the last line of the last page (and in infinite mode, at the end of the text), plus a toolbar ■ once started. STOP:
  1. stops the timer and records the actual duration,
  2. **dims all sermon text** to 25% opacity over 600 ms (instant with reduced motion),
  3. opens the **Prayer panel**: a calm centred panel with "Prayer" and the approved bullet points (§4.9), large and readable, with a Close button. If there are no approved prompts, it shows "No prayer points prepared" plus a single optional line.
  4. Writes a "preached" record (date, place, duration) to the sermon file (§4.13 library) and, if the status is Finalised, offers "Mark as Completed".
- Closing the panel restores the text. The timer stays stopped.

**States.** Idle, running, warning (≤05:00), overtime, paused, stopped.
**Defaults.** 45:00. The timer doesn't start automatically.
**Accessibility.** The timer is `role="timer"` with `aria-live="off"` while running. Announcements happen only at 5 minutes left, 0, and every 5 minutes over (polite). Colour is never the only signal: the warning adds a `⚠` glyph and overtime adds the `+` prefix and bold weight. STOP is reachable with the keyboard (S, with confirmation).
**Data.** `doc.timer { targetSec: 2700 }`, `doc.preached[] { at, place, durationSec }`. The live timer state is in memory only, kept in `sessionStorage` so it survives a refresh.
**Export.** The timer isn't exported. The target and estimate appear in the export cover notes (optional).
**AC.**
- TM1. With a fake clock (Playwright `clock.install`), target 45:00: at 40:00 elapsed it shows `⚠ 05:00` in `#E8871E` (dark) / `#B35C00` (light); at 44:59 `⚠ 00:01`; at 45:00 `00:00`; at 45:01 `+00:01` in bold `#FF5A4F` (dark) / `#C62828` (light).
- TM2. On a real Windows laptop with Chrome and Edge: start, minimise for 60 min; the value is within 1 s of a reference stopwatch. Second run: lock the screen for 5 min; after unlocking it is still within 1 s.
- TM3. STOP: the timer freezes, all `.sermon-body` elements reach opacity 0.25 within 700 ms (instant with reduced motion), the Prayer panel has focus, its list equals `prayerPrompts.items`, and a `preached[]` entry is added with durationSec within ±1 s.
- TM4. Refresh at 12:34 remaining: after reload it shows 12:34 minus the reload time, ±1 s. A paused state survives a refresh. Closing and reopening the tab does not resume (sessionStorage).
- TM6 (P-1). Laptop lid close/open, monitor sleep and the Windows lock screen during a run: the timer stays within 1 s of a reference stopwatch.
- TM7 (P-4, P-5). A clicker sending `B`, `.`, `F5` or `Esc`, and leaving fullscreen with Esc, never exits Preach, reloads, or stops or resets the timer.
- TM8 (P-6). A service worker update during Preach doesn't reload the page; the new version applies only after Preach is closed.
- TM9 (P-8). With reduced motion, the pulses at 05:00 and 00:00 and the STOP fade don't animate.
- TM10 (P-9). With a screen reader, page regions are labelled, page turns are announced politely, and the timer announces only at 5 min left, 0 and every +5 min.
- TM11 (P-10). Pressing S asks for confirmation. Tapping the STOP button stops at once but shows an "Undo" toast for 10 s that resumes the timer, removes the `preached[]` entry and restores the text.
- TM5. The timer label is 8 pt uppercase in computed style.

### 4.9 Document status and prayer prompts

**Purpose.** Track where a sermon is, and prepare prayer points once it's finalised.

**UI.**
- A status pill in the Edit header: **In progress** (default, blue-grey), **On pause** (amber), **Finalised** (green), **Completed** (muted with ✓).
- Choosing **Finalised** opens the **Prayer prompts** dialog:
  - An editable bullet list written by hand (3–7 recommended). There is no AI tab or "Suggest with AI" button.
  - **Approve** saves the final list and sets the status to Finalised. **Cancel saves nothing and puts the status back to what it was before.**
  - No version snapshot is taken until Phase E (version history) exists (§4.13).
- Editing a Finalised sermon shows a banner: "This sermon is finalised. Editing will set it back to In progress." Choosing to continue reverts the status. Prompts are kept but flagged "review".
- **Completed** is set by the STOP flow (§4.8) or by hand.

**AI rule (binding).** AI stays off. Prayer prompts are written by hand only. The AI proxy is excluded from every step and phase up to and including Phase C (the pulpit) and is not built or deployed. Turning AI on later is Mevin's decision and needs a Security review first, because sermon text would be sent to an outside company, which is a privacy concern. The options below are kept only as background for that later decision.

**AI provider options (later, only if Mevin opts in after a Security review):**

| Option | Why | Cost | Notes |
|---|---|---|---|
| **A. Gemini (2.x Flash) via Vertex AI** (recommended) | The app already runs on GCP Cloud Run, so the service account authenticates with no key to store. Good French. | Very low per sermon (fractions of a cent). There's a free tier on AI Studio, while Vertex is pay-as-you-go. | Region europe-west. Data isn't used for training under Vertex terms. |
| B. OpenAI (GPT-4o-mini class) | Strong quality, simple API | Low, pay-as-you-go | Needs an API key in Secret Manager. Data leaves GCP. |
| C. Anthropic Claude (Haiku class), direct or via Vertex Model Garden | Careful, high-quality tone | Low | Via Vertex it keeps GCP billing and auth. |

**Proxy (Backend, not in v2).** `POST /api/ai/prayer-prompts { text, language, count }` → `{ prompts: string[] }`. The server:
- holds credentials (none in the browser),
- trims input to about 12k characters,
- applies a rate limit (per IP or session, plus a global daily cap),
- applies a timeout of 20 s,
- **stores nothing and doesn't log the sermon body**,
- uses a pastoral system prompt: "short first-person-plural prayer points drawn only from this sermon; no doctrine not present in the text".

**Nothing is saved until the preacher approves.** Writing prompts works fully offline.
**Accessibility.** The status is a labelled `select` / `menu`. The dialog traps focus, and suggestions are a list with labelled buttons.
**Data.** `doc.status: "in_progress"|"on_pause"|"finalised"|"completed"`, `doc.prayerPrompts { items: string[], source: "manual"|"ai"|"mixed", approvedAt }`.
**Export.** Prayer prompts appear in an optional final "Prayer" page (PDF/DOCX/PPTX), off by default. PNG doesn't include them.
**AC.**
- S1. Choosing Finalised opens the dialog. Approve: the file has `prayerPrompts.items` equal to the list, `approvedAt` set and status `finalised`. Cancel: the file is byte-for-byte unchanged and the status equals the status before Finalised was chosen.
- S2. Prompts aren't written to the file until Approve: kill the tab after typing prompts and before Approve, reopen, and the file has no new prompts.
- S3. No AI: the dialog has no AI button, the build contains no `/api/ai/*` route, and no request leaves the browser while writing prompts (network log).
- S4. Editing a Finalised sermon shows the banner; continuing reverts it to In progress and keeps the prompts with `needsReview: true`. Choosing to keep it Finalised leaves the content unchanged.

### 4.10 Modular sections and columns

**Purpose.** Build a sermon from blocks that can be rearranged: a quote here, two columns of comparison there, an image beside text.

**UI & interaction.**
- Every top-level piece of content lives in a **section** card. On hover or focus it shows a **⠿ drag handle**, a column switcher **[1 | 2 | 3]**, a ⋯ menu (Duplicate, Move up, Move down, Background tint, Delete) and **✕ delete** (with Undo in a toast, no confirmation dialog).
- **+ Section** between sections or in the toolbar inserts a section of Text, Two columns, Three columns, Image + text, or Scripture.
- Columns hold any blocks: text, headings, Scripture, lists or images. Column widths are equal by default, and dragging the gutter gives 1:2, 2:1 and similar (snapping at thirds).
- **Images:** drag in, paste, or "Insert image". Formats JPG, PNG or WebP, at most 10 MB. They're resized client-side to a maximum of 2400 px long edge, and need alt text (prompted). Captions are optional.
- **Keyboard alternatives:** focus the handle, then Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel (announced "Section 3 of 7 moved to position 2"). Alt+Shift+↑/↓ moves the current section directly. Ctrl/Cmd+Alt+1/2/3 sets columns. Delete on a focused handle deletes.
- **In Preach:** sections can still be moved and edited **when the edit lock is off** (§4.12d). Handles appear only in unlocked mode. Text edits in Preach are saved to the same file.
- **Responsive collapse:** 3 columns become 2 below 900 px of column width, and 2 become 1 below 600 px (stacking in reading order left→right). The stored setting doesn't change. This applies identically in Edit and Preach, so it is not a Preach difference. Preach on a phone shows stacked columns.

**Data model.**
```
doc (TipTap) → section+  
section { id, columns: 1|2|3, widths?: number[], tint?: string } → column{columns}  
column { id } → block+   (paragraph, heading, list, scripture, image, hr …)
image { id, src: "assets/<sha256>.webp" | "data:…", alt, caption?, widthPct }
```
**Migration.** On load, a flat v1 doc (no `section` nodes) is wrapped into **one section with one column** containing all existing blocks. It's lossless and idempotent, and is saved as `schemaVersion: 2` on the next write.

**Image storage (local-first, no bucket).** In folder mode, images are saved to `<SermonFolder>/assets/<sha256>.<ext>` and referenced by relative path. In IndexedDB mode, or when exporting a single file, images are embedded as data URLs inside the `.sermon` file. Back up packages the assets (§4.15).

**Export.** DOCX uses tables without borders or sections for columns, with images inlined. PDF and PNG use the true layout. PPTX makes each section a slide region (columns become side-by-side text boxes). If a section is too tall for a slide, it continues on the next slide.
**Accessibility.** A section is a `group` labelled "Section 2, two columns". Drag is never the only way to do anything. Focus is kept after a move.
**AC.**
- M1a. A section can be moved by mouse drag.
- M1b. Keyboard: Space picks up, ↑/↓ move, Space drops, and "Section 3 of 7 moved to position 2" is announced.
- M1c. Alt+Shift+↑/↓ moves the current section.
- M1d. Delete removes a section and the Undo toast restores it.
- M1e. After reload, the file has the new order.
- M2. At a viewport of 375 px, a 3-column section renders as 1 stacked column in left→right DOM order; at 1440 px it's 3 again; `section.columns` in the file stays 3. Edit and Preach behave the same.
- M3. Opening `v1-flat.json` gives a DOM equal to v1 (snapshot). Opening it twice gives exactly one section. Opening without editing doesn't rewrite the file; the first edit writes `schemaVersion: 2`.
- M4. After a cold start in airplane mode, `images.sermon` opens with its images. An image over 2400 px is downscaled, a file over 10 MB is rejected with a message, and two identical images give one asset (sha256).
- M5. In Preach with the lock off, a section can be moved and the change is saved. With the lock on, handles are hidden and a drag does nothing.

### 4.11 Connector lines

**Purpose.** Draw a line from one word or line to another, e.g. linking "joie" in point I to "paix" in point II.

**UI & interaction.**
- Click **⟋ Connect**, select the source text, then select the target text. The line is drawn. Or, with text selected, right-click → "Connect to…".
- Styles (popover on the line): solid, dashed or dotted; colour (the same 6 presets and hex); width 1–4 px; ends: none, arrow at the end, or arrows at both ends; curve: straight, curved (default) or elbow. An optional short label in the middle.
- Select a line to restyle it. Delete or Backspace removes it, with Undo.
- Keyboard: with text selected, Ctrl/Cmd+Alt+L starts a connection, the next selection plus Enter completes it, and Esc cancels. All connectors are listed in a "Connectors" panel (Notes side) with Jump and Delete.

**Engineering.**
- Each end is anchored by **id**: an `anchor` mark `{ id }` on the source and target text runs (stable across edits). Connectors are stored at document level, not as text.
- Rendering uses an **SVG overlay** above the page. Positions are recomputed from the anchor DOM rects on every reflow: font scale, Bionic toggle and strength, resize, column change, section move, and the Edit↔Preach switch (ResizeObserver plus the editor `update` event, throttled with rAF).
- If an anchor's text is deleted, the connector is removed with a toast offering "Undo".
- A connector crossing pages is drawn to the page edge with a small "→ p.5" continuation marker.
- With columns collapsed, lines reroute automatically.

**States.** Creating (source picked), normal, selected, broken (removed).
**Defaults.** Curved, 2 px, Ink at 70%, arrow at the end.
**Accessibility.** The overlay is `aria-hidden`. Each connector gets a text equivalent: the anchor runs are `aria-describedby` "connected to 'paix' (point II)". The Connectors panel offers full keyboard management.
**Data.** `doc.connectors[] { id, fromAnchorId, toAnchorId, style: { line, color, width, ends, curve }, label? }`.
**Export.** PNG uses a rasterised overlay (exact). PDF draws vector paths at absolute positions computed by the renderer. **DOCX and PPTX drop connectors** for v2, with an export warning "Connector lines aren't included in Word/PowerPoint". The anchored words get a small superscript marker (¹ → ¹) so the link is still visible. Drawn shapes may come later.
**AC.**
- L1. Create, restyle and delete work, and after reload the file's `connectors[]` matches what's drawn.
- L2. Line endpoints are within 4 px of the anchor rect centres after each of: font-scale change, Bionic toggle, resize, section move, Edit↔Preach.
- L3. Deleting anchor text removes the line; after Undo, the connector and both anchor marks are back in the file.
- L4. The DOCX export shows the warning and superscript markers.

### 4.12 Designer additions in the main build

**a. Offline Preach (PWA).**
- A service worker (`next-pwa` or Workbox) precaches the app shell, the 10 fonts and the Preach route.
- Sermons are already local (§4.15), so Preach works fully offline. Export shows "Needs internet".
- An install prompt "Install for offline preaching" is shown.
- AC: after one online visit and SW install, set DevTools offline, and also do a real airplane-mode run on the laptop. Cold-start `/`, open `accents.sermon`, enter Preach, run Start for 2 min, then STOP. No network errors, fonts aren't fallback (F1 check), and Export shows "Needs internet" with no crash or data loss.

**b. Screen wake lock.**
- `navigator.wakeLock.request("screen")` while the timer runs, or whenever Preach is open (user setting, default: while the timer runs). It's re-acquired on `visibilitychange`.
- If unsupported, it shows a one-time tip ("Set your screen to never sleep").
- AC: on Windows with the screen timeout set to 2 min, the screen stays on for 30 min with the timer running and dims within 3 min of STOP. After tabbing away and back, the lock is re-acquired (sentinel `released=false`).
- AC (P-2): if the battery saver releases the wake lock, a visible "Screen may sleep" indicator appears.

**c. Page turning.**
- Next: → ↓ PageDown Space Enter. Previous: ← ↑ PageUp Shift+Space. This works with Bluetooth clickers (which send PageUp/PageDown or arrows) and foot pedals (configurable key).
- Settings → "Pedal keys" lets Mevin press his pedal to learn the key.
- Single mode turns a page, and infinite mode scrolls one screen minus 2 lines.
- AC: with a clicker that sends PageUp/PageDown and one that sends arrows, each press moves exactly one page, with no double turn. Holding a key (auto-repeat) turns one page only (one page per physical press). A pedal key learned in Settings persists after reload. With the lock off and the caret in text, Space/Enter type text and don't turn pages.

**d. Edit lock.**
- Turns on **automatically when the timer starts**, shown as 🔒 Locked in the toolbar.
- Locked: no text editing, no drag, taps don't move content, and page-turn taps still work.
- **One tap on 🔒** unlocks it for 60 s of inactivity, then it relocks while the timer runs. Manual toggle is available at any time.
- AC: after Start, a tap on text doesn't place a cursor; one tap on the lock enables editing. After unlocking, 60 s with no input relocks while the timer runs. Unlocked after STOP stays unlocked.

**e. Point navigator.**
- H1/H2 outline (extends `OutlineNav.tsx`) in Edit (left pane) and in Preach (☰ Points drawer).
- Tap to jump. The current point is highlighted. In Preach it shows a per-point time chip (see g).
- AC: tapping "II. Peace" jumps there in both modes, and the current-point highlight updates as you page through.

**f. Estimated length.**
- `words ÷ wpm`, with **default 130 wpm** (adjustable 90–180 in settings). Scripture is read slower, at 0.8 × wpm. The estimate is rounded to the nearest minute.
- Shown next to the target: `TARGET 45:00 · EST. ~38 min`. Over the target by more than 10% shows amber with "~6 min long".
- AC: `4940-words.sermon` (no Scripture) at 130 wpm shows `EST. ~38 min`. Adding 1,000 Scripture words adds 1000 ÷ (130 × 0.8) = 9.6 min, so it shows `~48 min`.

**g. Timing per point.**
- In Edit, each H1 can get a minutes allotment (default: the target split evenly by word share).
- In Preach, a small chip by the timer shows `II · +1:20 behind` (amber) or `−0:45 ahead` (muted). It's calculated from the elapsed time when the reader enters each point's region.
- AC: a point is "entered" when its heading reaches the top 25% of the viewport. With a fake clock and scripted page turns at known times, the chip shows the correct ahead/behind time within ±5 s.

**h. Scripture insert by reference.**
- In the Scripture block or the subtitle, type a reference (`Philippiens 4:4-7`, `Phil 4.4–7`, `John 3:16`), then click "Insert". The verses arrive with the citation set (`Philippiens 4:4-7 LSG`).
- Translations in Step A4: **Louis Segond 1910 (public domain)** and **KJV (public domain, UK Crown patent noted)**. Bundled as local JSON (about 4–5 MB each, lazy-loaded and cached for offline), so no API or server is needed.
- The parser accepts French and English book names and abbreviations.
- Licensed translations (ESV, NIV, BDS, Segond 21) come later and need licences.
- AC: `Phil 4:4-7` LSG inserts 4 verses offline with the correct citation.
- AC (P-7): after a cold start offline, Scripture insert works because LSG/KJV were cached on the first online visit.

**i. Document language.**
- `en` / `fr` / `mfe` (Kreol Morisien) in Document ⚙ and the status bar. It sets the `lang` attribute on the editor and Preach.
- `spellcheck=true` for en and fr (the browser dictionary), and **spellcheck off for Kreol**. It also drives hyphenation, smart quotes and the date format.
- Per-paragraph language override (⋯ → Language) for mixed sermons.
- AC: a Kreol doc shows no red squiggles, and a French doc underlines "joiee".

**Data:** `doc.settings { language, wpm, wakeLock, pedalKeys }`, `doc.points[] { headingId, minutes }`.

### 4.13 Phase E (later)

- **Version history.** Snapshots are saved as `<SermonFolder>/.history/<id>/<timestamp>.sermon`. They're taken by hand ("Save version"), and hourly while editing (keeping the last 20 automatic ones). Compare view and Restore are included.
- **Sermon library.** A home screen that indexes the sermon folder: full-text search, a **series** field ("Philippians, part 3"), **Bible book** (from the subtitle reference), status, and **where and when preached** (from the `preached[]` records written by STOP). There's a warning "Already preached at Église X on 12/05/2025".
- **Template.** "New from template": Introduction, I/II/III points, Application, Conclusion, Prayer. Templates are saved as `.sermon-template` files in the folder.
- **Multi-device sync via a synced folder.** No server. Mevin points the sermon folder at a Google Drive for desktop or OneDrive folder, and those clients sync the files. The app detects external changes (polling `lastModified` on focus). On conflict, it keeps both copies (`… (conflict from TABLET).sermon`) and shows a compare dialog. On iPad/Android, where the File System Access API isn't available, you open or import a `.sermon` file from Drive/Files and save it back (Back up / Restore flow). That's a limitation to accept.
- **Second screen / projector:** future only. A Scripture-only audience window via the Presentation API, not in v2.

**AC (Phase E).**
- E1. Hourly snapshots while editing keep exactly the last 20 automatic ones in `.history/<id>/`; manual "Save version" snapshots are not pruned.
- E2. Restore from history replaces the current content with the snapshot, and first takes a snapshot of the current state so it can be undone.
- E3. Compare view shows added and removed text between a snapshot and the current file.
- E4. The library lists every `.sermon` in the folder, and full-text search finds accented words with NFC/NFD treated as the same.
- E5. A sermon with a `preached[]` record at Église X shows "Already preached at Église X on 12 May 2025" (date in the document language).
- E6. "New from template" creates a sermon with Introduction, I/II/III, Application, Conclusion and Prayer, and a `.sermon-template` saved in the folder appears in the list.
- E7. A file changed outside the app (by the sync client) is detected when the window gets focus, and the open sermon reloads if it has no unsaved edits.
- E8. (was ST5) Editing the same file from two machines through a synced folder produces `… (conflict from <DEVICE>).sermon` and a compare dialog, never data loss.
- E9. On iPad/Android, a `.sermon` opened from Drive/Files can be edited and saved back through the Back up / Restore flow, with accents intact.

### 4.14 (reserved for numbering)

### 4.15 Storage, Back up and Restore (local-first, decided)

**Decision (Mevin, Oct 2026):** sermons live **only on Mevin's PC**. It's free, with **no Firestore and no cloud database**. The server (Cloud Run) handles only **exports** and keeps no sermon data. There is no AI proxy (§4.9 AI rule).

**First run.**
- A welcome card: "Where should your sermons live?" with **Choose folder…** (File System Access API `showDirectoryPicker`, Chrome/Edge desktop). A tip suggests "a folder inside Google Drive or OneDrive to sync between devices".
- The folder handle is kept in IndexedDB, and permission is re-requested on each launch with one click ("Allow access to *Sermons*").
- **Fallback** (Firefox, Safari, iPad, or permission denied): sermons are stored in the browser's IndexedDB with a persistent-storage request (`navigator.storage.persist()`). A banner says: "Saved in this browser only. Back up regularly."

**Files.**
- `<Folder>/<filename>.sermon` is UTF-8 JSON in the envelope from PR #14: `{ kind: "sermon-editor-presenter/sermon", schemaVersion, savedAt, sermon }`. `sermon` holds the document fields in §5.
- The filename follows the agreed sanitising rule (#10).
- `<Folder>/assets/` holds images, and `<Folder>/.history/` holds versions (Phase E).
- Writes are atomic (write a temp file, then replace) and the existing autosave controller is reused. Status shows exactly: **"Saved to Sermons folder"**, **"Saving…"**, or **"Couldn't save. Folder not found. [Choose folder]"**. "Saved" is never shown unless the file was actually written. The file format is defined in `docs/sermon-file-format.md` (PR #14), with the shared checker in `src/lib/sermon-file/`.

**Back up / Restore.**
- **Back up** (header button and Settings): makes a single `Sermons-backup-2026-10-16.zip` with all `.sermon` files, `assets/` and `.history/`, plus a `manifest.json` with app version, count and checksum. Zipping is done client-side (fflate). It's saved where the user chooses, e.g. a USB stick, Drive or OneDrive.
  - Per-sermon "Export .sermon file" embeds images as data URLs, so a single file is self-contained.
- **Restore:** pick a `.zip` or `.sermon` file and see a preview list. Sermons not on this PC are added. Identity is the sermon `id`, not the filename; the preview shows each copy's `savedAt` for information. **When a sermon in the backup has the same id as an existing one, the only choices for that sermon are "Keep both" (the default; the restored copy gets a new id and " (restored)" added to its title) or "Replace". Replace always asks first: "Replace your copy of <title>? Your current version will be lost."** There are no other restore modes. Apply is all or nothing, using the module from PR #14: if any file fails, nothing changes. The module rejects a backup that contains the same id twice. Nothing is overwritten without being listed. The manifest checksum is verified, and schema migrations run on restore.
- A reminder banner appears after 7 days with no backup, in folder and browser mode alike. It is never shown in Preach.
- The server store (`src/lib/sermon/store.ts`), `/api/sermons*` and `SERMON_DATA_DIR` are **deleted completely, including in dev**. The client uses a `SermonRepository` interface with `FolderRepository` and `IndexedDbRepository` implementations.

**Dependencies:** images (§4.10), version history, library and multi-device sync all build on this storage layer.

**Accessibility.** Pickers are native, and progress and results are announced.
**AC.**
- ST1. On first run, choosing a folder makes new sermons appear as `.sermon` files there.
- ST2. Denying permission falls back to IndexedDB with the banner.
- ST3. Back up then Restore on a clean browser gives identical sermons, including images and statuses.
- ST4. No sermon content leaves the browser except in an export request the user triggered (network log).
- ST5. (moved to Phase E as E8.)
- ST6. Back up → delete the folder and clear IndexedDB → Restore: every file matches the original as canonical JSON, including accented filenames, images, `preached[]`, prayer prompts and connectors.
- ST7. Each of `corrupt/*.sermon` (truncated JSON, wrong `format`, `schemaVersion: 3`, missing `content`, a `<script>` string, a 50 MB file, a BOM with Windows line endings) gives a clear error, the editor stays usable and the original file is untouched. v1 files upgrade.
- ST8. A manifest checksum mismatch makes Restore refuse the backup and list the affected files.
- ST9. **Hard AC (release blocker).** Open the same sermon in two tabs. The second tab shows a warning that the sermon is open in another tab. Edit in both tabs and save in each: neither tab ever quietly overwrites the other's edits. A save whose file has a newer `savedAt` on disk (`isNewerOnDisk`) is stopped and the writer is asked what to do; after both tabs save, every edit from both tabs is either in the file or still visible in the tab that was stopped. Any silent last-write-wins fails.
- ST10. Folder moved, renamed or deleted while open: the status shows "Couldn't save. Folder not found. [Choose folder]", and unsaved edits are kept in IndexedDB until a write succeeds.
- ST11. Disk full or write error: the temp write fails, the original is intact, the status never shows "Saved to Sermons folder", and retry works after space is freed.
- ST12. Permission not re-granted on relaunch: the one-click re-grant works. Declining keeps the sermons readable from the browser copy and shows a banner; the app never silently switches to IndexedDB.
- ST13. First run with sermons already in browser storage moves them into the folder with no duplicates; running the move twice is harmless.
- ST14. Two sermons with the same title get distinct filenames. Renaming a sermon renames its file, and the old file is gone.
- ST15. If `navigator.storage.persist()` is denied, a stronger warning is shown.
- ST16. An image-heavy sermon over the export request size limit shows a clear error instead of failing silently.
- ST17. After the route removal, `/api/sermons*` returns 404 in prod and dev, and the prod image has no `SERMON_DATA_DIR`.
- ST18. Restore of a backup with a sermon whose id already exists: the preview shows "Keep both" selected by default. Keep both gives two sermons, the restored one with a new id and " (restored)" in its title. Replace first shows a confirmation; Cancel there changes nothing, and confirming gives one sermon equal to the backup copy. The preview offers no other modes (no "Add missing only" or "Replace older").
- ST19. A backup that contains the same id twice is rejected and nothing changes.
- ST20. If one file fails mid-Restore, no sermon is changed (all or nothing).
- ST21. The backup reminder appears after 7 days with no backup (fake clock: not at 6 days 23 h, yes at 7 days), and never in Preach.
- ST22. Export (E-2 to E-6): exports use light colours and no Bionic even from dark Preach; accented content and filenames are kept in each format; the "Use preaching countdown numbers" option works in PDF and DOCX; the request has only the current sermon and the export server leaves no temp files or logged body; offline export shows "Needs internet" with no data loss.

### 4.16 Mevin's Edit requests (Oct 2026, Steps A1–A6)

All of these follow the Preach rule in §4.1-6: what you set in Edit shows the same in Preach, with only the allowed differences (uniform size scale, dark-theme colour lightening and dark highlights, Bionic weight only, Scripture plain). Anything else that differs is a bug. Field names are Backend's; the file changes are listed in the open note at the end of this section, and Backend writes them into §5.

#### 4.16a More text marks (Step A1)

**UI.** Toolbar row 1 becomes `B I U S x² x₂`: bold, italic, underline, strikethrough, superscript, subscript. Shortcuts: Ctrl/Cmd+B, I, U; Ctrl/Cmd+Shift+X strikethrough; Ctrl/Cmd+. superscript; Ctrl/Cmd+, subscript. Superscript and subscript can't both be on: turning one on turns the other off. Each button shows `aria-pressed`.
**Data.** Marks `italic`, `strike`, `superscript`, `subscript` (with `bold`, `underline`).
**AC.**
- MK1. Each of the 6 buttons and shortcuts toggles its mark on a selection, `aria-pressed` matches the selection, and the file stores the mark after reload.
- MK2. Applying superscript to a subscript run removes subscript, and the other way round.
- MK3. In `all-marks.sermon`, superscript and subscript runs have the same `vertical-align` and font-size ratio to the body in Edit and Preach (A1 rule), in both themes.
- MK4. Bionic doesn't split a superscript or subscript run of 3 characters or fewer (e.g. verse numbers, `1er`), and adds nothing inside user bold.

#### 4.16b Paragraph styles (Step A2)

**UI.** The block style menu (Title, H1, H2, H3, Body, Scripture) adds **Quote**, **Intense quote**, **Citation** and **Illustration**.
- **Quote:** indented, italic, with a thin left rule in a muted colour.
- **Intense quote:** larger (1.15×), centred, with a rule above and below in the accent colour.
- **Citation:** a small ALL CAPS caption, right-aligned, muted, for a source line under a quote. It's the same look as the Scripture citation.
- **Illustration:** a tinted panel (soft warm tint; dark variant in dark theme) with rounded corners and a small label "ILLUSTRATION" in the top-left. It can hold several paragraphs, lists and images. The label text can be changed per block (e.g. "STORY").
User marks (colour, highlight, font) still work inside these blocks. Quote, Intense quote and Illustration are not Scripture, so Bionic applies to them; Citation gets no Bionic, like the Scripture citation.
**Accessibility.** Quote and Intense quote are `blockquote`; Citation is `cite`; Illustration is an `aside` labelled by its label text. The tint is never the only signal: the label is always shown.
**Data.** Block types `quote`, `intenseQuote`, `citation`, `illustration` (with optional `label`).
**AC.**
- PS1. Each of the 4 styles can be applied from the menu and by keyboard, and the block type is stored in the file after reload.
- PS2. For each style, Edit and Preach match on indent, font-style, alignment, rule colour, panel background and label text (A1 rule). In dark theme the panel and rule use their dark variants and Illustration text is ≥4.5:1 measured against the panel tint (not the page), in both themes, including user colours (lightened per the dark rule if needed).
- PS3. The Illustration label shows in Edit, Preach and every export, and a screen reader announces "Illustration" (or the custom label).
- PS4. Citation blocks get no Bionic at any strength; Quote, Intense quote and Illustration get Bionic like body text.

#### 4.16c Branch boards (mind-map boxes, Step A3, after blocks)

**Purpose.** Inside a section, lay out ideas as boxes linked with lines, like a mind map.
**UI.** "+ Section → Board" or "+ block → Board" inserts a board area inside a section. In it:
- Double-click or "+ Box" adds a box. Drag a box to move it; drag its corner to resize. Type in a box to edit its text.
- Link two boxes with **⟋ Connect** (the same tool and styles as §4.11). Lines stay attached when boxes move.
- Keyboard: Tab moves between boxes; arrow keys move the focused box 8 px (Shift: 1 px); with a box focused (not while typing in it), press **L** to start a link, Tab to the target box, Enter completes, Esc cancels. No Ctrl+Alt chord is used (Ctrl+Alt is AltGr on French AZERTY), and no Win/Cmd+L lock-screen combo. Delete removes a box and its lines, with Undo.
- In Preach, boards show exactly as laid out (scaled with the page). Boxes can be moved only when the edit lock is off.
**Accessibility.** The board is a `group` labelled "Board, 5 boxes". Each box is a focusable item; its links are listed as "linked to 'Grace', 'Faith'".
**Data.** `board` nodes `{id, x, y, w, h, text}`; lines reuse `connectors`.
**Dependency.** The connector engine (§4.11 SVG overlay, anchors, styles) is built inside Step A3 for boards. Drawing lines between words in the text (the rest of §4.11) comes in Phase D.
**AC.**
- BD1. Add, move, resize, edit text and delete boxes with mouse and with keyboard only; after reload the file's `board` nodes have the same `x, y, w, h, text`.
- BD2. Linking two boxes stores a `connectors` entry; moving either box keeps the line endpoints within 4 px of the box edges.
- BD3. In Preach, box positions and sizes match Edit after the uniform size scale (ratio within ±1%), and line styles match. With the lock on, a drag does nothing.
- BD4. Deleting a box removes its lines; Undo restores both.

#### 4.16d Every block is a module (Step A3)

**UI.** Every title, H1, H2, H3, body paragraph, list, quote, illustration, Scripture and board is a block. On hover or focus each shows a **⠿ drag handle** on the left and a **+** to add a block below (opening the same menu as + Section). This works inside sections and columns.
- Edit: always available.
- Preach: available only when the edit lock is off (§4.12d); with the lock on, handles and + are hidden.
- Keyboard: focus the handle, Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel; Alt+Shift+↑/↓ moves the current block. Announced: "Paragraph moved to position 4 of 12".
**Data.** A stable `blockId` on every block, kept through edits, moves, copy within the document and save/reload.
**AC.**
- BK1. In Edit, each block type shows a handle and + on hover and focus, and + inserts a chosen block below.
- BK2. A block can be moved by drag and by keyboard, within a section, between sections and between columns, and the new order is in the file after reload.
- BK3. **Moving a block keeps its `blockId`, its connectors and its definitions.** After the move and a reload, every `connectors` entry and every `definition` mark that pointed into the block still resolves, and the lines are drawn to the new position.
- BK4. Every block in the file has a unique `blockId`; duplicating a block gives the copy a new `blockId` (and new anchor/definition ids) so nothing points at two places.
- BK5. In Preach with the lock off, handles and + work and changes are saved; with the lock on they're hidden and a drag does nothing.

#### 4.16e Define a word (Step A5: Define-1 typed meaning first, then Define-2 lexicon)

**Purpose.** Attach the meaning of a word, from the Greek or Hebrew lexicon or in your own words, so it's at hand in the pulpit.
**UI.**
- Select a word, right-click (or long-press, or the keyboard context-menu key / Shift+F10) → **Define…**. A direct shortcut is **Ctrl/Cmd+Shift+Y only if it passes DF11**; Ctrl+Shift+D is not used (it bookmarks all tabs in Chrome and Edge). Known risk: Ctrl+Shift+Y opens Downloads in Firefox on Windows/Linux, so if DF11 fails, there's no chord and the context menu is the keyboard route. A dialog has two tabs:
  - **Lexicon:** search by English/French word, transliteration or Strong's number. Results show the original word (Greek or Hebrew script), transliteration, Strong's number and a short gloss, with the source. Choose one to attach.
  - **My own meaning:** type a meaning (and optionally the original word).
- The word gets a **subtle marker**: a dotted underline in a muted colour, plus a small dot after the word. It doesn't change the word's colour, weight or highlight.
- In Edit, hover or click shows the definition card with Edit and Remove. In Preach, **tapping the word (or pressing Enter on it) shows a popover** with the original word, transliteration, Strong's number and gloss. Tap outside or Esc closes it. Tapping a defined word never turns the page.
- Definitions are saved in the sermon file, so they work offline after saving. The lexicon data is bundled with the app, so lookups work offline from the first launch with no online visit.
**Sources and licences.**
- **Primary: STEPBible data (Tyndale House), CC BY 4.0.** Used for the Greek and Hebrew lexicons and tagged original-language texts. Requires one credit line on the About screen.
- **Secondary option: Open Scriptures Strong's dictionaries, CC BY-SA.** Not public domain. Use only if STEPBible is missing an entry; it needs its own credit line, and share-alike applies to that dictionary data (any changed version of it we ship must be under CC BY-SA).
- Public-domain extras (original Strong's 1890, Thayer's, BDB) may be used where the specific edition is confirmed public domain.
**Fidelity.** Under the Preach rule: the marker looks the same in Edit and Preach (scaled), its colour follows the dark-theme rule, Bionic only adds weight to the word as usual (and nothing inside user bold), and a defined word inside Scripture keeps the marker but gets no Bionic.
**Accessibility.** The defined word is a button-like element with `aria-haspopup="dialog"` and `aria-describedby` the short gloss. The popover is a non-modal dialog; focus moves in and returns on close.
**Data.** A `definition` mark `{id}` on the word, plus a sermon-level `definitions` list of `{id, word, lemma?, strongs?, language: grc|hbo|custom, gloss, source: strongs|stepbible|user}`.
**AC.**
- DF1. Select "grace", Define → Lexicon → choose G5485: the word gets the marker, and the file has a `definition` mark and a `definitions` entry with `word`, `lemma` χάρις, `strongs` G5485, `language: grc`, a gloss and `source: stepbible`.
- DF2. Define → My own meaning stores an entry with `language: custom`, `source: user` and the typed gloss, accents intact (NFC).
- DF3. In Preach, tapping (and Enter on) the defined word shows the popover with the original word, transliteration, Strong's number and gloss; Esc and tap-outside close it; the page doesn't turn and the timer isn't affected.
- DF4. After saving, a cold start in airplane mode opens the sermon and the popover shows the full definition. The lexicon search also works offline from the very first launch, with no online visit ever made (fresh profile, network blocked before first load of the installed app).
- DF5. The marker matches between Edit and Preach under A1 (dotted underline colour follows the dark rule; no change to the word's colour, weight or highlight beyond Bionic).
- DF6. Removing the definition removes the mark and the list entry; deleting the word removes both, with Undo restoring both.
- DF7. Hebrew entries show right-to-left script correctly inside the left-to-right popover (`dir="rtl"` on the original word).
- DF8. **Credits:** the About screen shows the STEPBible credit line ("Greek and Hebrew lexicon data from STEPBible.org, Tyndale House, Cambridge, CC BY 4.0"). If any Open Scriptures Strong's data is shipped, a second credit line names it with CC BY-SA. A build check fails if lexicon data from either source is bundled without its credit line.
- DF9. Copy/paste, cut/paste, duplicate, and cut then Undo of a defined word never leave two words sharing one definition `id` and never leave an orphaned definition. A paste creates a new `id` with a copy of the entry; definitions no word points to are pruned on save (§5.2). Checked by reading the file after each action.
- DF10. Phasing: **Define-1** (typed meaning) ships first and must pass DF2, DF3, DF5, DF6, DF9. **Define-2** (lexicon lookup) follows and must pass DF1, DF4, DF7, DF8 as well.
- DF11. Shortcut check: the chosen Define shortcut does nothing else in Chrome, Edge and Firefox on Windows and macOS, and on French AZERTY. If any clash is found, no chord ships.
- UP1. **File upgrade.** Opening an older file (`v1-flat.json` and a current-release `.sermon`) gives every block a unique `blockId` and an empty `definitions` list, with every other field, mark and character unchanged (canonical JSON compare after removing the new fields). The first save writes the new `schemaVersion`. An older app opening the newer file refuses it with "This sermon was saved by a newer version of the app" and doesn't change the file.

#### 4.16f Confirmations

- **Page size and orientation apply in Preach (Step A6).** The page box in Preach single and spread view uses the document's size and orientation (§4.6), scaled to fit the screen. Infinite view keeps the page width.
  - AC PG1. With A5 landscape, each Preach page box has a width:height ratio of 210:148 (±1%); switching to A4 portrait changes it to 210:297 and repaginates.
- **In Step A1:** the 10-font list (§4.4), the 6 colour presets with custom hex (§4.2) and the 6 highlight colours (§4.2). The Step A1 row in §6 lists them.
  - AC PG2. The Step A1 build offers exactly the 10 fonts plus JetBrains Mono for code, 6 colour presets plus custom hex and Default, and 6 highlight colours plus None, in Edit, and each shows correctly in Preach (A1).

#### Open note for Backend: file-format fields needed (not in §5 yet)

> **RESOLVED in §5.2 and §5.4 (Backend).** Folded into schemaVersion 2, since v2 has not shipped yet. UI UX doesn't edit §5. These are the fields the features above need, using Backend's names:
> - Marks: `superscript`, `subscript` (with existing `italic`, `strike`), and `definition { id }`.
> - Sermon-level `definitions: { id, word, lemma?, strongs?, language: "grc"|"hbo"|"custom", gloss, source: "strongs"|"stepbible"|"user" }[]`.
> - Block types `quote`, `intenseQuote`, `citation`, `illustration` (illustration with optional `label`).
> - A stable `blockId` on every block. Moves keep it; duplicates get a new one.
> - `board` nodes `{ id, x, y, w, h, text }`; lines between boxes reuse `connectors`.
> - Upgrade step: older files get a `blockId` on every block on first open, and an empty `definitions` list.
> - Export: how each new block style, sub/superscript, boards and definition markers appear per format belongs in Backend's §5.4 table.


---

## 5. Data model, file format and export contract (Backend)

The server stores no sermons. `store.ts`, `/api/sermons*`, the #9 same-id restore and `SERMON_DATA_DIR` are deleted in every environment, dev included. The only sermon route left is `POST /api/export`, which builds the file in memory, returns it, and keeps nothing.

### 5.1 File envelope (PR #14, `docs/sermon-file-format.md`)

```ts
interface SermonFile {            // <Folder>/<name>.sermon, UTF-8 JSON
  kind: "sermon-editor-presenter/sermon";
  schemaVersion: number;          // 1 = first release, 2 = v2 fields below
  savedAt: string;                // ISO time of this write; drives isNewerOnDisk and Restore newer/older
  sermon: SermonDocument;
}
interface BackupFile {            // first release: <name>.sermon-backup, UTF-8 JSON
  kind: "sermon-editor-presenter/backup";
  schemaVersion: number; savedAt: string;
  sermons: SermonDocument[];      // all or nothing; duplicate ids rejected
}
```

The shared checker in `src/lib/sermon-file/` (browser-safe, zod only) is the only place that reads or writes these. Error codes: `TOO_LARGE`, `NOT_JSON`, `WRONG_KIND`, `NEWER_VERSION`, `INVALID`. Limits are 20 MB per sermon and 200 MB per backup.

**Backup format by phase.** The first release uses the single JSON `.sermon-backup` from #14, since there are no images yet. When images arrive in Step A3, Back up moves to the `.zip` in §4.15 (`.sermon` files, `assets/`, `manifest.json` with checksums). The `.zip` reader reuses the same checker for every file inside, and Restore still accepts `.sermon-backup` files.

### 5.2 Document fields (`sermon`, schemaVersion 2)

```ts
interface SermonDocument {
  id: string;                     // uuid; legacy local ids accepted
  title: string; updatedAt: string;
  meta: { subtitle?; author?; place?; date?; titleLayout?: "classic"|"left"|"minimal";
          createdAt; series?; bibleBook? };
  status: "in_progress"|"on_pause"|"finalised"|"completed";
  settings: { page: { size; widthMm?; heightMm?; orientation: "portrait"|"landscape";
                      view: "single"|"spread"|"infinite"; margins: "narrow"|"normal"|"wide";
                      showPageNumbers: boolean };
              language: "en"|"fr"|"mfe"; smartQuotes: boolean; wpm: number;
              defaultFonts: { body: FontId; heading: FontId }; wakeLock: "timer"|"preach" };
  presentationSettings: { theme: "light"|"dark"; typeScaleStep; lineHeight;
                          bionic: { enabled: boolean; strength: 0.3|0.45|0.6|0.7 } };
  timer: { targetSec: number };   // default 2700
  points: { headingId: string; minutes: number }[];
  prayerPrompts?: { items: string[]; source: "manual"; approvedAt: string; needsReview?: boolean };
  preached: { at: string; place?: string; durationSec: number }[];
  connectors: { id; fromAnchorId; toAnchorId; style: {...}; label? }[];
  definitions: { id: string; word: string; lemma?: string; strongs?: string;
                 language: "grc"|"hbo"|"custom"; gloss: string;
                 source: "strongs"|"stepbible"|"user" }[];   // default []
  content: TipTapJSON;            // doc, titleBlock, section+, column+, blocks
  notes: string;
}
// content details (§4.16):
//  every block node has attrs.blockId (uuid); moves keep it, duplicates get a new one
//  block types: paragraph, heading, scripture, quote, intenseQuote, citation,
//               illustration{label?}, board{boxes: {id,x,y,w,h,text}[]}, section, column, image
//  marks: bold, italic, underline, strike, superscript, subscript, link,
//         textStyle{color,fontFamily,fontSize}, highlight{color}, gradient, anchor{id},
//         definition{id}   // id points into definitions[]; lines between board boxes reuse connectors
type FontId = "lora"|"merriweather"|"playfair-display"|"source-serif-4"|"literata"
            |"inter"|"open-sans"|"lato"|"montserrat"|"nunito-sans"|"jetbrains-mono";
```

`prayerPrompts.source` is `"manual"` only while AI stays off (§7). `"ai"` and `"mixed"` are added only if Mevin turns AI on after a Security review.

**Upgrades** run in the checker's `upgradeSermon`, one step per version:
- v0 to v1 (in #14): a bare localStorage document or the old server shape.
- v1 to v2: wrap flat content into one section with one column; first `title` node to `title`/`titleBlock`; `bionic: boolean` to `{enabled, strength: 0.45}`; font stacks to FontId; `status` defaults to `in_progress`; `timer.targetSec` 2700; every block gets a `blockId`; `definitions` starts empty. A `definition` mark whose id is missing from `definitions` is dropped (the word text stays). If two words share one definition id, the checker repairs it by giving each later word its own copy with a new id; it never refuses the file for this. Definitions no word uses are removed on save. The upgrade is idempotent, and the file is only rewritten as v2 on the first real edit.

A file with a higher `schemaVersion` than the app knows is refused with "saved by a newer version of the app" and left untouched.

### 5.3 Export contract changes (`docs/api-export-contract.md`)

The request carries only the current sermon. The body is never logged and no temp files are kept. New in v2:
- FontId and `fontSize`, `underline`, multicolour `highlight{color}`, `gradient{from,to,angle}` with a per-format `gradientMode`.
- `section`, `column` and `image` nodes. Images are sent inline as data URLs in the request, since the server has no store. Oversize requests get `413` with a clear message (ST16).
- `titleBlock`, page size and orientation, `countdownPageNumbers` (PDF, DOCX), and an optional prayer prompts page.
- `bionic` is always `false`, and colours are always the light-theme values. Colours stay strict: `#RRGGBB` or `rgb(r,g,b)`.

### 5.4 Export fidelity per mark

QA tests each cell. **Kept** means it looks the same as Edit in light theme. Any other entry is the agreed fallback.

| Mark or node | DOCX | PDF | PPTX | PNG |
|---|---|---|---|---|
| Bold, italic, strike | Kept | Kept | Kept | Kept |
| Underline | Kept | Kept | Kept | Kept |
| Text colour | Kept | Kept | Kept | Kept |
| Highlight (6 presets and hex) | Kept (nearest Word highlight replaced by shading with the exact hex) | Kept | Kept | Kept |
| Font (FontId) | Font name set; embedded where licence allows, else Word substitutes | Embedded | Font name set; PowerPoint substitutes if missing | Rendered |
| Font size | Kept | Kept | Kept | Kept |
| Link | Clickable | Clickable | Clickable | Underlined colour only |
| Alignment, incl. justify | Kept | Kept | Kept | Kept |
| Lists | Native lists | Kept | Native bullets | Kept |
| Scripture block and citation | Kept; citation ALL CAPS caption | Kept; ALL CAPS | Kept; ALL CAPS | Kept; ALL CAPS |
| Gradient text | Solid `from` colour | `gradientMode` | Solid `from` colour | Kept |
| Sections and columns | Native columns | Kept | One slide per section | Kept |
| Images | Kept | Kept | Kept | Kept |
| Connector lines | Small markers (Mevin decision 5) | Kept | Small markers | Kept |
| Superscript, subscript | Kept | Kept | Kept | Kept |
| Quote, intense quote | Word Quote / Intense Quote styles | Kept | Kept | Kept |
| Citation block | Kept; ALL CAPS caption | Kept | Kept | Kept |
| Illustration block (with label) | Shaded box with label | Kept | Kept | Kept |
| Boards (boxes and lines) | Picture of the board | Kept as drawing | Native shapes and lines | Kept |
| Definition words | Footnote with the meaning | Dotted underline plus footnote | Speaker notes list the meanings | Dotted underline only |
| Bionic | Never | Never | Never | Never |
| Dark theme | Never; light colours | Never | Never | Never |

Every format keeps Kreol and French accents exactly, in the text and in the filename (#10 rule).

---

## 6. Phased plan

Order set by Mevin (Oct 2026). The **first release** (current batch, file format #14, Frontend's local save with Back up and Restore, `/api/sermons` removal; §4.15 ST criteria) ships before Step A1. Steps A1–A6 then run in this order; later phases keep their old order after A6.

| Step / phase | Scope | Frontend | Backend | QA |
|---|---|---|---|---|
| **First release** | Local-only storage, Save to folder, Back up / Restore (§4.15) | Repository layer, dialogs | File format #14, delete `/api/sermons*` | ST1–ST4, ST6–ST22 |
| **A1: Writing tools** | **Shared schema + mark-preserving renderer + Bionic layer + shared mark CSS (§4.1), first and blocks the rest**; 10 fonts and justify (§4.4); colour popover with 6 presets and custom hex, 6 highlight colours (§4.2 minus gradient); bold, italic, underline, strike, superscript, subscript (§4.16a); size; accents, smart quotes and palette (§4.3); Bionic slider (§4.5) | Renderer, toolbar, popovers, fonts, Bionic | Export contract: FontId, size, marks, highlight; bundle fonts for PDF | A1–A4, R1–R7, W1, W2, W6, MK1–MK4, PG2, C1–C10, F1–F4, B1–B3; regression of slices 1–2 |
| **A2: Text styles** | Quote, Intense quote, Citation, Illustration block (§4.16b) | Block styles, panel | Export of the new block types | PS1–PS4 |
| **A3: Blocks, sections, then boards** | First: every block a module with handle and + (§4.16d); sections, columns and images (§4.10). Then: branch boards (§4.16c) with the connector engine (§4.11 overlay, anchors, styles) | Block DnD, section nodes, overlay, boards | Export: columns, images, boards; `blockId` upgrade | BK1–BK5, M1–M5, UP1, then BD1–BD4 |
| **A4: Bible verse insert** | Scripture insert, LSG 1910 and KJV (§4.12h) | Parser, Bible data | None | §4.12h ACs incl. P-7 |
| **A5: Define** | Define-1: typed meaning; then Define-2: lexicon lookup, STEPBible primary (§4.16e) | Define dialog, marker, popover, lexicon data | Export of definition markers | DF1–DF11 (split per DF10) |
| **A6: Page size and orientation** | Document settings, page sizes, orientation in Preach, page numbers, infinite view (§4.6, §4.16f) | Pagination, page box | Export size and orientation | D1–D5, PG1 |
| **B: Document** | Title block (§4.7); document language (§4.12i) | Title block, language | Title block export, filename rule | T1–T3, §4.12i AC |
| **C: Pulpit** | Timer and STOP (§4.8); status and hand-written prayer prompts (§4.9, no AI); PWA offline, wake lock, page turning, edit lock, navigator, estimate, per-point timing (§4.12 a–g) | Preach chrome, timer, panels, SW | None (AI proxy excluded by the §4.9 AI rule) | TM1–TM11, S1–S4, offline, clicker and wake-lock device tests |
| **D: Layout extras** | Gradient text (§4.2); connector lines between words in the text (rest of §4.11, reusing the A3 engine) | Gradient, text anchors | Export: gradient modes, PDF connector paths | W3–W5, W7, L1–L4 |
| **E: Library (later)** | Version history, library, templates, sync via a synced folder (§4.13) | Library UI, history, conflict UI | None (no server), except export | E1–E9 |

The shared renderer at the start of A1 blocks everything, because every later feature renders through it.

---

## 7. Open decisions for Mevin

1. **Prayer prompts:** AI stays off and is excluded from Phases A–C. Turning it on later needs a Security review first, because sermon text would go to an outside company. v1 ships **hand-written prompts only (no AI, $0)**; the whole Finalised, approve, STOP flow works without AI and the 'Suggest with AI' button is hidden unless AI is switched on. Optional later: A Gemini API free tier through Google AI Studio (no billing, but rate-limited, and Google may use free-tier inputs to improve its products, so sermon text would not be private); B Gemini via Vertex (paid, private); C OpenAI or Claude (paid). Paid AI is opt-in with a budget cap.
2. **Default page size:** A4 (proposed) or Letter. Also, should page numbers in **printed** exports also descend? (Proposed: no, print ascends.)
3. **Bible translations beyond LSG 1910 and KJV:** is a licence for Segond 21, BDS or an English modern version worth it later?
4. **Edit lock auto-relock** after 60 s while the timer runs: keep it, or stay unlocked until tapped again?
5. **Connector lines in Word/PowerPoint:** accept the "dropped with markers" fallback for v2?
6. **Synced folder:** which one will you use, Google Drive for desktop or OneDrive? This lets us test conflicts on your real setup, and tells us whether the iPad workflow (open/save `.sermon` files) is acceptable.
