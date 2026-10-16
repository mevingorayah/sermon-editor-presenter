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
3. **Your sermons live on your PC.** Storage is local-first and free. The server is used only for exports and the AI prayer-prompt proxy (§3.15).
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
- **Storage:** the server file store (`src/lib/sermon/store.ts:19` `DATA_DIR`) is ephemeral on Cloud Run. **Mevin's decision is local-only storage** (§3.15), so this store stays only as a dev/test fixture.
- **Sanitiser:** `sanitizeHtml` runs over every JSON string (`sanitize.ts:35-37`) but does not entity-encode. Text such as `<God & me>` survives as text because TipTap escapes on render. AC in §3.3 locks this down.
- **No metadata** beyond `title/createdAt/updatedAt` (`src/lib/sermon/types.ts:27-31`): no subtitle, author, place, date, status, timer, page settings or language.

---

## 3. Layout and wireframes

### 3.0 Edit

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ☰ Sermons   Philippians 4 — Joy        ● Saved to PC   Status: In progress ▾  │
│                                          [Document ⚙] [Back up] [Preach ▶]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Title H1 H2 Body Scripture │ ↶ ↷ │ B I U │ Size 18▾ │ Font Lora ▾ │ A▾ ▮▾ ◐▾ │
│ ≡ ≡ ≡ ☰ │ Ω │ ⟋ Connect │ + Section                                           │
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ POINTS        │   ┌──────────── page 1 of 8 ────────────┐    │ NOTES         │
│ • Intro       │   │ REJOICE IN THE LORD                 │    │               │
│ ▸ I. Joy      │   │ Philippians 4:4-7                   │    │ TARGET 45:00  │
│   – a. always │   │ Mevin Gorayah · Église X · 18/10/26 │    │ EST.  ~38 min │
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

### 4.1 Styling fidelity (Phase A, item 1)

**Purpose.** Everything styled in Edit looks the same in Preach and in export previews.

**Design (engineering).** Based on Frontend's fix plan:
1. Split `src/extensions/index.ts` into `createSchemaExtensions()` (StarterKit, Title, Scripture, TextStyle, Color, FontFamily, FontSize, Highlight multicolor, TextAlign, Underline, Gradient, Section/Column, Image, Anchor) and `createEditorExtras()` (Placeholder, SearchAndReplace, PasteCleanup, connector tool). **Edit and Preach both use `createSchemaExtensions()`**, so they can't drift apart.
2. Preach renders through a **React node/mark renderer** (`src/lib/render/renderDoc.tsx`) driven by a mark→element map derived from the same extensions. It handles every node (lists, hardBreak, horizontalRule, image, section, column). There's no `default: return null`. An unknown node renders its children and logs a dev warning.
3. **Bionic is a layer on text leaves, applied *after* the marks.** Output looks like `<span style="color"><em><Bionic/></em></span>`. When the run already carries user bold, Bionic uses weight contrast (800 vs 600) instead of a nested `<strong>`. Scripture always has Bionic off.
4. `textAlign` is applied to every TextAlign type (title, heading, paragraph, scripture), plus the new `justify` option.
5. A new `src/styles/marks.css` holds highlight, underline, gradient and connector styles with `--rm-*` light and dark tokens. A shared `--doc-font-body` token is used by both Edit and Preach.
6. **Contrast policy in Preach dark theme:** the user's colour is kept. The 6 presets have tuned light and dark variants (§4.2). Custom hex below 3:1 against the current background gets an automatic outline (`text-shadow` halo) and a warning dot in Edit. The colour is never silently replaced.

**States.** Light or dark theme, Bionic on or off, and calibration scale −2…+2. All of them keep the marks.
**Defaults.** Preach opens with the theme last used (dark).
**Accessibility.** Semantic elements stay in place (`em`, `strong`, `u`, `mark`, `s`). Bionic bold is `aria-hidden`-neutral because the text is unchanged.
**Data.** No new fields. Content is the TipTap JSON.
**Export.** The same renderer feeds PNG/PDF previews. The DOCX/PPTX workers walk the marks (contract §5).
**AC.**
- A1. A seeded doc with every mark and node type (colour, font, size, highlight in 4 colours, bold, italic, underline, strike, link, gradient, list, ordered list, hardBreak, HR, all alignments, Scripture with italic) shows **identical computed style** in Edit and Preach, in both themes. Bionic is the only difference.
- A2. A unit test of the renderer covers every node and mark in `createSchemaExtensions()`. The test fails if an extension is added without a renderer mapping.
- A3. Bionic on plus user bold: the user bold is still visible (weight 800 vs 600), and no nested `<strong><strong>`.
- A4. A Scripture block never shows Bionic splitting.

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
  - Mapping of presets to theme variants: the mark stores `color: "#A8201A"` plus `preset: "crimson"`. Preach dark looks up the preset's dark variant. Custom colours keep the hex and use the halo rule (§4.1-6).
- **Highlight (`▮▾`):** 6 highlight colours (Yellow, Green, Blue, Pink, Orange, Lavender), each with light and dark variants at about 35% opacity on dark, plus None. Uses `Highlight.configure({ multicolor: true })` with `{ color, preset }`.
- **Gradient text (`◐▾`):**
  - Presets: Dawn (gold→crimson), Ocean (teal→royal blue), Glory (gold→purple), Ember (orange→red), Grace (rose→lavender), Pulpit Ink (ink→royal blue).
  - Custom two-stop: from hex, to hex, and angle 0–360° (dial plus number). It uses the same hex validation as the colour popover.
  - Stored as a **mark** `gradient { from, to, angle, preset? }`. Rendered on the **outer** span: `background-image: linear-gradient(angle, from, to); background-clip: text; -webkit-text-fill-color: transparent; box-decoration-break: clone`. Bionic children inherit the fill so the gradient doesn't restart on each fragment.
  - **Guardrails:** both stops must be ≥3:1 against the current background, otherwise there's a warning plus halo. Gradient is disabled inside Scripture (the button is greyed with the tooltip "Scripture stays plain"). Gradient plus highlight on the same run: the gradient wins and the highlight is dropped, with a toast. Find-highlight draws an outline instead of a background on gradient runs. In forced-colours or high-contrast mode, the gradient falls back to `from` as a solid colour.
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
- W2. The popover is fully keyboard-operable (Tab in, arrows, Enter, Esc returns focus).
- W3. Gradient renders continuously across Bionic fragments and line wraps in Preach.
- W4. Gradient can't be applied inside Scripture.
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
- C1. Typing the test sentence `« L’Éternel est bon ! » — Kreol: "Bondie bon" * _ & <amen> peut-être œuvre` round-trips through save, reload, Preach (Bionic on), and all 4 exports with identical characters.
- C2. A decomposed `e` + U+0301 is stored as NFC `é`, and Bionic never splits the accent from its letter.
- C3. `<amen>` is shown as literal text everywhere and never becomes a tag.
- C4. French smart quotes insert NNBSP, and undo restores the straight quote.
- C5. Windows US-International dead keys and Mac `⌥e e` produce é in Edit.

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

**UI.** The Font dropdown groups **Serif** and **Sans**, and each name is shown in its own face. Document ⚙ sets **document default fonts** for body and headings, and inline selection overrides them. A **Justify** option is added to the alignment group (≡ justified) with `hyphens: auto` taken from the document language. Justify is off by default in Preach narrow columns (<45 characters), to avoid "rivers" of white space.

**Engineering.** Loaded via `next/font/google` in `app/layout.tsx` with `subsets: ["latin","latin-ext"]`, `display: "swap"` and CSS variables (`--font-lora` and so on). The stored value is the **font id** (`"lora"`) rather than a CSS stack, which fixes P9 and the export mapping. Fonts are self-hosted by next/font, so they're cached by the PWA for offline Preach (§4.12).

**Export.** The export server bundles the same 10 TTF/OTF files (Backend). PDF embeds subsets. DOCX embeds fonts (`w:embedTrueTypeFonts`) and names the family, with a fallback of Georgia or Arial. PPTX names the family, embeds where possible, and otherwise falls back to Georgia or Arial with a note. PNG is rasterised.

**AC.** F1: picking each of the 10 fonts renders the C1 sentence without fallback glyphs. F2: the PDF has the font embedded (`pdffonts` lists it). F3: the old values `serif`, `sans` and `mono` migrate to `source-serif-4`, `inter` and `jetbrains-mono`. F4: Justify works and hyphenates French correctly with `lang="fr"`.

### 4.5 Bionic strength slider

**Purpose.** Mevin controls how strong the Bionic effect is.

**UI.** In the Preach toolbar: a Bionic toggle plus a slider with 5 steps, **Off · Light (30%) · Medium (45%, current behaviour) · Strong (60%) · Max (70%)**, showing a live preview. Shortcuts `[` and `]` change the step while in Preach. Edit has the same slider under Document ⚙ → Reading, so it can be set ahead of time.
**Engineering.** `bionicParts(text, ratio)`, where `n = max(1, ceil(graphemes × ratio))`. Bold weight contrast also scales: Light uses weight 600, Max uses 800.
**States.** Off, or one of 4 strengths.
**Defaults.** Medium (45%).
**Accessibility.** `role="slider"` with `aria-valuetext="Bionic medium"`. Reduced motion has no effect, because nothing is animated.
**Data.** `doc.presentation.bionic: { enabled: boolean, strength: 0.3|0.45|0.6|0.7 }`, **saved per document** (migrated from the boolean `bionic`).
**Export.** Bionic is never exported (the contract keeps `bionic: false`).
**AC.** B1: changing strength updates Preach instantly and persists after reload, per document. B2: Scripture stays plain at every strength. B3: two documents keep separate strengths.

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
- D2. Changing the scale repaginates, and the numbers update with the reading position kept.
- D3. Infinite mode shows the "pages left" counter down to END.
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
**AC.** T1: all 5 fields save and reload, and show in Preach and the exports. T2: empty fields leave no blank lines. T3: the date shows in French when the language is fr.

### 4.8 Preaching timer and STOP

**Purpose.** Help the preacher keep to time, without distraction.

**UI & interaction.**
- **Edit:** a "Target duration" field in Notes / Document ⚙ (mm:ss, default **45:00**, range 5:00–120:00), with the estimated length shown beside it (§4.12f).
- **Preach toolbar:** a **▶ START** icon button plus the time, in **8 pt ALL CAPS**, letter-spacing 0.08 em, tabular numerals, e.g. `45:00`. The timer stays visible even when the rest of the chrome fades (pinned top-right at 60% opacity).
- **Start** begins the countdown, one second per tick, using wall-clock time (`performance.now`-based, so it doesn't drift when the tab is throttled). Starting also turns on the wake lock (§4.12b) and the edit lock (§4.12d).
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
- TM1. Target 45:00, Start: after 40:00 elapsed it shows `05:00` in orange. At 45:01 it shows `+00:01` in bold red.
- TM2. The countdown doesn't drift by more than 1 s over 60 min with the tab backgrounded.
- TM3. STOP dims the text and opens the Prayer panel with the approved prompts.
- TM4. A page refresh while running resumes the correct time.
- TM5. The timer label is 8 pt uppercase in computed style.

### 4.9 Document status and prayer prompts

**Purpose.** Track where a sermon is, and prepare prayer points once it's finalised.

**UI.**
- A status pill in the Edit header: **In progress** (default, blue-grey), **On pause** (amber), **Finalised** (green), **Completed** (muted with ✓).
- Choosing **Finalised** opens the **Prayer prompts** dialog:
  - Tab "Write my own": an editable bullet list (3–7 recommended).
  - Tab "Suggest with AI": a **Generate** button that sends the sermon text through the server proxy and returns 5 short suggestions in the document language. Each suggestion has Keep, Edit and Discard. Regenerate is available, limited to 5 per document per hour.
  - **Approve** saves the final list. Cancel keeps the document Finalised with no prompts, and a reminder badge appears.
  - Finalising also takes an automatic version snapshot (Phase E, §4.13).
- Editing a Finalised sermon shows a banner: "This sermon is finalised. Editing will set it back to In progress." Choosing to continue reverts the status. Prompts are kept but flagged "review".
- **Completed** is set by the STOP flow (§4.8) or by hand.

**AI provider options** (the server is stateless, Mevin's choice is pending):

| Option | Why | Cost | Notes |
|---|---|---|---|
| **A. Gemini (2.x Flash) via Vertex AI** (recommended) | The app already runs on GCP Cloud Run, so the service account authenticates with no key to store. Good French. | Very low per sermon (fractions of a cent). There's a free tier on AI Studio, while Vertex is pay-as-you-go. | Region europe-west. Data isn't used for training under Vertex terms. |
| B. OpenAI (GPT-4o-mini class) | Strong quality, simple API | Low, pay-as-you-go | Needs an API key in Secret Manager. Data leaves GCP. |
| C. Anthropic Claude (Haiku class), direct or via Vertex Model Garden | Careful, high-quality tone | Low | Via Vertex it keeps GCP billing and auth. |

**Proxy (Backend).** `POST /api/ai/prayer-prompts { text, language, count }` → `{ prompts: string[] }`. The server:
- holds credentials (none in the browser),
- trims input to about 12k characters,
- applies a rate limit (per IP or session, plus a global daily cap),
- applies a timeout of 20 s,
- **stores nothing and doesn't log the sermon body**,
- uses a pastoral system prompt: "short first-person-plural prayer points drawn only from this sermon; no doctrine not present in the text".

**Nothing is saved until the preacher approves.** Offline: the AI tab shows "Needs internet. You can write your own."
**Accessibility.** The status is a labelled `select` / `menu`. The dialog traps focus, and suggestions are a list with labelled buttons.
**Data.** `doc.status: "in_progress"|"on_pause"|"finalised"|"completed"`, `doc.prayerPrompts { items: string[], source: "manual"|"ai"|"mixed", approvedAt }`.
**Export.** Prayer prompts appear in an optional final "Prayer" page (PDF/DOCX/PPTX), off by default. PNG doesn't include them.
**AC.**
- S1. Finalised opens the dialog. Approve saves the list, and Cancel saves nothing.
- S2. AI suggestions aren't written to the file until Approve (verified by reading the file).
- S3. The proxy never returns or logs the key, and the rate limit returns 429 with a friendly message.
- S4. Editing a Finalised sermon reverts it to In progress after confirmation.

### 4.10 Modular sections and columns

**Purpose.** Build a sermon from blocks that can be rearranged: a quote here, two columns of comparison there, an image beside text.

**UI & interaction.**
- Every top-level piece of content lives in a **section** card. On hover or focus it shows a **⠿ drag handle**, a column switcher **[1 | 2 | 3]**, a ⋯ menu (Duplicate, Move up, Move down, Background tint, Delete) and **✕ delete** (with Undo in a toast, no confirmation dialog).
- **+ Section** between sections or in the toolbar inserts a section of Text, Two columns, Three columns, Image + text, or Scripture.
- Columns hold any blocks: text, headings, Scripture, lists or images. Column widths are equal by default, and dragging the gutter gives 1:2, 2:1 and similar (snapping at thirds).
- **Images:** drag in, paste, or "Insert image". Formats JPG, PNG or WebP, at most 10 MB. They're resized client-side to a maximum of 2400 px long edge, and need alt text (prompted). Captions are optional.
- **Keyboard alternatives:** focus the handle, then Space to pick up, ↑/↓ to move, Space to drop, Esc to cancel (announced "Section 3 of 7 moved to position 2"). Alt+Shift+↑/↓ moves the current section directly. Ctrl/Cmd+Alt+1/2/3 sets columns. Delete on a focused handle deletes.
- **In Preach:** sections can still be moved and edited **when the edit lock is off** (§4.12d). Handles appear only in unlocked mode. Text edits in Preach are saved to the same file.
- **Responsive collapse:** 3 columns become 2 below 900 px of column width, and 2 become 1 below 600 px (stacking in reading order left→right). The stored setting doesn't change. Preach on a phone shows stacked columns.

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
- M1. Add, drag, keyboard-move, delete and undo all work, and the order persists.
- M2. A 3-column section collapses to 1 at 375 px width and is restored at desktop width.
- M3. A v1 doc opens unchanged, wrapped in one section.
- M4. An image saved in folder mode exists in `assets/`, and the `.sermon` references it. The doc reopens with the image when offline.
- M5. In Preach with the lock off, a section can be moved and the change is saved.

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
- L1. Create, restyle and delete work. Lines persist after reload.
- L2. A line follows its words after a font-scale change, a Bionic toggle, a resize and a section move.
- L3. Deleting anchor text removes the line, and Undo restores both.
- L4. The DOCX export shows the warning and superscript markers.

### 4.12 Designer additions in the main build

**a. Offline Preach (PWA).**
- A service worker (`next-pwa` or Workbox) precaches the app shell, the 10 fonts and the Preach route.
- Sermons are already local (§4.15), so Preach works fully offline. Export and AI show "Needs internet".
- An install prompt "Install for offline preaching" is shown.
- AC: in airplane mode, open the app, then a sermon, then Preach, Start and STOP. All work.

**b. Screen wake lock.**
- `navigator.wakeLock.request("screen")` while the timer runs, or whenever Preach is open (user setting, default: while the timer runs). It's re-acquired on `visibilitychange`.
- If unsupported, it shows a one-time tip ("Set your screen to never sleep").
- AC: the screen doesn't dim for 30 min on Chrome Android or Windows while the timer runs.

**c. Page turning.**
- Next: → ↓ PageDown Space Enter. Previous: ← ↑ PageUp Shift+Space. This works with Bluetooth clickers (which send PageUp/PageDown or arrows) and foot pedals (configurable key).
- Settings → "Pedal keys" lets Mevin press his pedal to learn the key.
- Single mode turns a page, and infinite mode scrolls one screen minus 2 lines.
- AC: a Logitech R400-type clicker (PageUp/PageDown) turns pages, and a learned key works.

**d. Edit lock.**
- Turns on **automatically when the timer starts**, shown as 🔒 Locked in the toolbar.
- Locked: no text editing, no drag, taps don't move content, and page-turn taps still work.
- **One tap on 🔒** unlocks it for 60 s of inactivity, then it relocks while the timer runs. Manual toggle is available at any time.
- AC: after Start, a tap on text doesn't place a cursor. One tap on the lock enables editing.

**e. Point navigator.**
- H1/H2 outline (extends `OutlineNav.tsx`) in Edit (left pane) and in Preach (☰ Points drawer).
- Tap to jump. The current point is highlighted. In Preach it shows a per-point time chip (see g).
- AC: tapping "II. Peace" jumps there in both modes.

**f. Estimated length.**
- `words ÷ wpm`, with **default 130 wpm** (adjustable 90–180 in settings). Scripture counts at 0.8× speed.
- Shown next to the target: `TARGET 45:00 · EST. ~38 min`. Over the target by more than 10% shows amber with "~6 min long".
- AC: 4,940 words at 130 wpm shows ~38 min.

**g. Timing per point.**
- In Edit, each H1 can get a minutes allotment (default: the target split evenly by word share).
- In Preach, a small chip by the timer shows `II · +1:20 behind` (amber) or `−0:45 ahead` (muted). It's calculated from the elapsed time when the reader enters each point's region.
- AC: points with allotments show the correct ahead or behind time within ±5 s.

**h. Scripture insert by reference.**
- In the Scripture block or the subtitle, type a reference (`Philippiens 4:4-7`, `Phil 4.4–7`, `John 3:16`), then click "Insert". The verses arrive with the citation set (`Philippiens 4:4-7 LSG`).
- Translations in Phase B: **Louis Segond 1910 (public domain)** and **KJV (public domain, UK Crown patent noted)**. Bundled as local JSON (about 4–5 MB each, lazy-loaded and cached for offline), so no API or server is needed.
- The parser accepts French and English book names and abbreviations.
- Licensed translations (ESV, NIV, BDS, Segond 21) come later and need licences.
- AC: `Phil 4:4-7` LSG inserts 4 verses offline with the correct citation.

**i. Document language.**
- `en` / `fr` / `mfe` (Kreol Morisien) in Document ⚙ and the status bar. It sets the `lang` attribute on the editor and Preach.
- `spellcheck=true` for en and fr (the browser dictionary), and **spellcheck off for Kreol**. It also drives hyphenation, smart quotes and the date format.
- Per-paragraph language override (⋯ → Language) for mixed sermons.
- AC: a Kreol doc shows no red squiggles, and a French doc underlines "joiee".

**Data:** `doc.settings { language, wpm, wakeLock, pedalKeys }`, `doc.points[] { headingId, minutes }`.

### 4.13 Phase E (later)

- **Version history.** Snapshots are saved as `<SermonFolder>/.history/<id>/<timestamp>.sermon`. They're taken automatically when the status becomes Finalised, by hand ("Save version"), and hourly while editing (keeping the last 20 automatic ones). Compare view and Restore are included.
- **Sermon library.** A home screen that indexes the sermon folder: full-text search, a **series** field ("Philippians, part 3"), **Bible book** (from the subtitle reference), status, and **where and when preached** (from the `preached[]` records written by STOP). There's a warning "Already preached at Église X on 12/05/2025".
- **Template.** "New from template": Introduction, I/II/III points, Application, Conclusion, Prayer. Templates are saved as `.sermon-template` files in the folder.
- **Multi-device sync via a synced folder.** No server. Mevin points the sermon folder at a Google Drive for desktop or OneDrive folder, and those clients sync the files. The app detects external changes (polling `lastModified` on focus). On conflict, it keeps both copies (`… (conflict from TABLET).sermon`) and shows a compare dialog. On iPad/Android, where the File System Access API isn't available, you open or import a `.sermon` file from Drive/Files and save it back (Back up / Restore flow). That's a limitation to accept.
- **Second screen / projector:** future only. A Scripture-only audience window via the Presentation API, not in v2.

### 4.14 (reserved for numbering)

### 4.15 Storage, Back up and Restore (local-first, decided)

**Decision (Mevin, Oct 2026):** sermons live **only on Mevin's PC**. It's free, with **no Firestore and no cloud database**. The server (Cloud Run) handles only **exports** and the **AI prayer-prompt proxy**, and keeps no sermon data.

**First run.**
- A welcome card: "Where should your sermons live?" with **Choose folder…** (File System Access API `showDirectoryPicker`, Chrome/Edge desktop). A tip suggests "a folder inside Google Drive or OneDrive to sync between devices".
- The folder handle is kept in IndexedDB, and permission is re-requested on each launch with one click ("Allow access to *Sermons*").
- **Fallback** (Firefox, Safari, iPad, or permission denied): sermons are stored in the browser's IndexedDB with a persistent-storage request (`navigator.storage.persist()`). A banner says: "Saved in this browser only. Back up regularly."

**Files.**
- `<Folder>/<filename>.sermon` is UTF-8 JSON: `{ format: "sermon", schemaVersion: 2, id, meta, settings, presentation, status, timer, prayerPrompts, preached, points, connectors, content, notes }`.
- The filename follows the agreed sanitising rule (#10).
- `<Folder>/assets/` holds images, and `<Folder>/.history/` holds versions (Phase E).
- Writes are atomic (write a temp file, then replace) and the existing autosave controller is reused. Status shows "● Saved to PC" / "Saving…" / "Not saved: retry".

**Back up / Restore.**
- **Back up** (header button and Settings): makes a single `Sermons-backup-2026-10-16.zip` with all `.sermon` files, `assets/` and `history/`, plus a `manifest.json` with app version, count and checksum. Zipping is done client-side (fflate). It's saved where the user chooses, e.g. a USB stick, Drive or OneDrive.
  - Per-sermon "Export .sermon file" embeds images as data URLs, so a single file is self-contained.
- **Restore:** pick a `.zip` or `.sermon` file and see a preview list: new, same, or newer/older than local. Options are "Add missing only" (default), "Replace older", or "Keep both". Nothing is overwritten without being listed. The manifest checksum is verified, and schema migrations run on restore.
- A reminder banner appears if there's been no backup for 14 days and the app is in IndexedDB mode (30 days in folder mode).
- The existing server store (`src/lib/sermon/store.ts`) and `/api/sermons*` stay for dev and tests only and are **not used** by the production client. The client uses a `SermonRepository` interface with `FolderRepository` and `IndexedDbRepository` implementations.

**Dependencies:** images (§4.10), version history, library and multi-device sync all build on this storage layer.

**Accessibility.** Pickers are native, and progress and results are announced.
**AC.**
- ST1. On first run, choosing a folder makes new sermons appear as `.sermon` files there.
- ST2. Denying permission falls back to IndexedDB with the banner.
- ST3. Back up then Restore on a clean browser gives identical sermons, including images and statuses.
- ST4. No sermon content is sent to the server except in an export request or an AI request the user triggered (verified in the network log).
- ST5. Editing the same file from two machines through a synced folder produces a conflict copy rather than data loss.

---

## 5. Data model summary (`.sermon`, schemaVersion 2)

```ts
interface SermonFile {
  format: "sermon"; schemaVersion: 2; id: string;            // uuid
  meta: { title; subtitle?; author?; place?; date?; titleLayout?: "classic"|"left"|"minimal";
          createdAt; updatedAt; series?; bibleBook? };
  status: "in_progress"|"on_pause"|"finalised"|"completed";
  settings: { page: { size; widthMm?; heightMm?; orientation: "portrait"|"landscape";
                      view: "single"|"spread"|"infinite"; margins: "narrow"|"normal"|"wide";
                      showPageNumbers: boolean };
              language: "en"|"fr"|"mfe"; smartQuotes: boolean; wpm: number;
              defaultFonts: { body: FontId; heading: FontId }; wakeLock: "timer"|"preach" };
  presentation: { theme: "light"|"dark"; typeScaleStep; lineHeight;
                  bionic: { enabled: boolean; strength: 0.3|0.45|0.6|0.7 } };
  timer: { targetSec: number };                               // default 2700
  points: { headingId: string; minutes: number }[];
  prayerPrompts?: { items: string[]; source: "manual"|"ai"|"mixed"; approvedAt: string; needsReview?: boolean };
  preached: { at: string; place?: string; durationSec: number }[];
  connectors: { id; fromAnchorId; toAnchorId; style: {...}; label? }[];
  content: TipTapJSON;   // doc → titleBlock, section+ → column+ → blocks; marks: bold, italic,
                         // underline, strike, link, textStyle{color,preset,fontFamily(FontId),fontSize},
                         // highlight{color,preset}, gradient{from,to,angle,preset}, anchor{id}
  notes?: string;
}
type FontId = "lora"|"merriweather"|"playfair-display"|"source-serif-4"|"literata"
            |"inter"|"open-sans"|"lato"|"montserrat"|"nunito-sans"|"jetbrains-mono";
```
Migrations v1→v2: wrap flat content into one section; first `title` node → `meta.title`/`titleBlock`; `bionic: boolean` → `{enabled, strength: 0.45}`; font stacks → FontId; status defaults to `in_progress`; timer 2700.

Export contract changes (Backend, `docs/api-export-contract.md`): accept FontId and `fontSize`, `underline`, multicolour `highlight`, `gradient` with per-format `gradientMode`, `section/column/image` nodes (images inlined as data URLs in the request, since the server has no store), `titleBlock`, and optional `prayerPrompts` page. `bionic` stays `false`.

---

## 6. Phased plan

| Phase | Scope | Frontend | Backend | QA |
|---|---|---|---|---|
| **A: Fidelity and writing tools** | **A1 shared schema + mark-preserving renderer + Bionic layer + shared mark CSS (§4.1)**; B/I/U, size, colour popover rebuild, multicolour highlight (§4.2 minus gradient); 10 fonts and justify (§4.4); accents, smart quotes and palette (§4.3); Bionic slider (§4.5) | Renderer, toolbar, popovers, fonts, bionic | Export contract: FontId, size, underline, highlight; bundle fonts for PDF | A1–A4, W1, W2, W6, C1–C5, F1–F4, B1–B3; regression of slices 1–2 |
| **B: Local storage and document** | Local-first storage, Back up / Restore (§4.15); title block (§4.7); document settings, page numbers, infinite (§4.6); language (§4.12i); Scripture insert LSG/KJV (§4.12h) | Repository layer, dialogs, pagination, Bible data | Retire prod use of the server store; export size and orientation, title block; filename rule | ST1–ST5, T1–T3, D1–D5 |
| **C: Pulpit** | Timer and STOP (§4.8); status and prayer prompts with the AI proxy (§4.9); PWA offline, wake lock, page turning, edit lock, navigator, estimate, per-point timing (§4.12 a–g) | Preach chrome, timer, panels, SW | `/api/ai/prayer-prompts` proxy (Vertex), rate limit, no logging | TM1–TM5, S1–S4, offline, clicker and wake-lock device tests |
| **D: Layout power** | Modular sections, columns and images (§4.10); gradient text (§4.2); connector lines (§4.11) | Section nodes, DnD, overlay | Export: columns, images, gradient modes, PDF connector paths | M1–M5, W3–W5, L1–L4 |
| **E: Library (later)** | Version history, library, templates, sync via a synced folder (§4.13) | Library UI, history, conflict UI | None (no server), except export | Conflict and restore tests |

The Project Manager may reorder C before B's Scripture insert. **A1 is first and blocks everything**, because every later feature renders through it.

---

## 7. Open decisions for Mevin

1. **AI provider for prayer prompts:** A Gemini via Vertex (recommended), B OpenAI, or C Claude. Plus a budget cap (for example US$5 per month).
2. **Default page size:** A4 (proposed) or Letter. Also, should page numbers in **printed** exports also descend? (Proposed: no, print ascends.)
3. **Bible translations beyond LSG 1910 and KJV:** is a licence for Segond 21, BDS or an English modern version worth it later?
4. **Edit lock auto-relock** after 60 s while the timer runs: keep it, or stay unlocked until tapped again?
5. **Connector lines in Word/PowerPoint:** accept the "dropped with markers" fallback for v2?
6. **Synced folder:** which one will you use, Google Drive for desktop or OneDrive? This lets us test conflicts on your real setup, and tells us whether the iPad workflow (open/save `.sermon` files) is acceptable.
