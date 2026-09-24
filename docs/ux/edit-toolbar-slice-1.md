# Edit toolbar — Slice 1 (interaction spec)

**Product:** sermon-editor-presenter (`/edit`)  
**Owner:** UI UX → implement with Frontend  
**Status:** Ready for Frontend wireframe/implementation pass (independent of QA Ready gate)  
**Out of scope this slice:** Document setup / Save as / export (slice 2); Preach/Reading chrome; brand art

---

## Goal

Let Mevin format sermon prose quickly while writing — without leaving the keyboard much — and keep block structure (Title / H1 / H2 / Body / Scripture) clearly separate from inline formatting.

## Current state

Today `SermonEditor` toolbar is **block insert only**: Title, H1, H2, Body, Scripture.  
StarterKit already ships **History + Italic (+ Bold)**; there is no Highlight / Align / Color / Font UI yet.

## Layout (extend existing toolbar)

Keep one horizontal toolbar above the editor (`role="toolbar"`). Prefer **two visual groups** with a subtle divider (not two separate toolbars):

```
[ Block types ]  |  [ History ]  [ Inline marks ]  [ Align ]  [ Font ]  [ Color ]
Title H1 H2 Body Scripture | ↶ ↷ | I  ▮ | ≡ ≡ ≡ | Font ▾ | A▾
```

| Group | Controls | Notes |
|-------|----------|--------|
| Block (existing) | Title, H1, H2, Body, Scripture | Unchanged labels; still set/insert block types |
| History | Undo, Redo | Disabled when TipTap can’t undo/redo |
| Inline | Italic, Highlight | Toggle; pressed = active on selection / caret marks |
| Align | Left, Center, Right | Exclusive; applies to current block(s) |
| Font | Family dropdown | Applies to selection (mark) |
| Color | Text color swatch/menu | Applies to selection (mark) |

**Do not** put Bold in slice 1 UI unless it’s free while wiring Italic (StarterKit already supports Cmd/Ctrl+B). Prefer shipping the PM list first.

### Placement rules

1. Toolbar stays sticky under the Editing topbar / at the top of the editor pane so it doesn’t scroll away with long sermons.
2. Wrap on narrow widths: groups wrap as whole units; never orphan a single icon from its group.
3. Match existing `.toolBtn` language (size, radius, border, focus ring using `--edit-*` tokens). History/align can be icon buttons with `aria-label`; text labels OK for Font/Color triggers.

---

## Control specs

### Undo / Redo

- **Action:** `editor.chain().focus().undo()` / `.redo()`
- **Disabled:** when `!editor.can().undo()` / `!editor.can().redo()`
- **Shortcuts (document, don’t invent new ones):** Cmd/Ctrl+Z undo; Cmd/Ctrl+Shift+Z (and Ctrl+Y on Windows if TipTap default) redo
- **Feedback:** none beyond button enable/disable; keep focus in the editor after click

### Italic

- **Action:** `toggleItalic()`
- **Pressed:** `editor.isActive("italic")`
- **Label:** visible “I” or italic glyph + `aria-label="Italic"`
- **Shortcut:** Cmd/Ctrl+I (StarterKit)
- **Scripture note:** Scripture blocks may already render with emphasis in Preach; italic mark on scripture body is still allowed (writer intent). Do not auto-strip.

### Highlight

- **Action:** toggle highlight mark on selection
- **Pressed:** highlight mark active
- **Default color:** one soft amber/yellow that works on **dark edit theme** (current default) and light — e.g. semi-transparent warm fill, not neon. Single color for slice 1; no multi-color highlighter picker yet.
- **Empty selection:** apply to word under caret if TipTap/Highlight supports extend; otherwise no-op (don’t highlight entire paragraph)
- **Clear:** toggle off when pressed again
- **Export awareness (for Backend later):** highlight should survive in TipTap JSON; DOCX/PDF treatment can be “background highlight” or “ignored until export contract updated” — Frontend should store the mark; Backend alignment is slice 2 / export follow-up, not a blocker for Edit UI.

### Align (Left / Center / Right)

- **Scope:** current block(s) — paragraph, heading, title, scripture — via TextAlign (or equivalent attrs)
- **Exclusive:** one active at a time; Left is default
- **Scripture:** align applies to the scripture quote body. In Preach and export the citation is always caption-right, below the quote, whatever the block alignment. In Edit the citation field does **not** follow block alignment; it stays left-aligned as a fixed input, because the writer does not control citation position (issue #6).
- **Icons:** standard left/center/right; `aria-pressed` on active
- **No justify** in slice 1

### Fonts

- **Control:** compact select / menu button labeled with current family (or “Font”)
- **Slice 1 palette (keep tiny — preaching readability):**
  1. **Sans** — system UI / current `--edit-font-body` (default)
  2. **Serif** — Georgia / `ui-serif, Georgia, serif`
  3. **Mono** — for rare notes/snippets only — `ui-monospace, monospace`
- **Applies to:** selection as a mark (FontFamily), not the whole document theme
- **Empty selection:** set mark for next typing (TipTap stored mark behavior)
- **Do not** expose arbitrary font upload or web-font picker in slice 1

### Color

- **Control:** “A” with color underline, opens a small palette (not a full native color picker)
- **Slice 1 palette (6 + reset):**
  - Default (theme foreground) — clears color mark
  - Muted gray
  - Accent (use `--edit-accent`)
  - Soft red (emphasis / warning tone)
  - Soft blue
  - Soft green
- **Applies to:** text color mark on selection / next typing
- **Contrast:** every swatch must remain readable on dark edit background; test pressed state on dark
- **No** background-fill color control in slice 1 (Highlight covers callout)

---

## Interaction details

1. **Focus:** every toolbar click returns focus to the editor (`chain().focus()…`) so typing continues.
2. **Active states:** use `aria-pressed` + visual pressed style (reuse Reading toolbar `.active` pattern where it fits Edit tokens).
3. **Disabled editor:** if editor null / boot loading, hide or disable the whole format group.
4. **Selection across mixed marks:** buttons reflect “all active” TipTap defaults; don’t invent partial-state UI in slice 1.
5. **Keyboard:** don’t capture keys already used by Find (FindBar owns find UI). Toolbar itself is mouse/touch + native contenteditable shortcuts.
6. **Undo stack:** format toggles must participate in History (default TipTap marks/commands do).

## Accessibility

- Toolbar: `role="toolbar"` `aria-label="Text formatting"` (block group can stay `aria-label="Block type"` or one toolbar with two `role="group"`).
- Icon-only buttons need visible tooltips **or** clear `aria-label` (prefer both if easy).
- Dropdowns: Escape closes; Arrow keys move; Enter/Space activates.
- Don’t rely on color alone for Highlight/Color — pressed border + `aria-pressed` required.

## Acceptance criteria (for QA pairing)

1. Undo/Redo enable/disable correctly; shortcuts work; click doesn’t steal caret permanently.
2. Italic toggles on selection; persists after autosave + reload (TipTap JSON).
3. Highlight toggles; visible on dark theme; persists in JSON.
4. Align left/center/right exclusive; persists on block; survives reload.
5. Font Sans/Serif/Mono apply to selection; default Sans; persists.
6. Color palette applies / Default clears; persists; readable on dark edit chrome.
7. Block buttons (Title…Scripture) still work; no layout jump that hides Enter Preaching / save status.
8. No new API calls; pure editor marks/attrs + existing autosave of `content`.

## Frontend implementation hints (non-prescriptive)

- Extensions likely needed beyond StarterKit: `@tiptap/extension-highlight`, `text-align`, `color`, `text-style`, `font-family` (versions align with TipTap ^3.31.x).
- Prefer one `FormatToolbar` component beside the existing block buttons to keep `SermonEditor.tsx` readable.
- CSS: extend `SermonEditor.module.css`; add `.toolGroup`, `.toolDivider`, `.toolBtnActive`, `.swatch`.

## Next (slice 2 — not this doc)

Document setup / Save as / export format choices — coordinate with Backend calibrated snapshot + workers (DOCX/PDF now; image/PPTX later).

