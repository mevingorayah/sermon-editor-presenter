import { test, expect, type Page } from "@playwright/test";

/** QA Q3 (batch 8b1ba7a): Esc closes panels/popovers and focus returns to the trigger. */

async function freshEdit(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
    localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
}

test("Esc closes Document setup and returns focus to the Calibrate trigger", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await freshEdit(page);
  // Preach's own deep link (Edit now opens export in place, see export-from-edit).
  await page.goto("/preach?calibrate=1", { waitUntil: "networkidle" });
  const panel = page.getByRole("complementary", { name: /Document setup/ });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  const calibrate = page.getByRole("button", { name: "Calibrate" });

  // Deep-link open: Esc closes, focus falls back to the in-page trigger.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(calibrate).toBeFocused();

  // In-page open, Esc from inside the panel.
  await calibrate.click();
  await expect(panel).toBeVisible();
  await panel.getByLabel("Filename").focus();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(calibrate).toBeFocused();
  await expect(calibrate).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("Esc on the text-colour popover closes it and returns focus to its button", async ({ page }) => {
  await freshEdit(page);
  await page.locator(".ProseMirror").click();
  const trigger = page.getByRole("button", { name: "Text color" });
  await trigger.click();
  const palette = page.getByRole("listbox", { name: "Color palette" });
  await expect(palette).toBeVisible();
  await page.getByRole("option", { name: "Soft blue" }).focus();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
