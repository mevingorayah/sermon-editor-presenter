import { test, expect, type Page } from "@playwright/test";

/**
 * Edit layout PR: collapsible left panel, floating Blocks palette and
 * Formatting panel, compact top bar, full-width scroll container.
 * Made-up fixture text only.
 */

const ID = "e1e1e1e1-aaaa-4bbb-8ccc-0123456789ab";
const LIB_KEY = "sermon-editor-presenter:library:v1";
const KEYS = {
  left: "sermon-editor-presenter:edit-left-panel:v1",
  blocks: "sermon-editor-presenter:edit-blocks-palette:v1",
  formatting: "sermon-editor-presenter:edit-formatting-panel:v1",
};

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. " +
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat éàçœ.";

function fixture(page?: { format: string; orientation: string }) {
  const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  return {
    id: ID,
    title: "Layout fixture",
    notes: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    content: {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Layout fixture" }] },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "First point heading" }] },
        para("Alpha " + LONG),
        para("Bravo " + LONG),
        para("Charlie " + LONG),
      ],
    },
    presentationSettings: {
      theme: "light",
      bionic: false,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: "paper-a4",
      ...(page ? { page } : {}),
    },
  };
}

async function seed(
  page: Page,
  opts: { pageFmt?: { format: string; orientation: string }; flags?: Record<string, string> } = {},
) {
  const lib = JSON.stringify({ [ID]: { doc: fixture(opts.pageFmt), savedAt: null, dirty: false } });
  await page.addInitScript(
    ([lib, id, flags]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem("sermon-editor-presenter:library:v1", lib as string);
      localStorage.setItem("sermon-editor-presenter:active-id:v1", id as string);
      for (const [k, v] of Object.entries(flags as Record<string, string>)) localStorage.setItem(k, v);
    },
    [lib, ID, opts.flags ?? {}] as const,
  );
}

async function open(page: Page) {
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toContainText("Charlie", { timeout: 20_000 });
}

const pm = (page: Page) => page.locator(".ProseMirror");
const leftPanel = (page: Page) => page.getByTestId("left-panel");
const formatting = (page: Page) => page.locator("#formatting-panel");

async function rect(page: Page, sel: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || (el as HTMLElement).closest("[hidden]")) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } : null;
  }, sel);
}

/** Line-start character offsets per block: identical before and after a re-scale. */
async function lineBreaks(page: Page) {
  return pm(page).evaluate((root) => {
    const out: number[][] = [];
    for (const block of Array.from(root.querySelectorAll<HTMLElement>("p, h1, h2"))) {
      const starts: number[] = [];
      let last = -Infinity;
      let offset = 0;
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent ?? "";
        for (let i = 0; i < t.length; i++) {
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const r = range.getClientRects()[0];
          if (r && r.top > last + r.height / 2) {
            starts.push(offset + i);
            last = r.top;
          }
        }
        offset += t.length;
      }
      out.push(starts);
    }
    return out;
  });
}

/** The scroll container spans to the window's right edge (scrollbar at the far right). */
async function expectScrollerToRightEdge(page: Page) {
  const r = await page.evaluate(() => {
    const sc = document.querySelector<HTMLElement>("[data-testid=edit-scroller]")!;
    const b = sc.getBoundingClientRect();
    const panel = document.querySelector<HTMLElement>("#formatting-panel");
    const pb = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
    return {
      right: b.right,
      inner: window.innerWidth,
      sbw: sc.offsetWidth - sc.clientWidth,
      panelRight: pb && getComputedStyle(panel!).position === "absolute" ? pb.right : null,
    };
  });
  expect(Math.round(r.right)).toBe(r.inner);
  // The floating Formatting panel sits just left of the scrollbar.
  if (r.panelRight !== null) expect(r.panelRight).toBeLessThanOrEqual(r.inner - r.sbw - 11);
}

async function expectNoOverlap(page: Page) {
  const text = (await rect(page, ".ProseMirror"))!;
  const left = await rect(page, "[data-testid=left-panel]");
  const palette = await rect(page, "[data-testid=blocks-palette]");
  const fmt = await page.evaluate(() => {
    const p = document.querySelector<HTMLElement>("#formatting-panel");
    if (!p || p.hidden || getComputedStyle(p).position !== "absolute") return null;
    return p.getBoundingClientRect().left;
  });
  if (left) expect(left.right, "left panel vs text").toBeLessThanOrEqual(text.left);
  if (palette) expect(palette.right, "Blocks palette vs text").toBeLessThanOrEqual(text.left);
  if (fmt !== null) expect(fmt, "Formatting panel vs text").toBeGreaterThanOrEqual(text.right);
}

test.describe("Edit layout", () => {
  test("collapse and reopen each panel; state persists across reload", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);
    await open(page);
    // Defaults at ≥1280: left expanded, palette shown, Formatting open.
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByTestId("blocks-palette")).toHaveAttribute("data-collapsed", "false");
    await expect(formatting(page)).toBeVisible();

    await page.getByTestId("left-panel-toggle").click();
    await page.getByTestId("blocks-palette-toggle").click();
    await formatting(page).getByRole("button", { name: "Close formatting" }).click();
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "true");
    const railBox = await leftPanel(page).boundingBox();
    expect(Math.round(railBox!.width)).toBe(48);
    await expect(page.getByTestId("blocks-palette")).toHaveAttribute("data-collapsed", "true");
    await expect(formatting(page)).toBeHidden();

    await page.reload({ waitUntil: "networkidle" });
    await expect(pm(page)).toContainText("Charlie", { timeout: 20_000 });
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "true");
    await expect(page.getByTestId("blocks-palette")).toHaveAttribute("data-collapsed", "true");
    await expect(formatting(page)).toBeHidden();

    // Rail icon reopens the panel on that tab; "+" restores the palette; toggle reopens Formatting.
    await page.getByTestId("rail-find").click();
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByRole("tab", { name: "Find", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByPlaceholder("Find in sermon…")).toBeVisible();
    await page.getByTestId("blocks-palette-toggle").click();
    await page.getByTestId("formatting-toggle").click();
    await expect(formatting(page)).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(pm(page)).toContainText("Charlie", { timeout: 20_000 });
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "false");
    await expect(page.getByRole("tab", { name: "Find", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("blocks-palette")).toHaveAttribute("data-collapsed", "false");
    await expect(formatting(page)).toBeVisible();

    // Ctrl+\ toggles the left panel.
    await pm(page).locator("p", { hasText: "Alpha" }).click();
    await page.keyboard.press("Control+Backslash");
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "true");
    await page.keyboard.press("Control+Backslash");
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "false");

    // Formatting still opens when a block is selected.
    await formatting(page).getByRole("button", { name: "Close formatting" }).click();
    await expect(formatting(page)).toBeHidden();
    await pm(page).locator("p", { hasText: "Charlie" }).click();
    await expect(formatting(page)).toBeVisible();
    await expect(formatting(page).getByRole("heading", { name: "Formatting" })).toBeVisible();
  });

  test("left panel default: collapsed below 1280 px, expanded at 1280", async ({ page }) => {
    await page.setViewportSize({ width: 1279, height: 800 });
    await seed(page);
    await open(page);
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "true");
    await page.evaluate(() => {
      localStorage.removeItem("sermon-editor-presenter:edit-left-panel:v1");
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(pm(page)).toContainText("Charlie", { timeout: 20_000 });
    await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "false");
  });

  const BLOCKS: { id: string; label: string; sel: string }[] = [
    { id: "heading1", label: "Point heading", sel: "h1:not([data-sermon-title])" },
    { id: "paragraph", label: "Paragraph", sel: "p" },
    { id: "scripture", label: "Scripture", sel: ".sermon-scripture" },
    { id: "verseSnippet", label: "Verse snippet", sel: "[data-verse-snippet]" },
    { id: "quote", label: "Quote", sel: ".sermon-quote" },
    { id: "illustration", label: "Illustration", sel: ".sermon-illustration" },
    { id: "cue", label: "Pause cue", sel: "p" },
    { id: "heading2", label: "Subpoint heading", sel: "h2" },
    { id: "section1", label: "1-column section", sel: "[data-section]" },
    { id: "section2", label: "2-column section", sel: "[data-section]" },
    { id: "section3", label: "3-column section", sel: "[data-section]" },
  ];

  const topKinds = (page: Page) =>
    pm(page).evaluate((root, blocks) =>
      Array.from(root.children).map((c) => {
        const text = (c.textContent ?? "").trim().slice(0, 7);
        if (/^(Alpha|Bravo|Charlie)/.test(text)) return text.split(" ")[0];
        if (text.startsWith("[Pause")) return "cue";
        for (const b of blocks) {
          if (b.id === "cue" || b.id === "paragraph") continue;
          if (c.matches(b.sel) || c.querySelector(b.sel)) {
            if (b.id.startsWith("section")) return `section${c.querySelectorAll("[data-column]").length}`;
            return b.id;
          }
        }
        return c.matches("p") ? "paragraph" : c.tagName.toLowerCase();
      }), BLOCKS);

  /** A palette button: in the strip, or under "More". */
  async function paletteButton(page: Page, id: string) {
    const btn = page.getByTestId(`palette-${id}`);
    if (!(await btn.isVisible())) {
      const more = page.getByTestId("palette-more");
      if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
    }
    await expect(btn).toBeVisible();
    return btn;
  }

  test("every block inserts by click (at the cursor) and by drag (onto the page)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);
    await open(page);
    const strip = page.getByTestId("blocks-palette");
    const strip0 = await strip.boundingBox();
    expect(Math.round(strip0!.width)).toBe(56);
    // Spec order in the strip.
    const order = await strip.locator("[data-palette-item]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(order.slice(0, 7)).toEqual(["Point heading", "Paragraph", "Scripture", "Verse snippet", "Quote", "Illustration", "Pause cue"]);
    for (const b of BLOCKS) {
      const btn = page.getByTestId(`palette-${b.id}`);
      if (await btn.isVisible()) {
        await expect(btn).toHaveAttribute("aria-label", b.label);
        await expect(btn).toHaveAttribute("title", b.label);
      }
    }

    for (const b of BLOCKS) {
      // Click: inserts after the block holding the cursor (Alpha).
      await pm(page).locator("p", { hasText: "Alpha" }).click();
      const before = await topKinds(page);
      const alpha = before.indexOf("Alpha");
      await (await paletteButton(page, b.id)).click();
      const after = await topKinds(page);
      expect(after.length, `${b.id} click`).toBe(before.length + 1);
      expect(after[alpha + 1], `${b.id} click position`).toBe(b.id);
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);
      await page.keyboard.press("ControlOrMeta+z");
    }

    for (const b of BLOCKS) {
      // Drag: drop just above Charlie.
      const before = await topKinds(page);
      const charlie = before.indexOf("Charlie");
      await pm(page).locator("p", { hasText: "Charlie" }).scrollIntoViewIfNeeded();
      const btn = await paletteButton(page, b.id);
      const bb = (await btn.boundingBox())!;
      const target = (await pm(page).locator("p", { hasText: "Charlie" }).boundingBox())!;
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.mouse.down();
      await page.mouse.move(bb.x + 40, bb.y + 10, { steps: 3 });
      await page.mouse.move(target.x + target.width / 2, target.y + 3, { steps: 8 });
      await expect(page.getByTestId("drop-line"), `${b.id} drop line`).toBeVisible();
      await page.mouse.up();
      const after = await topKinds(page);
      expect(after.length, `${b.id} drag`).toBe(before.length + 1);
      expect(after[charlie], `${b.id} drag position`).toBe(b.id);
      expect(after[charlie + 1]).toBe("Charlie");
      await page.mouse.click(5, 5);
    }
    // Words of the original blocks never changed.
    await expect(pm(page)).toContainText("Alpha " + LONG.slice(0, 40));
    await expect(pm(page)).toContainText("Charlie " + LONG.slice(0, 40));
  });

  async function withTool(page: Page, testIdOrLabel: { testId?: string; label?: string }, act: (page: Page) => Promise<void>) {
    const bar = page.getByRole("toolbar", { name: "Text formatting" });
    const loc = testIdOrLabel.testId ? bar.getByTestId(testIdOrLabel.testId) : bar.getByLabel(testIdOrLabel.label!, { exact: true });
    if (!(await loc.first().isVisible())) {
      await bar.getByTestId("more-tools").click();
      await expect(page.locator("[data-overflow-menu]")).toBeVisible();
    }
    await expect(loc.first()).toBeVisible();
    await act(page);
  }

  async function exerciseTopBar(page: Page) {
    const bar = page.getByRole("toolbar", { name: "Text formatting" });
    const bravo = () => pm(page).locator("p, h1, h2", { hasText: "Bravo" }).first();
    const selectBravo = async () => {
      await bravo().click();
      await page.keyboard.press("Home");
    };

    // Style dropdown shows the current style and changes it.
    await selectBravo();
    await withTool(page, { label: "Style" }, async () => {
      await expect(bar.getByLabel("Style", { exact: true })).toHaveValue("paragraph");
      await bar.getByLabel("Style", { exact: true }).selectOption("heading2");
    });
    await expect(pm(page).locator("h2", { hasText: "Bravo" })).toBeVisible();
    await page.keyboard.press("Escape");

    // Undo / Redo.
    await withTool(page, { label: "Undo" }, async () => {
      await bar.getByLabel("Undo", { exact: true }).click();
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await withTool(page, { label: "Redo" }, async () => {
      await bar.getByLabel("Redo", { exact: true }).click();
    });
    await expect(pm(page).locator("h2", { hasText: "Bravo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await withTool(page, { label: "Undo" }, async () => {
      await bar.getByLabel("Undo", { exact: true }).click();
    });
    await page.keyboard.press("Escape");

    // Font (name truncated at 140 px).
    await selectBravo();
    await page.keyboard.press("Shift+End");
    await withTool(page, { label: "Font family" }, async () => {
      const font = bar.getByLabel("Font family");
      expect((await font.boundingBox())!.width).toBeLessThanOrEqual(140.5);
      await font.selectOption("lora");
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" }).locator("span[style*='font-family']").first()).toBeVisible();
    await page.keyboard.press("Escape");

    // Size: block text size in pt.
    await selectBravo();
    await withTool(page, { testId: "font-size" }, async () => {
      await bar.getByTestId("font-size").fill("20");
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" })).toHaveCSS("font-size", "26.6667px");
    await page.keyboard.press("Escape");

    // Alignment: one button, four options.
    await selectBravo();
    await withTool(page, { testId: "align-trigger" }, async () => {
      await bar.getByTestId("align-trigger").click();
      const opts = page.getByRole("group", { name: "Alignment options" }).getByRole("button");
      await expect(opts).toHaveCount(4);
      await page.getByRole("button", { name: "Align center" }).click();
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" })).toHaveCSS("text-align", "center");
    await expect(bar.getByTestId("align-trigger").or(page.getByLabel("Alignment: Center")).first()).toBeAttached();

    // Spacing popover: letter and line sliders, same ranges.
    await selectBravo();
    await withTool(page, { testId: "spacing-trigger" }, async () => {
      await bar.getByTestId("spacing-trigger").click();
      const letter = page.getByLabel("Letter spacing slider");
      await expect(letter).toHaveAttribute("min", "-0.05");
      await expect(letter).toHaveAttribute("max", "0.3");
      const line = page.getByLabel("Line spacing slider");
      await expect(line).toHaveAttribute("min", "1");
      await expect(line).toHaveAttribute("max", "2.5");
      await page.getByTestId("line-spacing").fill("1.8");
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" })).toHaveAttribute("style", /line-height/);
    await page.keyboard.press("Escape");

    // Colour: text colour and highlight.
    await selectBravo();
    await page.keyboard.press("Shift+End");
    await withTool(page, { label: "Text color" }, async () => {
      await bar.getByLabel("Text color", { exact: true }).click();
      await page.getByRole("listbox", { name: "Color palette" }).getByRole("option", { name: "Crimson", exact: true }).click();
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" }).locator("span[style*='color']").first()).toBeVisible();
    await selectBravo();
    await page.keyboard.press("Shift+End");
    await withTool(page, { label: "Highlight" }, async () => {
      await bar.getByLabel("Highlight", { exact: true }).click();
      await page.getByRole("listbox", { name: "Highlight palette" }).getByRole("option").nth(1).click();
    });
    await expect(pm(page).locator("p", { hasText: "Bravo" }).locator("mark").first()).toBeVisible();

    // Formatting toggle at the far right.
    const toggle = bar.getByTestId("formatting-toggle");
    const tb = (await toggle.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(barBox.x + barBox.width - (tb.x + tb.width)).toBeLessThan(20);
    const wasOpen = (await toggle.getAttribute("aria-pressed")) === "true";
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", wasOpen ? "false" : "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", wasOpen ? "true" : "false");
  }

  test("every top-bar tool works (wide: one row, 18 px icons, 36 px hit area)", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await seed(page);
    await open(page);
    const bar = page.getByRole("toolbar", { name: "Text formatting" });
    await expect(bar.getByTestId("more-tools")).toHaveCount(0);
    const order = await bar.locator("[data-tool-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tool-group")));
    expect(order).toEqual(["style", "history", "font", "size", "align", "spacing", "colour"]);
    const undo = (await bar.getByLabel("Undo", { exact: true }).boundingBox())!;
    expect(Math.round(undo.height)).toBe(36);
    for (const l of [bar.getByLabel("Style", { exact: true }), bar.getByLabel("Font family"), bar.getByTestId("font-size"), bar.getByTestId("align-trigger"), bar.getByTestId("spacing-trigger")]) {
      expect(Math.round((await l.boundingBox())!.height)).toBe(36);
    }
    const icon = (await bar.getByTestId("align-trigger").locator("svg").boundingBox())!;
    expect(Math.round(icon.width)).toBe(18);
    const barBox = (await bar.boundingBox())!;
    expect(barBox.height).toBeLessThan(56);
    await exerciseTopBar(page);
  });

  test("narrow: tools move into ⋯ from the right, the bar never wraps, and they still work", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await seed(page, { flags: { [KEYS.left]: "expanded" } });
    await open(page);
    const bar = page.getByRole("toolbar", { name: "Text formatting" });
    await expect(bar.getByTestId("more-tools")).toBeVisible();
    const inline = await bar.locator(":scope > [data-tool-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tool-group")));
    const all = ["style", "history", "font", "size", "align", "spacing", "colour"];
    expect(inline).toEqual(all.slice(0, inline.length));
    expect(inline.length).toBeLessThan(all.length);
    // One row: every inline control shares the bar's single line.
    const tops = await bar.locator(":scope > *").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
    await bar.getByTestId("more-tools").click();
    const menuGroups = await page.locator("[data-overflow-menu] [data-tool-group]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tool-group")));
    expect(menuGroups).toEqual(all.slice(inline.length));
    await page.keyboard.press("Escape");
    await exerciseTopBar(page);
  });

  const FORMATS = [
    { name: "A4 portrait", page: { format: "a4", orientation: "portrait" } },
    { name: "A4 landscape", page: { format: "a4", orientation: "landscape" } },
    { name: "tablet landscape", page: { format: "16:10", orientation: "landscape" } },
  ];
  for (const f of FORMATS) {
    for (const width of [1280, 1024, 800]) {
      test(`${f.name} at ${width} px: no panel covers the text; line breaks identical after collapsing`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await seed(page, { pageFmt: f.page, flags: { [KEYS.left]: "expanded", [KEYS.formatting]: "open", [KEYS.blocks]: "expanded" } });
        await open(page);
        const sheet = page.getByTestId("edit-page");
        const pageW = Number(await sheet.getAttribute("data-page-width"));
        const expectedW = f.page.format === "a4" ? (f.page.orientation === "portrait" ? 794 : 1123) : 960;
        expect(pageW).toBe(expectedW);
        await expectNoOverlap(page);
        await expectScrollerToRightEdge(page);
        const s0 = Number(await sheet.getAttribute("data-scale"));
        const lines0 = await lineBreaks(page);
        expect(lines0.some((l) => l.length > 1)).toBe(true);

        await page.getByTestId("left-panel-toggle").click();
        await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "true");
        const s1 = Number(await sheet.getAttribute("data-scale"));
        expect(s1).toBeGreaterThanOrEqual(s0);
        expect(await lineBreaks(page)).toEqual(lines0);
        await expectNoOverlap(page);
        await expectScrollerToRightEdge(page);

        if (await formatting(page).isVisible()) {
          await formatting(page).getByRole("button", { name: "Close formatting" }).click();
          await expect(formatting(page)).toBeHidden();
        }
        await page.getByTestId("blocks-palette-toggle").click();
        const s2 = Number(await sheet.getAttribute("data-scale"));
        expect(s2).toBeGreaterThanOrEqual(s1);
        expect(await lineBreaks(page)).toEqual(lines0);
        await expectNoOverlap(page);
        await expectScrollerToRightEdge(page);
        // Page keeps its aspect (only the scale changes).
        const box = (await sheet.boundingBox())!;
        expect(Math.abs(box.width - pageW * s2)).toBeLessThan(1.5);
      });
    }
  }

  test("wheel over the grey margin and the palette scrolls the page", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await seed(page, { flags: { [KEYS.left]: "expanded" } });
    await open(page);
    // Make the sermon taller than the window.
    await pm(page).locator("p", { hasText: "Charlie" }).click();
    await page.keyboard.press("End");
    for (let i = 0; i < 25; i++) await page.keyboard.press("Enter");
    const sc = page.getByTestId("edit-scroller");
    await sc.evaluate((el) => (el.scrollTop = 0));
    const scr = (await sc.boundingBox())!;
    const pageBox = (await page.getByTestId("edit-page").boundingBox())!;
    // Grey margin between the page and the Formatting panel / below the palette.
    await page.mouse.move(scr.x + 30, scr.y + scr.height - 20);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => sc.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const t1 = await sc.evaluate((el) => el.scrollTop);
    const pal = (await page.getByTestId("blocks-palette").boundingBox())!;
    await page.mouse.move(pal.x + pal.width / 2, pal.y + pal.height / 2);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => sc.evaluate((el) => el.scrollTop)).toBeGreaterThan(t1);
    expect(pageBox.x).toBeGreaterThan(scr.x);
  });

  async function smallControls(page: Page) {
    return page.evaluate(() => {
      const bad: string[] = [];
      const sel = ["input", "select", "textarea", "button", "a[href]", "[role=tab]"].map((t) => `[data-edit-mode] ${t}`).join(", ");
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        if (el.closest(".ProseMirror")) continue;
        if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "file")) continue;
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden" || el.closest("[hidden]") || el.classList.contains("visually-hidden")) continue;
        let target: HTMLElement = el;
        if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) target = el.closest("label") ?? el;
        const r = target.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        if (r.width < 43.5 || r.height < 43.5) {
          const name = el.getAttribute("aria-label") || target.textContent?.trim().slice(0, 30) || el.outerHTML.slice(0, 60);
          bad.push(`${name}: ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return bad;
    });
  }

  test.describe("touch", () => {
    test.use({ hasTouch: true });
    for (const vp of [
      { width: 1280, height: 800, name: "landscape tablet" },
      { width: 800, height: 1280, name: "portrait tablet (bottom sheet)" },
    ]) {
      test(`${vp.name}: touch targets ≥ 44 px; scroller reaches the right edge open and collapsed`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await seed(page, { pageFmt: { format: "16:10", orientation: "landscape" }, flags: { [KEYS.left]: "expanded" } });
        await open(page);
        expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
        await pm(page).locator("p", { hasText: "Bravo" }).click();
        await expect(formatting(page)).toBeVisible();
        const position = await formatting(page).evaluate((el) => getComputedStyle(el).position);
        expect(position).toBe(vp.width >= 1024 ? "absolute" : "fixed");
        await expectScrollerToRightEdge(page);
        expect(await smallControls(page), "controls under 44x44").toEqual([]);
        for (const id of ["spacing-trigger", "align-trigger"]) {
          const t = page.getByTestId(id);
          if (!(await t.isVisible())) continue;
          await t.click();
          expect(await smallControls(page), `${id} popover controls under 44x44`).toEqual([]);
          await page.keyboard.press("Escape");
        }
        const more = page.getByTestId("more-tools");
        if (await more.isVisible()) {
          await more.click();
          expect(await smallControls(page), "⋯ menu controls under 44x44").toEqual([]);
          await page.keyboard.press("Escape");
        }

        await formatting(page).getByRole("button", { name: "Close formatting" }).click();
        await page.getByTestId("left-panel-toggle").click();
        await expect(leftPanel(page)).toHaveAttribute("data-collapsed", "true");
        await expectScrollerToRightEdge(page);
        expect(await smallControls(page), "collapsed: controls under 44x44").toEqual([]);
      });
    }
  });

  test("layout changes never change the saved sermon", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page);
    await open(page);
    const read = () =>
      page.evaluate((k) => {
        const lib = JSON.parse(localStorage.getItem(k) ?? "{}");
        const e = Object.values(lib)[0] as { doc: { content: unknown; title: string; notes: string; presentationSettings: unknown } };
        return JSON.stringify({ c: e.doc.content, t: e.doc.title, n: e.doc.notes, p: e.doc.presentationSettings });
      }, LIB_KEY);
    const before = await read();
    await page.getByTestId("left-panel-toggle").click();
    await page.keyboard.press("Control+Backslash");
    for (const t of ["rail-outline", "rail-find", "rail-sermons"]) {
      if (await page.getByTestId(t).isVisible()) await page.getByTestId(t).click();
    }
    await page.getByRole("tab", { name: "Outline", exact: true }).click();
    await page.getByTestId("blocks-palette-toggle").click();
    await page.getByTestId("blocks-palette-toggle").click();
    await page.getByTestId("formatting-toggle").click();
    await page.getByTestId("formatting-toggle").click();
    for (const w of [1280, 1024, 800, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    await expect(pm(page)).toContainText("Charlie", { timeout: 20_000 });
    await page.waitForTimeout(1000);
    expect(await read()).toEqual(before);
    await expect(pm(page)).toContainText("Alpha " + LONG);
  });
});
