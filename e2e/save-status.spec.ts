import { test, expect } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;

test("save status: Saving… while pending, Saved + time, Not saved, retrying on failure", async ({ page }) => {
  await page.goto("/edit", { waitUntil: "networkidle" });
  const status = page.getByTestId("save-status");
  const pm = page.locator(".ProseMirror");
  await expect(pm).toBeVisible({ timeout: 20_000 });
  // Nothing shown on open until the first real save.
  await expect(status).toHaveText("");
  await expect(status).toBeHidden();

  // Record every label shown, to prove "Saved" never appears mid-edit.
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="save-status"]')!;
    (window as unknown as { __labels: string[] }).__labels = [];
    new MutationObserver(() =>
      (window as unknown as { __labels: string[] }).__labels.push(el.textContent ?? ""),
    ).observe(el, { childList: true, characterData: true, subtree: true });
  });

  await pm.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" x");
  await expect(status).toHaveText("Saving…");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-save-1-saving.png` });
  const firstAfterTyping = await page.evaluate(
    () => (window as unknown as { __labels: string[] }).__labels[0],
  );
  expect(firstAfterTyping).toBe("Saving…");
  await expect(status).toHaveText(/^Saved \d/, { timeout: 15_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-save-2-saved.png` });

  await page.route("**/api/sermons/*/content", (r) => r.fulfill({ status: 500, body: "{}" }));
  await page.keyboard.type(" y");
  await expect(status).toHaveText("Not saved, retrying", { timeout: 15_000 });
  await expect(status).toHaveAttribute("data-tone", "error");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-save-3-not-saved.png` });
});

test.describe("390px phone, en-US", () => {
  test.use({ viewport: { width: 390, height: 844 }, locale: "en-US", timezoneId: "Indian/Mauritius" });

  test("status is an icon after the EDITING badge, no overlap, 24h time in aria-label", async ({ page }) => {
    await page.goto("/edit", { waitUntil: "networkidle" });
    const pm = page.locator(".ProseMirror");
    await expect(pm).toBeVisible({ timeout: 20_000 });
    const status = page.getByTestId("save-status");
    await pm.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" z");
    await expect(status).toHaveAttribute("aria-label", /^Saved \d{2}:\d{2}$/, { timeout: 15_000 });
    expect(await status.getAttribute("aria-label")).not.toMatch(/AM|PM/i);

    const badge = page.locator("header").getByText("Editing", { exact: true });
    const title = page.locator("header h1");
    const [b, st, t] = await Promise.all([badge.boundingBox(), status.boundingBox(), title.boundingBox()]);
    expect(b && st && t).toBeTruthy();
    const overlap = (x: NonNullable<typeof b>, y: NonNullable<typeof b>) =>
      x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
    expect(overlap(b!, st!)).toBe(false);
    expect(overlap(st!, t!)).toBe(false);
    expect(st!.x).toBeGreaterThanOrEqual(b!.x + b!.width);
    expect(st!.width).toBeLessThan(30); // icon only
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-save-4-phone-390.png` });
  });
});
