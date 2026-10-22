import { test, expect } from "@playwright/test";

const SHOTS = process.env.SHOTS_DIR;

test("save status: Saving… while pending, Saved + time, Not saved, retrying on failure", async ({ page }) => {
  await page.goto("/edit", { waitUntil: "networkidle" });
  const status = page.getByTestId("save-status");
  const pm = page.locator(".ProseMirror");
  await expect(pm).toBeVisible({ timeout: 20_000 });

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
