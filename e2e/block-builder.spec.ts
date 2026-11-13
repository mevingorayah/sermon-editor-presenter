import { test, expect, type Page } from "@playwright/test";

/** Phase 3 block builder: insert, drag, style, column drop, tablet sheet. */

async function openFresh(page: Page, width = 1440, height = 1000) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
    localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
  });
  await page.setViewportSize({ width, height });
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  const newBtn = page.getByRole("button", { name: /new sermon/i }).first();
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForTimeout(500);
  }
}

const pm = (page: Page) => page.locator(".ProseMirror");

async function seedBlocks(page: Page) {
  await pm(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type("Alpha block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bravo block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Charlie block");
}

const topTexts = (page: Page) =>
  pm(page).evaluate((el) => Array.from(el.children).map((c) => (c.textContent ?? "").trim()));

test("insert a block via the + inserter", async ({ page }) => {
  await openFresh(page);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Alpha block" }).hover();
  await page.getByTestId("inserter-0").click({ force: true });
  const menu = page.getByRole("dialog", { name: "Insert block" });
  await expect(menu).toBeVisible();
  await menu.getByRole("searchbox").or(menu.getByLabel("Search blocks")).fill("quote");
  await menu.getByRole("option", { name: "Quote" }).click();
  await page.keyboard.type("Inserted quote");
  await expect(pm(page).locator(".sermon-quote")).toHaveText("Inserted quote");
  expect(await topTexts(page)).toEqual(["Alpha block", "Inserted quote", "Bravo block", "Charlie block"]);
});

test("drag a block to reorder; undo and keyboard move keep the words", async ({ page }) => {
  await openFresh(page);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Alpha block" }).click();
  const handle = page.getByTestId("drag-handle");
  await expect(handle).toBeVisible();
  const target = await pm(page).locator("p", { hasText: "Charlie block" }).boundingBox();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb!.x + 10, target!.y + target!.height - 2, { steps: 10 });
  await expect(page.getByTestId("drop-line")).toBeVisible();
  await page.mouse.up();
  expect(await topTexts(page)).toEqual(["Bravo block", "Charlie block", "Alpha block"]);
  await pm(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await topTexts(page)).toEqual(["Alpha block", "Bravo block", "Charlie block"]);
  await pm(page).locator("p", { hasText: "Alpha block" }).click();
  await page.keyboard.press("Alt+ArrowDown");
  expect(await topTexts(page)).toEqual(["Bravo block", "Alpha block", "Charlie block"]);
});

test("block style change persists after reload", async ({ page }) => {
  await openFresh(page);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Bravo block" }).click();
  const panel = page.getByRole("complementary", { name: "Block settings" });
  await panel.getByRole("tab", { name: "Style" }).click();
  await panel.getByLabel("Size").fill("20");
  await panel.getByRole("button", { name: "Text colour Soft red" }).click();
  await panel.getByRole("tab", { name: "Spacing" }).click();
  await panel.getByLabel("Padding left").fill("24");
  const bravo = pm(page).locator("p", { hasText: "Bravo block" });
  await expect(bravo).toHaveCSS("font-size", "26.6667px");
  await expect(bravo).toHaveCSS("padding-left", "24px");
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  const after = pm(page).locator("p", { hasText: "Bravo block" });
  await expect(after).toBeVisible({ timeout: 20_000 });
  await expect(after).toHaveCSS("font-size", "26.6667px");
  await expect(after).toHaveCSS("color", "rgb(143, 58, 58)");
  await expect(after).toHaveCSS("padding-left", "24px");
  await expect(pm(page).locator("p", { hasText: "Alpha block" })).not.toHaveAttribute("data-block-style", /.*/);
});

test("global style saves with the sermon; Preach renders block styles like Edit", async ({ page }) => {
  await openFresh(page);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Bravo block" }).click();
  const panel = page.getByRole("complementary", { name: "Block settings" });
  await panel.getByRole("tab", { name: "Style" }).click();
  await panel.getByLabel("Size").fill("20");
  await panel.getByRole("button", { name: "Text colour Soft red" }).click();
  const italicRow = panel.locator("label", { hasText: "Italic" });
  const box = await italicRow.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await italicRow.click({ position: { x: box!.width - 8, y: box!.height / 2 } });
  await expect(panel.getByRole("checkbox", { name: "Italic" })).toBeChecked();
  await panel.getByRole("button", { name: /Save as global style for/ }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "networkidle" });
  const charlie = pm(page).locator("p", { hasText: "Charlie block" });
  await expect(charlie).toBeVisible({ timeout: 20_000 });
  await expect(charlie).toHaveCSS("font-style", "italic");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("builder-global-styles")))).toEqual([]);

  await page.goto("/preach", { waitUntil: "networkidle" });
  const view = page.locator("[data-page-view]");
  await expect(view).toBeVisible({ timeout: 20_000 });
  const bravo = view.locator("[data-line]", { hasText: "Bravo block" });
  await expect(bravo).toBeVisible();
  // #8F3A3A as stored; Preach may lighten it for contrast on a dark screen, hue kept.
  const bravoColor = await bravo.locator("span").filter({ hasText: "Bravo block" }).first().evaluate((el) => getComputedStyle(el).color);
  expect(["rgb(143, 58, 58)", "rgb(191, 96, 96)"]).toContain(bravoColor);
  const preachCharlie = view.locator("[data-line]", { hasText: "Charlie block" });
  await expect(preachCharlie.locator("span").filter({ hasText: "Charlie block" }).first()).toHaveCSS("font-style", "italic");
});

test("a block can be dropped into a section column; words stay the same", async ({ page }) => {
  await openFresh(page);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Charlie block" }).hover();
  await page.getByTestId("inserter-2").click({ force: true });
  const menu = page.getByRole("dialog", { name: "Insert block" });
  await expect(menu).toBeVisible();
  await menu.getByRole("searchbox").or(menu.getByLabel("Search blocks")).fill("2-column");
  await menu.getByRole("option", { name: "2-column section" }).click();
  await expect(page.locator(".sermon-section")).toBeVisible();
  const before = await pm(page).innerText();
  await pm(page).locator("p", { hasText: "Alpha block" }).click();
  const handle = page.getByTestId("drag-handle");
  const col = page.locator("[data-column]").first();
  await expect(col).toBeVisible();
  const hb = await handle.boundingBox();
  const cb = await col.boundingBox();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb!.x + cb!.width / 2, cb!.y + cb!.height / 2, { steps: 12 });
  await expect(page.getByTestId("drop-column")).toBeVisible();
  await page.mouse.up();
  const after = await pm(page).innerText();
  // Same words, possibly reordered / rewrapped.
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const w of ["Alpha block", "Bravo block", "Charlie block"]) {
    expect(norm(after)).toContain(w);
    expect(norm(before)).toContain(w);
  }
  await expect(col.locator("p", { hasText: "Alpha block" })).toBeVisible();
});

test("tablet width: block settings open as a bottom sheet, controls are 44px", async ({ page }) => {
  await openFresh(page, 768, 1024);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Bravo block" }).click();
  const sheet = page.getByTestId("style-sheet");
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.y).toBeGreaterThan(vp.height * 0.4);
  expect(box!.width).toBeGreaterThan(vp.width * 0.9);
  const close = sheet.getByRole("button", { name: "Close block settings" });
  await expect(close).toBeVisible();
  const closeBox = await close.boundingBox();
  expect(closeBox!.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(sheet).toBeHidden();
  await page.getByTestId("open-style-sheet").click();
  await expect(sheet).toBeVisible();
});
