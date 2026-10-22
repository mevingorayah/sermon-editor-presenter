import { test, expect, type Page } from "@playwright/test";

/** Block builder slice 1: insert via +, drag reorder, style persists after reload. */

const SHOTS = process.env.BUILDER_SHOTS_DIR;

async function openFresh(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  // Start each test on a new sermon so seeded/real content is never touched.
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
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-insert-menu.png` });
  await menu.getByRole("searchbox").or(menu.getByLabel("Search blocks")).fill("quote");
  await menu.getByRole("option", { name: "Quote" }).click();
  await page.keyboard.type("Inserted quote");
  await expect(pm(page).locator(".sermon-quote")).toHaveText("Inserted quote");
  expect((await topTexts(page))[1]).toBe("Inserted quote");
  // Undo removes it in one step-ish (typing + insert); words of others untouched.
  expect(await topTexts(page)).toEqual(["Alpha block", "Inserted quote", "Bravo block", "Charlie block"]);
});

test("drag a block to reorder; undo restores", async ({ page }) => {
  await openFresh(page);
  await seedBlocks(page);
  await pm(page).locator("p", { hasText: "Alpha block" }).click();
  const handle = page.getByTestId("drag-handle");
  await expect(handle).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-selected-toolbar.png` });
  const target = await pm(page).locator("p", { hasText: "Charlie block" }).boundingBox();
  const hb = await handle.boundingBox();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb!.x + 10, target!.y + target!.height - 2, { steps: 10 });
  await expect(page.getByTestId("drop-line")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-drag-drop-line.png` });
  await page.mouse.up();
  expect(await topTexts(page)).toEqual(["Bravo block", "Charlie block", "Alpha block"]);
  await pm(page).focus();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await topTexts(page)).toEqual(["Alpha block", "Bravo block", "Charlie block"]);
  // Keyboard move
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
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/04-style-panel.png` });
  await page.waitForTimeout(2500); // autosave debounce
  await page.reload({ waitUntil: "networkidle" });
  const after = pm(page).locator("p", { hasText: "Bravo block" });
  await expect(after).toBeVisible({ timeout: 20_000 });
  await expect(after).toHaveCSS("font-size", "26.6667px");
  await expect(after).toHaveCSS("color", "rgb(143, 58, 58)");
  await expect(after).toHaveCSS("padding-left", "24px");
  // Other blocks untouched.
  await expect(pm(page).locator("p", { hasText: "Alpha block" })).not.toHaveAttribute("data-block-style", /.*/);
});
