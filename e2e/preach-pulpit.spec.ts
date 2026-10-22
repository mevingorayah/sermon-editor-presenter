import { test, expect, type Page } from "@playwright/test";

/** Preach pulpit layout: sizes, bar, popover, cues, dark contrast, page view, timer. */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const VIEW_KEY = "sermon-editor-presenter:preach-view:v1";
const t = (text: string, marks?: unknown[]) => (marks ? { type: "text", text, marks } : { type: "text", text });
const body =
  "When the sower went out to sow, some seed fell along the path and the birds came and ate it up, and some fell on rocky ground where it had little soil.";

const content = {
  type: "doc",
  content: [
    { type: "title", content: [t("The Sower")] },
    { type: "paragraph", content: [t("Mark 4:1-20")] },
    { type: "heading", attrs: { level: 2 }, content: [t("The seed")] },
    { type: "paragraph", content: [t("Read slowly "), t("(pause)", [{ type: "italic" }, { type: "textStyle", attrs: { color: "#5c5c5c" } }]), t(" " + body)] },
    { type: "scripture", attrs: { citation: "Mark 4:3" }, content: [t("Listen! A farmer went out to sow his seed.")] },
    ...Array.from({ length: 40 }, (_, i) => ({ type: "paragraph", content: [t(`${i + 1}. ${body}`)] })),
  ],
};

async function seed(page: Page, opts: { theme?: "light" | "dark"; view?: "page" | "flow"; target?: string; format?: string } = {}) {
  const sermon = {
    id: "11111111-2222-4333-8444-555555555555",
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "The Sower",
    content,
    presentationSettings: {
        theme: opts.theme ?? "light",
        bionic: false,
        typeScaleStep: 0,
        lineHeight: 1.55,
        calibrationTarget: opts.target ?? "screen-16-9",
        // New sermons default to A4 portrait (#29); seed a page only when asked.
        page: opts.format ? { format: opts.format, orientation: "landscape" } : { format: "a4", orientation: "portrait" },
      },
  };
  await page.addInitScript(
    ([k, id, vk, v, doc]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return; // keep saves across reload
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem("sermon-editor-presenter:library:v1", doc);
      localStorage.setItem(k, id);
      localStorage.setItem(vk, v);
    },
    [ACTIVE_ID_KEY, sermon.id, VIEW_KEY, opts.view ?? "flow", JSON.stringify({ [sermon.id]: { doc: sermon, savedAt: null, dirty: true } })] as const,
  );
}

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, min: 21.5, max: 23 },
  { name: "tablet-landscape", width: 1334, height: 800, min: 26, max: 36 },
  { name: "tablet-portrait", width: 800, height: 1334, min: 26, max: 30 },
  { name: "laptop", width: 1440, height: 900, min: 30, max: 64 },
];

for (const vp of VIEWPORTS) {
  test(`flow: body size and line length (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seed(page);
    await page.goto("/preach", { waitUntil: "networkidle" });
    const p = page.locator("article p", { hasText: /^1\. When the sower/ }).first();
    await expect(p).toBeVisible({ timeout: 20_000 });
    const m = await p.evaluate((el) => {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects());
      const tops = [...new Set(rects.map((r) => Math.round(r.top)))];
      const chars = (el.textContent ?? "").length;
      return { fs, cpl: chars / Math.max(1, tops.length - 0.5), hyph: getComputedStyle(el).hyphens, lh: parseFloat(getComputedStyle(el).lineHeight) / fs };
    });
    expect(m.fs).toBeGreaterThanOrEqual(vp.min);
    expect(m.fs).toBeLessThanOrEqual(vp.max);
    if (vp.name !== "phone") {
      expect(m.cpl).toBeGreaterThanOrEqual(34);
      expect(m.cpl).toBeLessThanOrEqual(50);
    }
    expect(m.hyph).toBe("none");
    expect(m.lh).toBeCloseTo(1.55, 1);
  });
}

test("tap targets ≥ 44 px; ⚙ popover by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.goto("/preach", { waitUntil: "networkidle" });
  const gear = page.getByRole("button", { name: "Reading settings" });
  await expect(gear).toBeVisible({ timeout: 20_000 });
  await gear.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("[data-settings-panel]");
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement?.closest("[data-settings-panel]"))).toBe(true);
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-preach-bar] button, [data-preach-bar] a, [data-preach-bar] select"))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
  );
  expect(small).toBe(0);
  for (const label of ["Page", "Text size", "Leading", "Bionic", "Calibrate…", "Full screen", "Follow device rotation"]) await expect(panel.getByText(label, { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(gear).toBeFocused();
});

test("countdown timer: caps, STOP dims, bar fades while running but not while focused", async ({ page }) => {
  await page.clock.install();
  await seed(page);
  await page.goto("/preach", { waitUntil: "networkidle" });
  const bar = page.locator("[data-preach-bar]");
  const readout = page.locator("[data-timer-readout]");
  await expect(readout).toHaveText("30:00", { timeout: 20_000 });
  await page.getByRole("button", { name: "START" }).click();
  await page.mouse.move(5, 500);
  await page.locator("body").evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.clock.runFor(4_000);
  await expect(bar).toHaveAttribute("data-faded", "true");
  await page.mouse.move(200, 400);
  await expect(bar).toHaveAttribute("data-faded", "false");
  await page.getByRole("button", { name: "Reading settings" }).focus();
  await page.clock.runFor(4_000);
  await expect(bar).toHaveAttribute("data-faded", "false");
  await page.clock.runFor(25 * 60_000);
  await expect(readout).toHaveAttribute("data-tone", "warn");
  await expect(readout).toHaveCSS("color", "rgb(232, 134, 26)");
  await page.clock.runFor(6 * 60_000);
  await expect(readout).toHaveAttribute("data-tone", "over");
  await expect(readout).toHaveCSS("font-weight", "800");
  await page.getByRole("button", { name: "STOP" }).click();
  await expect(page.locator("[data-stopped=true]")).toBeVisible();
  await expect(bar).toHaveAttribute("data-faded", "false");
  await page.getByRole("button", { name: "RESET" }).click();
  await expect(readout).toHaveText("30:00");
  await expect(page.locator("[data-stopped=false]")).toBeVisible();
});

test("cues stay inline; dark contrast", async ({ page }) => {
  await seed(page, { theme: "dark" });
  await page.goto("/preach", { waitUntil: "networkidle" });
  const cue = page.locator("article [data-cue]").first();
  await expect(cue).toBeVisible({ timeout: 20_000 });
  const r = await cue.evaluate((el) => {
    const p = el.closest("p")!;
    const cs = getComputedStyle(el);
    return { display: cs.display, style: cs.fontStyle, ratio: parseFloat(cs.fontSize) / parseFloat(getComputedStyle(p).fontSize), sameLine: el.getClientRects().length >= 1 && el.getBoundingClientRect().top >= p.getBoundingClientRect().top - 1 && el.getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom + 1 };
  });
  expect(r.display).toBe("inline");
  expect(r.style).toBe("italic");
  expect(r.ratio).toBeLessThan(1);
  expect(r.sameLine).toBe(true);
  const stage = page.locator("[data-reading-mode]").first();
  await expect(stage).toHaveCSS("background-color", "rgb(20, 18, 16)");
  await expect(page.locator("article p", { hasText: /^1\. When/ }).first()).toHaveCSS("color", "rgb(236, 230, 218)");
});

for (const target of ["screen-16-9", "paper-a4"]) {
  test(`page view: one page, fitted, turns by key and swipe (${target})`, async ({ page }) => {
    await page.setViewportSize({ width: 1334, height: 800 });
    await seed(page, { view: "page", target });
    await page.goto("/preach", { waitUntil: "networkidle" });
    const view = page.locator("[data-page-view]");
    await expect(view).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("section[data-page]")).toHaveCount(1);
    const count = Number(await view.getAttribute("data-page-count"));
    expect(count).toBeGreaterThan(1);
    const box = await page.locator("section[data-page]").boundingBox();
    expect(box!.height).toBeLessThanOrEqual(800);
    expect(box!.width).toBeLessThanOrEqual(1334);
    await page.locator("body").click({ position: { x: 5, y: 790 } });
    for (const [key, idx] of [["ArrowRight", 1], ["Space", 2], ["PageUp", 1], ["ArrowLeft", 0], ["PageDown", 1], ["ArrowDown", 1], ["ArrowRight", 2], ["ArrowUp", 2], ["PageUp", 1]] as const) {
      await page.keyboard.press(key);
      await expect(view).toHaveAttribute("data-page-index", String(idx));
    }
    const b = (await view.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(view).toHaveAttribute("data-page-index", "2");
  });
}

const FORMATS = ["fit", "a4", "a5", "letter", "half-letter", "4-3", "16-10", "16-9"];
for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }, { width: 2112, height: 1320 }, { width: 800, height: 1280 }, { width: 1000, height: 300 }]) {
  test(`⚙ Page: every format re-renders live, saved, never clipped (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await seed(page, { view: "page" });
    await page.goto("/preach", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reading settings" }).click();
    const panel = page.locator("[data-settings-panel]");
    await expect(panel.locator("[data-page-controls]")).toBeVisible({ timeout: 20_000 });
    for (const f of FORMATS) {
      await panel.locator(`[data-format="${f}"]`).click();
      await expect(panel.locator(`[data-format="${f}"]`)).toHaveAttribute("aria-pressed", "true");
      const sec = (await page.locator("section[data-page]").boundingBox())!;
      expect(sec.x).toBeGreaterThanOrEqual(-1);
      expect(sec.y).toBeGreaterThanOrEqual(-1);
      expect(sec.x + sec.width).toBeLessThanOrEqual(vp.width + 1);
      expect(sec.y + sec.height).toBeLessThanOrEqual(vp.height + 1);
      const clipped = await page.evaluate(() => {
        const s = document.querySelector("section[data-page]")!.getBoundingClientRect();
        return Array.from(document.querySelectorAll("section[data-page] [data-line]")).filter((l) => {
          const r = l.getBoundingClientRect();
          // Off the page vertically, or text wider than its line box (runs off the side).
          return r.bottom > s.bottom + 1 || r.top < s.top - 1 || r.right > s.right + 1 || (l as HTMLElement).scrollWidth > (l as HTMLElement).clientWidth + 1;
        }).length;
      });
      expect(clipped).toBe(0);
    }
    // Extremes: 72 pt with 2in margins and 2.0 line spacing still never runs off the page.
    await panel.locator('[data-format="half-letter"]').click();
    for (let i = 0; i < 24; i++) await panel.getByRole("button", { name: "Larger text" }).click({ force: true }).catch(() => {});
    await expect(panel.locator("[data-text-pt]")).toHaveText("72 pt");
    for (const [name, v] of [["Margins", "2"], ["Line spacing", "2"]] as const) {
      await panel.getByRole("button", { name: new RegExp(`^${name}: .* tap to type`) }).click();
      const box = panel.getByRole("textbox", { name: new RegExp(name) });
      await box.fill(v);
      await box.press("Enter");
    }
    const over = await page.evaluate(() => {
      const s = document.querySelector("section[data-page]")!.getBoundingClientRect();
      return Array.from(document.querySelectorAll("section[data-page] [data-line]")).filter((l) => {
        const r = l.getBoundingClientRect();
        return r.bottom > s.bottom + 1 || r.right > s.right + 1 || (l as HTMLElement).scrollWidth > (l as HTMLElement).clientWidth + 1;
      }).length;
    });
    expect(over).toBe(0);
    await panel.locator('[data-reset-spacing]').click();
    await panel.locator('[data-format="16-10"]').click();
    await panel.getByRole("button", { name: "Larger text" }).click();
    await expect(panel.locator("[data-text-pt]")).toHaveText("30 pt");
    // Saved to the sermon's browser copy (local-only storage, #32) before reloading.
    await expect.poll(() => page.evaluate(() => localStorage.getItem("sermon-editor-presenter:library:v1") ?? "")).toContain('"16:10"');
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Reading settings" }).click();
    await expect(page.locator('[data-format="16-10"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("[data-text-pt]")).toHaveText("30 pt");
  });
}

test("page view: 16:9 fills a 16:9 screen; toggle to flow", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await seed(page, { view: "page", format: "16:9" });
  await page.goto("/preach", { waitUntil: "networkidle" });
  await expect(page.locator("[data-page-view]")).toHaveAttribute("data-fill", "true", { timeout: 20_000 });
  const box = (await page.locator("section[data-page]").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(1595);
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.locator("[data-settings-panel]").getByRole("button", { name: "Flow" }).click();
  await expect(page.locator("article p", { hasText: /^1\. When/ }).first()).toBeVisible();
});

test("⚙ Spacing: sliders, tap-to-type, reset keeps format", async ({ page }) => {
  await page.setViewportSize({ width: 1334, height: 800 });
  await seed(page, { view: "page" });
  await page.goto("/preach", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Reading settings" }).click();
  const panel = page.locator("[data-settings-panel]");
  await panel.locator('[data-format="a4"]').click();
  const before = Number(await page.locator("[data-page-view]").getAttribute("data-page-count"));
  await panel.getByRole("button", { name: /Line spacing: .* tap to type/ }).click();
  const box = panel.getByRole("textbox", { name: /Line spacing/ });
  await box.fill("2");
  await box.press("Enter");
  await expect(panel.getByRole("button", { name: /Line spacing: 2 ×/ })).toBeVisible();
  await expect.poll(async () => Number(await page.locator("[data-page-view]").getAttribute("data-page-count"))).toBeGreaterThan(before);
  await panel.locator("[data-each-side]").click();
  await expect(panel.locator("[data-slider]")).toHaveCount(6);
  for (const el of await panel.locator("button, input:not([type=checkbox]), label:has(input[type=checkbox]), [data-slider] label").all()) {
    const b = await el.boundingBox();
    if (b && b.width > 0) expect(Math.min(b.height, b.width)).toBeGreaterThanOrEqual(44);
  }
  await panel.locator("[data-reset-spacing]").click();
  await expect(panel.getByRole("button", { name: /Line spacing: 1.55 ×/ })).toBeVisible();
  await expect(panel.locator('[data-format="a4"]')).toHaveAttribute("aria-pressed", "true");
});
