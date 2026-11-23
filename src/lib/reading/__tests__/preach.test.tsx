/** @jsxRuntime automatic */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { layoutSnapshot } from "@/lib/sermon/export/pngLayout";
import { contrastRatio, displayTextOnBackground, parseColor, SAVED_BODY_TEXT } from "@/lib/reading/contrast";
import { FORMAT_THEME } from "@/lib/sermon/export/frames";
import { snapshotFor } from "@/lib/reading/pageSettings";
import { countdown, shouldBarFade, formatElapsed, BAR_IDLE_MS } from "@/lib/reading/barFade";
import { pageOfBlock, buildPageView, containScale, fillsScreen, pageStepForKey, pageStepForSwipe, clampPage } from "@/lib/reading/pageView";
import { keepScreenAwake } from "@/lib/reading/wakeLock";
import { renderSermon } from "@/lib/reading/renderSermon";

const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const long = Array.from({ length: 60 }, (_, i) => para(`Paragraph ${i} ` + "grace and peace to you all ".repeat(8)));
const doc = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "The Sower" }] },
    para("Mark 4:1-20"),
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Seed" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Read slowly " },
        { type: "text", text: "(pause)", marks: [{ type: "italic" }, { type: "textStyle", attrs: { color: "#5c5c5c" } }] },
        { type: "text", text: " then go on." },
      ],
    },
    ...long,
  ],
};

test("countdown: normal, orange at 05:00, bold red past zero", () => {
  const T = 30 * 60_000;
  assert.deepEqual(countdown(T, 0), { text: "30:00", tone: "normal" });
  assert.equal(countdown(T, 25 * 60_000 - 1000).tone, "normal");
  assert.deepEqual(countdown(T, 25 * 60_000), { text: "05:00", tone: "warn" });
  assert.equal(countdown(T, T).tone, "warn");
  assert.deepEqual(countdown(T, T + 12_000), { text: "−00:12", tone: "over" });
});

test("bar fades only while the timer runs, idle, unfocused, popover closed", () => {
  const base = { timerRunning: true, idleMs: BAR_IDLE_MS + 1, focusInBar: false, settingsOpen: false };
  assert.equal(shouldBarFade(base), true);
  assert.equal(shouldBarFade({ ...base, timerRunning: false }), false);
  assert.equal(shouldBarFade({ ...base, idleMs: 10 }), false);
  assert.equal(shouldBarFade({ ...base, focusInBar: true }), false);
  assert.equal(shouldBarFade({ ...base, settingsOpen: true }), false);
  assert.equal(formatElapsed(65_000), "01:05");
});

test("page turns: arrows, space, PageUp/PageDown, swipe", () => {
  for (const k of ["ArrowRight", "PageDown", " "]) assert.equal(pageStepForKey(k), 1, k);
  for (const k of ["ArrowLeft", "PageUp"]) assert.equal(pageStepForKey(k), -1, k);
  assert.equal(pageStepForKey(" ", true), -1);
  assert.equal(pageStepForKey("a"), 0);
  assert.equal(pageStepForKey("ArrowDown"), 0);
  assert.equal(pageStepForKey("ArrowUp"), 0);
  assert.equal(pageStepForSwipe(-120, 5), 1);
  assert.equal(pageStepForSwipe(120, 5), -1);
  assert.equal(pageStepForSwipe(-30, 0), 0);
  assert.equal(pageStepForSwipe(-80, 200), 0);
  assert.equal(clampPage(9, 3), 2);
  assert.equal(clampPage(-1, 3), 0);
});

test("one page fits and centres; matching shape fills", () => {
  assert.equal(containScale({ width: 1920, height: 1080 }, 960, 1000), 0.5);
  assert.equal(containScale({ width: 1920, height: 1080 }, 2000, 540), 0.5);
  assert.equal(fillsScreen({ width: 1920, height: 1080 }, 1600, 900), true);
  assert.equal(fillsScreen({ width: 1920, height: 1080 }, 800, 1333), false);
});

const settingsFor = (page: Record<string, unknown>) =>
  ({ calibrationTarget: "paper-a4", typeScaleStep: 0, lineHeight: 1.55, theme: "light", page }) as never;

for (const page of [
  { format: "16:9", orientation: "landscape" },
  { format: "a4", orientation: "portrait" },
  { format: "tablet", orientation: "portrait", textSizePt: 36, lineSpacing: 1.8, paragraphSpacingPt: 30, margins: { top: "0.5in", right: "1in", bottom: "0.5in", left: "1in" } },
]) {
  test(`page view breaks equal Backend layoutSnapshot (${page.format} ${page.orientation})`, () => {
    const ref = layoutSnapshot(snapshotFor(doc as never, settingsFor(page)));
    const view = buildPageView({ content: doc as never, settings: settingsFor(page) });
    assert.ok(ref.pages.length > 1);
    assert.equal(view.pages.length, ref.pages.length);
    view.pages.forEach((pg, i) => {
      assert.equal(pg.length, ref.pages[i].lines.length);
      pg.forEach((l, j) => {
        assert.equal(l.y, ref.pages[i].lines[j].y);
        assert.equal(l.blockIndex, ref.pages[i].lines[j].blockIndex);
      });
    });
  });
}

test("cues stay inline; scripture line under the title", () => {
  const html = renderToStaticMarkup(<>{renderSermon(doc as never, { bionic: false, theme: "light" })}</>);
  assert.match(html, /<p[^>]*>Read slowly <span[^>]*data-cue[^>]*>/);
  assert.match(html, /data-title-sub[^>]*>Mark 4:1-20/);
});

test("wake lock: acquires, re-acquires on visible, releases, silent when unsupported", async () => {
  let req = 0, rel = 0;
  const listeners: Array<() => void> = [];
  const doc2 = {
    visibilityState: "visible",
    addEventListener: (_: string, f: () => void) => listeners.push(f),
    removeEventListener: () => listeners.pop(),
  };
  const nav = { wakeLock: { request: async () => { req++; return { released: false, release: async () => { rel++; } }; } } };
  const stop = keepScreenAwake(nav, doc2 as never);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(req, 1);
  // browser drops the lock on hide
  (await nav.wakeLock.request()).released = true; req--;
  stop();
  assert.equal(listeners.length, 0);
  assert.ok(rel >= 1);
  assert.doesNotThrow(() => keepScreenAwake({}, doc2 as never)());
  const failing = { wakeLock: { request: async () => { throw new Error("no"); } } };
  keepScreenAwake(failing, doc2 as never)();
});

test("page settings adapter: PresentationSettings.page round-trip and limits", async () => {
  const m = await import("@/lib/reading/pageSettings");
  for (const f of m.FORMAT_BUTTONS.filter((b) => b.format !== "fit-screen")) {
    for (const o of ["portrait", "landscape"] as const) {
      const c = { ...m.fromSettings(settingsFor({})), format: f.format, orientation: o, textSizePt: 40 };
      const back = m.fromSettings({ calibrationTarget: "paper-a4", ...m.toPatch(c) } as never);
      assert.equal(back.format, f.format);
      assert.equal(back.orientation, o);
      assert.equal(back.textSizePt, 40);
    }
  }
  const d = m.fromSettings(settingsFor({}));
  assert.deepEqual([d.textSizePt, d.lineSpacing, d.paragraphSpacingPt, d.margins.top], [28, 1.55, 20, 0.8]);
  assert.equal(m.stepTextSize({ ...d, textSizePt: 24 }, -1).textSizePt, 24);
  assert.equal(m.stepTextSize({ ...d, textSizePt: 72 }, 1).textSizePt, 72);
  assert.equal(m.fromSettings(settingsFor({ margins: { top: "50mm", right: "6mm", bottom: "9in", left: "x" } })).margins.bottom, 1.65); // A4: 20 % of 8.27 in
  // UX ruling: margin max = min(2 in, 20 % of the shorter side); half-Letter 1.1 in.
  assert.equal(m.marginMax({ format: "half-letter", orientation: "portrait" }), 1.1);
  assert.equal(m.marginMax({ format: "letter", orientation: "landscape" }), 1.7);
  const r = m.resetSpacing({ ...d, format: "16:9", orientation: "landscape", lineSpacing: 2, margins: { top: 2, right: 2, bottom: 2, left: 2 } });
  assert.equal(r.format, "16:9");
  assert.deepEqual([r.lineSpacing, r.margins.left], [1.55, 0.8]);
  assert.equal(m.deviceOrientation(800, 1280), "portrait");
  // #29 export request shape: margins as "Nin" strings, line spacing as lineHeight.
  const snap = m.snapshotFor(doc as never, settingsFor({ lineSpacing: 1.8, margins: { top: "1in", right: "0.5in", bottom: "1in", left: "0.5in" } }));
  assert.equal(snap.lineHeight, 1.8);
  assert.deepEqual(snap.margins, { top: "1in", right: "0.5in", bottom: "1in", left: "0.5in" });
  assert.equal(typeof (m.toPatch(d).page as { margins: { top: unknown } }).margins.top, "string");
});

test("re-layout keeps the reader on the same paragraph", () => {
  const a = buildPageView({ content: doc as never, settings: settingsFor({ format: "a4" }) });
  const b = buildPageView({ content: doc as never, settings: settingsFor({ format: "16:9", textSizePt: 48 }) });
  const { blockIndex: block, lineIndex } = a.pages[2][0];
  const pb = pageOfBlock(b.pages, block, lineIndex);
  assert.ok(b.pages[pb].some((l) => l.blockIndex === block));
});

test("page contract: fit-screen, legacy tablet, legal/custom only when set", async () => {
  const m = await import("@/lib/reading/pageSettings");
  const base = { calibrationTarget: "paper-a4" } as never;
  const fit = m.fitChoice(m.fromSettings(base), 1320, 2112);
  const page = m.toPatch(fit).page!;
  assert.equal(page.format, "fit-screen");
  assert.deepEqual(page.pageSpec, { kind: "fit", width: 1320, height: 2112, orientation: "portrait" });
  assert.equal(m.fitLabel(fit), "Fit this screen (1320×2112, 10:16)");
  const back = m.fromSettings({ calibrationTarget: "paper-a4", page } as never);
  assert.equal(back.format, "fit-screen");
  const snap = snapshotFor(doc as never, { calibrationTarget: "paper-a4", page } as never);
  assert.equal(snap.pageSpec?.kind, "fit");
  const g = buildPageView({ content: doc as never, settings: { calibrationTarget: "paper-a4", page } as never }).geometry;
  assert.ok(g.heightPx > g.widthPx);
  const tab = m.fromSettings({ calibrationTarget: "paper-a4", page: { format: "tablet", orientation: "portrait" } } as never);
  assert.deepEqual([tab.format, tab.orientation], ["4:3", "landscape"]);
  assert.equal(m.extraButton(m.fromSettings(base)), null);
  assert.equal(m.extraButton(m.fromSettings({ calibrationTarget: "paper-a4", page: { format: "legal" } } as never))?.key, "legal");
  const bad = m.fromSettings({ calibrationTarget: "paper-a4", page: { format: "custom", custom: { width: 1, height: 1, unit: "in" } } } as never);
  assert.ok(m.customError(bad));
});

const VERSE_WORDS = "FIXTURE made-up snippet words for page view.";
const styledVerse = {
  type: "verseSnippet",
  attrs: {
    ref: "Fixture 1:1",
    translation: "WEB",
    texts: { WEB: VERSE_WORDS },
    style: { background: "#EEE8D5", borderLeft: "#A8201A" },
    spacing: { pt: 24, pb: 24, pl: 20, pr: 12 },
  },
};
const plainVerse = {
  type: "verseSnippet",
  attrs: { ref: "Fixture 1:1", translation: "WEB", texts: { WEB: VERSE_WORDS } },
};
const verseDoc = (verse: typeof styledVerse | typeof plainVerse, copies = 10) => ({
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "Fixture page-view verse styles" }] },
    ...Array.from({ length: copies }, () => verse),
  ],
});

for (const page of [
  { format: "a4", orientation: "portrait" },
  { format: "a5", orientation: "portrait" },
  { format: "16:9", orientation: "landscape" },
]) {
  test(`page view paints verse fill, border and padding like the export layout (${page.format})`, () => {
    const settings = settingsFor(page);
    const content = verseDoc(styledVerse) as never;
    const ref = layoutSnapshot(snapshotFor(content, settings));
    const view = buildPageView({ content, settings });
    const plain = buildPageView({ content: verseDoc(plainVerse) as never, settings });

    assert.equal(view.pages.length, ref.pages.length, "page count matches the paginated layout");
    assert.deepEqual(view.boxes, ref.pages.map((p) => p.boxes ?? []));

    const boxes = view.boxes.flat();
    const filled = boxes.filter((b) => b.fill === "#EEE8D5");
    assert.ok(filled.length >= 1, "verse fill reaches page view");
    assert.ok(filled.every((b) => b.border === "#A8201A" && b.borderWidth > 0), "left border reaches page view");

    const verseLines = view.pages.flat().filter((l) => l.blockType === "Scripture");
    assert.ok(verseLines.some((l) => l.verseBar), "top bar stays");
    const words = verseLines
      .filter((l) => l.kind === "text")
      .map((l) => l.tokens.map((t) => t.text).join(""))
      .join(" ");
    assert.equal(words.replace(/\s+/g, ""), VERSE_WORDS.replace(/\s+/g, "").repeat(10));
    assert.doesNotMatch(words, /Jean |John /);

    for (const b of filled) {
      const lines = verseLines.filter((l) => {
        const x = l.x ?? view.frame.left;
        const w = l.width ?? view.frame.contentWidth;
        return l.y + l.lineHeight > b.y && l.y < b.y + b.h && x >= b.x - 0.5 && x + w <= b.x + b.w + 0.5;
      });
      assert.ok(lines.length >= 1, "padded verse lines sit inside the box");
      const first = lines.reduce((a, l) => (l.y < a.y ? l : a));
      const last = lines.reduce((a, l) => (l.y > a.y ? l : a));
      assert.ok(first.y > b.y + 1, "top padding is in the layout");
      assert.ok(last.y + last.lineHeight < b.y + b.h - 1, "bottom padding is in the layout");
      const x = first.x ?? view.frame.left;
      const w = first.width ?? view.frame.contentWidth;
      assert.ok(x > b.x + 1, "left padding is in the layout");
      assert.ok(x + w < b.x + b.w - 1, "right padding is in the layout");
    }

    for (const [i, pg] of view.pages.entries()) {
      for (const l of pg) {
        assert.ok(l.y + l.lineHeight <= view.frame.height + 0.5, `line overflows page ${i} on ${page.format}`);
      }
      for (const b of view.boxes[i] ?? []) {
        assert.ok(b.y >= -0.5 && b.y + b.h <= view.frame.height + 0.5, `box overflows page ${i} on ${page.format}`);
      }
    }

    assert.ok(plain.boxes.flat().every((b) => !b.fill && !b.border));

    const sizesOf = (pages: typeof view.pages, type: string) =>
      pages.flat().filter((l) => l.blockType === type).map((l) => l.size);
    const sameSizes = (type: string, label: string) => {
      const padded = sizesOf(view.pages, type);
      const unpadded = sizesOf(plain.pages, type);
      assert.ok(padded.length > 0 && unpadded.length > 0, `${page.format}: ${label} lines are laid out`);
      assert.deepEqual(
        [...new Set(padded)].sort((a, b) => a - b),
        [...new Set(unpadded)].sort((a, b) => a - b),
        `${page.format}: padded and unpadded ${label} must keep the same font size`,
      );
    };
    sameSizes("Scripture", "verse blocks");
    sameSizes("Title", "headings");
    assert.ok(
      view.pages.length >= plain.pages.length,
      `${page.format}: padded page count (${view.pages.length}) must be >= unpadded (${plain.pages.length})`,
    );
  });
}

test("Pages view measures without Bionic, so page counts match the export layout", () => {
  const content = verseDoc(plainVerse, 12) as never;
  const settings = Object.assign(settingsFor({ format: "a5", orientation: "portrait" }) as object, { bionicStrength: 0.45 }) as never;
  const view = buildPageView({ content, settings });
  const exported = layoutSnapshot(snapshotFor(content, settings));
  assert.equal(view.pages.length, exported.pages.length, "Pages view page count equals the export count");
  view.pages.forEach((pg, i) => {
    assert.equal(pg.length, exported.pages[i].lines.length);
    pg.forEach((l, j) => {
      assert.equal(l.y, exported.pages[i].lines[j].y);
      assert.equal(l.size, exported.pages[i].lines[j].size);
    });
  });
});

test("dark screen: text on a cream verse fill is checked against the fill, not the page", () => {
  const fill = "#EEE8D5";
  const pageBg = FORMAT_THEME["screen-dark"].pageBackground;
  const content = verseDoc(styledVerse, 1) as never;
  const html = renderToStaticMarkup(
    <>{renderSermon(content, { bionic: false, theme: "dark", formatTheme: "screen-dark" })}</>,
  );
  // Saved fill and text colours are unchanged in the sermon JSON.
  assert.equal(styledVerse.attrs.style.background, fill);
  assert.equal((styledVerse.attrs as { style: { color?: string } }).style.color, undefined);

  const figure = html.match(/data-verse-snippet[^>]*style="([^"]*)"/);
  assert.ok(figure, "Flow paints the verse snippet");
  const style = figure![1];
  assert.match(style, /background-color:\s*#EEE8D5/i);
  const colorM = style.match(/(?:^|;|,)\s*color:\s*(#[0-9a-fA-F]{6})/i);
  assert.ok(colorM, `Flow sets a text colour on the fill (style=${style})`);
  const flowColor = colorM![1];
  const shown = displayTextOnBackground(undefined, fill, "screen-dark", { pageBackground: pageBg });
  assert.ok(shown);
  // Cream fill already gives ~15:1 with the saved dark default; keep it.
  assert.equal(shown!.toLowerCase(), SAVED_BODY_TEXT.toLowerCase());
  const ratio = contrastRatio(parseColor(shown!)!, parseColor(fill)!);
  assert.ok(ratio >= 4.5, `contrast ${ratio} against fill`);
  assert.ok(ratio > 10, `cream fill keeps dark text (ratio ${ratio})`);
  assert.equal(flowColor.toLowerCase(), shown!.toLowerCase());

  // Pages view uses the same helper against the box fill.
  const settings = settingsFor({ format: "16:9", orientation: "landscape" });
  const view = buildPageView({ content, settings });
  const boxes = view.boxes.flat().filter((b) => b.fill === fill);
  assert.ok(boxes.length >= 1, "Pages view still has the cream fill");
  const pageShown = displayTextOnBackground(undefined, fill, "screen-dark", { pageBackground: pageBg });
  assert.equal(pageShown, shown, "Flow and Pages view agree on the fill text colour");
  // The lightened page colour would fail on this fill; we must not use it.
  const pageText = FORMAT_THEME["screen-dark"].text;
  const bad = contrastRatio(parseColor(pageText)!, parseColor(fill)!);
  assert.ok(bad < 4.5, `page text on cream would be ${bad}`);
});
