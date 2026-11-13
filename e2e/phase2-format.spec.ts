import { test, expect, type Page } from "@playwright/test";

/** Phase 2: print/screen format theme; saved colours stay as written. Made-up fixtures. */
const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const LIB = "sermon-editor-presenter:library:v1";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NAVY = "#1e3a8a";

async function seed(page: Page, format: "a4" | "16:9") {
  const sermon = {
    id: ID,
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "Phase 2 Format",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Navy saved colour ", marks: [{ type: "textStyle", attrs: { color: NAVY } }] },
            { type: "text", text: "on a highlight", marks: [{ type: "highlight", attrs: { color: "#FFF176" } }, { type: "textStyle", attrs: { color: NAVY } }] },
          ],
        },
      ],
    },
    presentationSettings: {
      theme: "dark",
      bionic: true,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: format === "a4" ? "paper-a4" : "screen-16-9",
      page: { format, orientation: format === "a4" ? "portrait" : "landscape" },
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
      localStorage.setItem("sermon-editor-presenter:preach-view:v1", "flow");
    },
    [ACTIVE_ID_KEY, ID, JSON.stringify({ [ID]: { doc: sermon, savedAt: null, dirty: true } })] as const,
  );
}

async function storedNavy(page: Page) {
  const raw = await page.evaluate((k) => localStorage.getItem(k), LIB);
  return raw ?? "";
}

test("Print (A4) is a white page with dark text; saved navy is unchanged in the file", async ({ page }) => {
  await seed(page, "a4");
  await page.goto("/preach", { waitUntil: "networkidle" });
  const root = page.locator("[data-reading-mode]").first();
  await expect(root).toHaveAttribute("data-format-theme", "print");
  await expect(root).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const navy = page.locator("article span").filter({ hasText: "Navy saved colour" }).first();
  await expect(navy).toBeVisible({ timeout: 20_000 });
  await expect(navy).toHaveCSS("color", "rgb(30, 58, 138)");
  expect(await storedNavy(page)).toContain("#1e3a8a");
});

test("Screen (16:9) is dark; low-contrast navy is lightened on the page, kept dark on a highlight, file unchanged", async ({ page }) => {
  await seed(page, "16:9");
  await page.goto("/preach", { waitUntil: "networkidle" });
  const root = page.locator("[data-reading-mode]").first();
  await expect(root).toHaveAttribute("data-format-theme", "screen-dark");
  await expect(root).toHaveCSS("background-color", "rgb(20, 18, 16)");
  const onPage = page.locator("article span").filter({ hasText: "Navy saved colour" }).first();
  await expect(onPage).toBeVisible({ timeout: 20_000 });
  const color = await onPage.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe("rgb(30, 58, 138)");
  const onHl = page.locator("mark").filter({ hasText: "on a highlight" }).first();
  await expect(onHl).toBeVisible();
  const hlColor = await onHl.evaluate((el) => {
    const painted = el.querySelector("[style*='color']") ?? el;
    return getComputedStyle(painted).color;
  });
  expect(hlColor).toBe("rgb(30, 58, 138)");
  const hlBg = await onHl.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(hlBg).not.toBe("rgb(101, 95, 51)");
  expect(await storedNavy(page)).toContain("#1e3a8a");
  expect(await storedNavy(page)).toContain("#FFF176");
});
