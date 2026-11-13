import { test, expect, type Page } from "@playwright/test";

/** Made-up fixture only; no Bible text is stored in this file. */
const PASSAGE = "Made-up verse snippet line.";
const ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const ACTIVE = "sermon-editor-presenter:active-id:v1";
const LIB = "sermon-editor-presenter:library:v1";

const content = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "Verse builder fixture" }] },
    { type: "paragraph", content: [{ type: "text", text: "Alpha block" }] },
    {
      type: "verseSnippet",
      attrs: { ref: "Jn 3:16", translation: "LSG", texts: { LSG: PASSAGE } },
    },
    { type: "paragraph", content: [{ type: "text", text: "Charlie block" }] },
  ],
};

function sermon() {
  return {
    id: ID,
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "Verse builder fixture",
    content,
    presentationSettings: {
      theme: "dark",
      bionic: false,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: "screen-16-9",
      page: { format: "a4", orientation: "portrait" },
    },
  };
}

async function openSeeded(page: Page) {
  const doc = JSON.stringify({ [ID]: { doc: sermon(), savedAt: null, dirty: true } });
  await page.addInitScript(
    ([activeKey, id, libKey, lib]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem("sermon-editor-presenter:preach-view:v1", "flow");
      localStorage.setItem(libKey as string, lib as string);
      localStorage.setItem(activeKey as string, id as string);
    },
    [ACTIVE, ID, LIB, doc] as const,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(PASSAGE)).toBeVisible({ timeout: 20_000 });
}

const pm = (page: Page) => page.locator(".ProseMirror");

test("verse snippet is a builder block: drag, duplicate, delete, column drop, Preach bar", async ({ page }) => {
  await openSeeded(page);

  await page.getByText(PASSAGE).first().click();
  await expect(page.getByRole("toolbar", { name: "Verse snippet block tools" })).toBeVisible();
  const handle = page.getByTestId("drag-handle");
  await expect(handle).toBeVisible();
  await expect(page.getByRole("button", { name: "Duplicate block" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete block" })).toBeVisible();

  await page.getByRole("button", { name: "Duplicate block" }).click();
  await expect(pm(page).locator("[data-verse-snippet]")).toHaveCount(2);

  const charlie = pm(page).locator("p", { hasText: "Charlie block" });
  await charlie.hover();
  const charlieIndex = await pm(page).evaluate((el) =>
    Array.from(el.children).findIndex((c) => (c.textContent ?? "").includes("Charlie block")),
  );
  await page.getByTestId(`inserter-${charlieIndex}`).click({ force: true });
  const menu = page.getByRole("dialog", { name: "Insert block" });
  await expect(menu).toBeVisible();
  await menu.getByRole("searchbox").or(menu.getByLabel("Search blocks")).fill("2-column");
  await menu.getByRole("option", { name: "2-column section" }).click();
  await expect(page.locator(".sermon-section")).toBeVisible();

  // Click the first snippet's passage (not the bar) so the wrapper reappears.
  await pm(page).locator("[data-verse-snippet]").first().getByText(PASSAGE).click();
  await expect(page.getByRole("toolbar", { name: "Verse snippet block tools" })).toBeVisible();
  const handle2 = page.getByTestId("drag-handle");
  await expect(handle2).toBeVisible();
  const col = page.locator("[data-column]").first();
  await expect(col).toBeVisible();
  await handle2.dragTo(col, { force: true, targetPosition: { x: 20, y: 20 } });
  await expect(col.locator("[data-verse-snippet]")).toHaveCount(1);
  await expect(col).toContainText(PASSAGE);
  await expect(pm(page).locator("[data-verse-snippet]")).toHaveCount(2);

  await expect(col.locator("[data-verse-snippet]")).toHaveCount(1);
  await expect(pm(page).locator("[data-verse-snippet]")).toHaveCount(2);
  // Delete the leftover snippet that is still outside the section.
  const snippets = pm(page).locator("[data-verse-snippet]");
  const n = await snippets.count();
  for (let i = 0; i < n; i++) {
    const s = snippets.nth(i);
    const inColumn = await s.evaluate((el) => !!el.closest("[data-column]"));
    if (!inColumn) {
      await s.getByText(PASSAGE).click();
      await expect(page.getByRole("toolbar", { name: "Verse snippet block tools" })).toBeVisible();
      await page.getByRole("button", { name: "Delete block" }).click();
      break;
    }
  }
  await expect(pm(page).locator("[data-verse-snippet]")).toHaveCount(1);
  await expect(col.locator("[data-verse-snippet]")).toHaveCount(1);
  await expect(pm(page)).toContainText(PASSAGE);
  await expect(pm(page)).toContainText("Alpha block");
  await expect(pm(page)).toContainText("Charlie block");

  await page.goto("/preach", { waitUntil: "networkidle" });
  const view = page.locator("[data-reading-mode]");
  await expect(view).toBeVisible({ timeout: 20_000 });
  const snippet = page.locator("[data-verse-snippet]").first();
  await expect(snippet).toBeVisible({ timeout: 20_000 });
  await expect(snippet).toContainText(PASSAGE);
  const bar = snippet.locator("[data-verse-bar]");
  await expect(bar).toBeVisible();
  await expect(bar.locator("cite")).toContainText(/Jn 3[:.]16/i);
  const font = await snippet.locator("p").first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font.toLowerCase()).toMatch(/literata|georgia|serif/);

  // Page view also keeps the top bar and serif face.
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Pages" }).click();
  const pageView = page.locator("[data-page-view]");
  await expect(pageView).toBeVisible({ timeout: 20_000 });
  const pageBar = pageView.locator("[data-verse-bar]");
  await expect(pageBar).toBeVisible();
  await expect(pageBar).toContainText(/Jn 3[:.]16/i);
  await expect(pageView).toContainText("Made-up");
  await expect(pageView).toContainText("snippet");
  const pageLine = pageView.locator("[data-line][data-kind='text'][data-block='Scripture']").first();
  await expect(pageLine).toBeVisible();
  await expect(pageLine).toContainText(/Made-up|verse|snippet/);
  const pageFont = await pageLine.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(pageFont.toLowerCase()).toMatch(/literata|georgia|serif/);
});
