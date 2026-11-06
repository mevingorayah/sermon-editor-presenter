import { test, expect, type Page } from "@playwright/test";

/** Ported from #28 onto local storage. Browser-only mode, made-up fixture. */
async function open(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__e2e_seeded")) {
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
    }
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  const pm = page.locator(".ProseMirror");
  await expect(pm).toBeVisible({ timeout: 20_000 });
  return pm;
}

test("save status: nothing on open, Saving…, then Saved HH:MM; where only in tooltip", async ({ page }) => {
  const pm = await open(page);
  const status = page.getByTestId("save-status");
  await expect(status).toHaveText("");
  await expect(status).toBeHidden();
  await pm.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" x");
  await expect(status).toHaveText("Saving…");
  await expect(status).toHaveText(/^Saved \d{2}:\d{2}$/, { timeout: 15_000 });
  await expect(status).toHaveAttribute("title", /^Saved in this browser at \d{2}:\d{2}$/);
  await expect(status).toHaveAttribute("aria-label", /^Saved in this browser at \d{2}:\d{2}$/);
  await expect(status).toHaveAttribute("data-tone", "muted");
});

test("failed write shows red Not saved, retrying", async ({ page }) => {
  const pm = await open(page);
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.includes("library")) throw new DOMException("x", "UnknownError");
      return orig.call(this, k, v);
    };
  });
  await pm.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" y");
  const status = page.getByTestId("save-status");
  await expect(status).toHaveText("Not saved, retrying", { timeout: 15_000 });
  await expect(status).toHaveAttribute("data-tone", "error");
  expect(await status.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(180, 35, 24)");
});

test.describe("390px phone, en-US", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "en-US", timezoneId: "Indian/Mauritius" });
  test("icon only after the EDITING badge, 24h time in aria-label", async ({ page }) => {
    const pm = await open(page);
    const status = page.getByTestId("save-status");
    await pm.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" z");
    await expect(status).toHaveAttribute("aria-label", /^Saved in this browser at \d{2}:\d{2}$/, { timeout: 15_000 });
    expect(await status.getAttribute("aria-label")).not.toMatch(/AM|PM/i);
    const badge = page.locator("header").getByText("Editing", { exact: true });
    const [b, st] = await Promise.all([badge.boundingBox(), status.boundingBox()]);
    expect(st!.x).toBeGreaterThanOrEqual(b!.x + b!.width);
    expect(st!.width).toBeLessThan(30);
  });
});

test("New sermon: save status stays empty until this sermon is first saved", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
    localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  const pm = page.locator(".ProseMirror");
  await expect(pm).toBeVisible({ timeout: 20_000 });
  // Save something on the first sermon so a "Saved HH:MM" would exist to leak.
  await pm.click();
  await page.keyboard.type("first-sermon-marker");
  const status = page.getByTestId("save-status");
  await expect(status).toHaveText(/^Saved \d{2}:\d{2}$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "New", exact: true }).click();
  // After New: nothing shown (same #28 rule as on switch).
  await expect(status).toHaveAttribute("data-empty", "", { timeout: 10_000 });
  await expect(status).toHaveText("");
  await pm.click();
  await page.keyboard.type("second-sermon-marker");
  await expect(status).toHaveText("Saving…");
  await expect(status).toHaveText(/^Saved \d{2}:\d{2}$/, { timeout: 15_000 });
});
