import { test, expect } from "@playwright/test";

test("Find/Replace resets when switching sermons; Replace All shows count and undoes", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  const pm = page.locator(".ProseMirror");
  await expect(pm).toBeVisible({ timeout: 20_000 });

  const sermons = page.getByRole("navigation", { name: "Sermons" }).getByRole("listitem");
  await expect(sermons.first()).toBeVisible({ timeout: 15_000 });
  const before = await sermons.count();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(sermons).toHaveCount(before + 1, { timeout: 15_000 });

  // Type text in the active (new) sermon and find it.
  await pm.click();
  await page.keyboard.type("grace grace grace");
  // Let history close the typing group so Undo reverts only the Replace All.
  await page.waitForTimeout(800);
  const find = page.getByPlaceholder("Find in sermon…");
  const replace = page.getByPlaceholder("Replace with…");
  await find.fill("grace");
  await replace.fill("mercy");
  const all = page.getByTestId("find-replace-all");
  await expect(all).toHaveText("All (3)");
  await all.click();
  await expect(page.getByTestId("find-replaced")).toContainText("Replaced 3");
  await expect(pm).toContainText("mercy mercy mercy");
  await page.getByRole("button", { name: "Undo replace all" }).click();
  await expect(pm).toContainText("grace grace grace");

  // Switch to the other sermon: find state must be empty.
  await find.fill("grace");
  await sermons.locator('button:not([aria-current="true"]):not([title="Delete"])').first().click();
  await expect(find).toHaveValue("");
  await expect(replace).toHaveValue("");
  await expect(page.getByTestId("find-replace-all")).toHaveText("All");
  await expect(page.locator(".search-match, [data-find-match]")).toHaveCount(0);
});
