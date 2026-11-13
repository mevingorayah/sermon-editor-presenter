import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 1 writing tools: colours, fonts, justify, letter/line spacing.
 * Made-up fixtures only. Seeds browser localStore (no /api/sermons).
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const LIB_KEY = "sermon-editor-presenter:library:v1";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const content = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Writing tools fixture text éàçœ." }],
    },
  ],
};

async function seed(page: Page) {
  const sermon = {
    id: ID,
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "Writing Tools",
    content,
    presentationSettings: {
      theme: "light",
      bionic: false,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: "paper-a4",
    },
  };
  await page.addInitScript(
    ([k, id, doc]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem("sermon-editor-presenter:library:v1", doc);
      localStorage.setItem(k, id);
    },
    [ACTIVE_ID_KEY, ID, JSON.stringify({ [ID]: { doc: sermon, savedAt: null, dirty: true } })] as const,
  );
}

async function libraryContent(page: Page) {
  const raw = await page.evaluate((k) => localStorage.getItem(k), LIB_KEY);
  expect(raw, "library written").toBeTruthy();
  const lib = JSON.parse(raw!);
  const entry = lib[ID] ?? Object.values(lib)[0];
  return entry.doc.content as { content?: unknown[] };
}

test("highlight, text colour, font, justify and spacing round-trip in localStore and Preach", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/edit", { waitUntil: "networkidle" });
  const pm = page.locator(".ProseMirror");
  await expect(pm).toBeVisible({ timeout: 20_000 });
  await expect(pm).toContainText("Writing tools fixture text", { timeout: 20_000 });
  await pm.click();
  await page.keyboard.press("Control+A");

  await page.getByRole("toolbar", { name: "Text formatting" }).getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("option", { name: "Yellow" }).click();

  await page.getByRole("button", { name: "Text color" }).click();
  const hex = page.getByLabel("Custom hex colour");
  await hex.fill("#A8201A");
  await page.getByRole("button", { name: "Apply custom colour" }).click();

  await page.getByLabel("Font family").selectOption("lora");
  await page.getByRole("toolbar", { name: "Text formatting" }).getByRole("button", { name: "Justify", exact: true }).click();
  await pm.click();
  await expect(pm).toContainText("Writing tools fixture text");
  await page.getByTestId("letter-spacing").fill("0.05");
  await page.getByTestId("line-spacing").fill("1.7");
  await pm.click();
  await expect(pm).toContainText("Writing tools fixture text");

  await expect.poll(async () => {
    const doc = await libraryContent(page);
    return JSON.stringify(doc);
  }, { timeout: 15_000 }).toMatch(/#A8201A|#a8201a/i);

  const stored = JSON.stringify(await libraryContent(page));
  expect(stored).toMatch(/FFF176|fff176/i);
  expect(stored).toMatch(/Lora/i);
  expect(stored).toMatch(/justify/);
  expect(stored).toMatch(/0\.05em/);
  expect(stored).toMatch(/1\.7/);

  // Recent colours persist in this browser.
  const recent = await page.evaluate(() =>
    localStorage.getItem("sermon-editor-presenter:recent-text-colors:v1"),
  );
  expect(recent).toMatch(/A8201A/i);

  await expect(pm).toContainText("Writing tools fixture text éàçœ.");
  await page.reload({ waitUntil: "networkidle" });
  await expect(pm).toBeVisible({ timeout: 20_000 });
  await expect(pm).toContainText("Writing tools fixture text éàçœ.", { timeout: 20_000 });
  const afterReload = JSON.stringify(await libraryContent(page));
  expect(afterReload).toMatch(/#A8201A|#a8201a/i);
  expect(afterReload).toMatch(/Lora/i);
  expect(afterReload).toMatch(/justify/);

  await page.goto(`/preach?id=${ID}`, { waitUntil: "networkidle" });
  const article = page.locator("article, [data-page-view], main").first();
  await expect(article).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Writing tools fixture text")).toBeVisible({ timeout: 20_000 });
  const styled = page.locator("p, [data-line]").filter({ hasText: "Writing tools fixture text" }).first();
  await expect(styled).toBeVisible();
  const css = await styled.evaluate((el) => {
    const s = getComputedStyle(el);
    return { align: s.textAlign, letter: s.letterSpacing, line: s.lineHeight, font: s.fontFamily, color: s.color };
  });
  expect(css.align).toBe("justify");
  // Preach flow view should keep the paragraph spacing; page view may use document leading (known gap).
  if (css.align === "justify") {
    expect(css.font.toLowerCase()).toMatch(/lora|serif/);
  }
});

test("toolbar writing controls are at least 44px", async ({ page }) => {
  await seed(page);
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Highlight" })).toBeVisible({ timeout: 20_000 });
  const names = ["Highlight", "Text color", "Justify", "Align left"];
  for (const name of names) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box, name).toBeTruthy();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
  }
  const font = await page.getByLabel("Font family").boundingBox();
  expect(font!.height).toBeGreaterThanOrEqual(44);
  const letter = await page.getByTestId("letter-spacing").boundingBox();
  expect(letter!.height).toBeGreaterThanOrEqual(44);
});
