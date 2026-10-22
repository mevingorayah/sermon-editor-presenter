/** @jsxRuntime automatic */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCalibratedSnapshot } from "@/lib/calibration";
import { exportPages } from "@/lib/sermon/export/pages";
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

for (const target of ["screen-16-9", "paper-a4"]) {
  test(`page view breaks equal the export layout (${target})`, () => {
    const snap = buildCalibratedSnapshot({ target, typeScaleStep: 0, lineHeight: 1.55, theme: "light", content: doc } as never);
    const ref = exportPages(snap);
    const view = buildPageView({ content: doc as never, target, lineHeight: 1.55 as never, theme: "light" });
    assert.ok(ref.pages.length > 1);
    assert.equal(view.pages.length, ref.pages.length);
    view.pages.forEach((pg, i) => {
      assert.equal(pg.length, ref.pages[i].lines.length);
      pg.forEach((l, j) => assert.equal(l.y, ref.pages[i].lines[j].y));
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

test("page settings adapter: formats, orientation, text size ≥ 24 pt", async () => {
  const m = await import("@/lib/reading/pageSettings");
  assert.equal(m.toPatch({ format: "tablet", orientation: "portrait", textStep: 0 as never }).calibrationTarget, "tablet-portrait");
  assert.equal(m.toPatch({ format: "tablet", orientation: "landscape", textStep: 0 as never }).calibrationTarget, "screen-16-10");
  assert.equal(m.toPatch({ format: "a4", orientation: "landscape", textStep: 0 as never }).calibrationTarget, "paper-a4");
  for (const f of m.PAGE_FORMATS) {
    const c = { format: f.id, orientation: m.orientationsFor(f.id)[0], textStep: 1 as never };
    const back = m.fromSettings(m.toPatch(c) as never);
    if (f.id !== "16-10") assert.equal(back.format, f.id);
    assert.equal(back.textStep, 1);
  }
  assert.ok(m.allowedSteps().every((s) => m.bodyPt(s) >= 24));
  assert.equal(m.deviceOrientation(800, 1280), "portrait");
});

test("re-layout keeps the reader on the same paragraph", () => {
  const a = buildPageView({ content: doc as never, target: "paper-a4", lineHeight: 1.55 as never, theme: "light" });
  const b = buildPageView({ content: doc as never, target: "screen-16-9", lineHeight: 1.55 as never, theme: "light" });
  const block = a.pages[2][0].blockIndex;
  const pb = pageOfBlock(b.pages, block);
  assert.ok(b.pages[pb].some((l) => l.blockIndex === block));
});
