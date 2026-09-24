import { test, expect } from "@playwright/test";

/**
 * QA minor (slice 1 spec, Align → Scripture): in Preach the Scripture citation
 * is caption-right *below* the quote, whatever the block's textAlign is.
 */
test("Preach Scripture citation is caption-right below the quote", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/preach", { waitUntil: "networkidle" });
  const scripture = page
    .locator("figure[data-scripture]")
    .filter({ has: page.locator("figcaption") })
    .first();
  if ((await scripture.count()) === 0) {
    test.skip(true, "Active document has no cited Scripture block");
  }
  await expect(scripture).toBeVisible({ timeout: 20_000 });

  const quote = scripture.locator("blockquote p");
  const caption = scripture.locator("figcaption");
  await expect(caption).toHaveCSS("text-align", "right");

  const q = await quote.boundingBox();
  const c = await caption.boundingBox();
  expect(q && c).toBeTruthy();
  // Caption sits below the quote text.
  expect(c!.y).toBeGreaterThanOrEqual(q!.y + q!.height - 1);

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
});
