import { test, expect, type Page } from "@playwright/test";

/** Made-up fixture only; no Bible text is stored in this file. */
const PASSAGE = "FIXTURE made-up snippet words for page view.";
const ID = "cccccccc-dddd-4eee-8fff-000000000000";
const ACTIVE = "sermon-editor-presenter:active-id:v1";
const LIB = "sermon-editor-presenter:library:v1";
const VIEW = "sermon-editor-presenter:preach-view:v1";

function sermon() {
  return {
    id: ID,
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "Page-view verse style fixture",
    content: {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: "Page-view verse style fixture" }] },
        {
          type: "verseSnippet",
          attrs: {
            ref: "Fixture 1:1",
            translation: "WEB",
            texts: { WEB: PASSAGE },
            style: { background: "#EEE8D5", borderLeft: "#A8201A" },
            spacing: { pt: 24, pb: 24, pl: 20, pr: 12 },
          },
        },
      ],
    },
    presentationSettings: {
      theme: "light",
      bionic: false,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: "paper-a4",
      page: { format: "a4", orientation: "portrait" },
    },
  };
}

async function openPages(page: Page) {
  const doc = JSON.stringify({ [ID]: { doc: sermon(), savedAt: null, dirty: true } });
  await page.addInitScript(
    ([activeKey, id, libKey, lib, viewKey]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem(viewKey as string, "page");
      localStorage.setItem(libKey as string, lib as string);
      localStorage.setItem(activeKey as string, id as string);
    },
    [ACTIVE, ID, LIB, doc, VIEW] as const,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/preach", { waitUntil: "networkidle" });
  await expect(page.locator("[data-page-view]")).toBeVisible({ timeout: 20_000 });
}

test("Pages view shows verse fill, border and padding; words and top bar stay", async ({ page }) => {
  await openPages(page);
  const stage = page.locator("[data-page-view]");
  await expect(stage.locator("[data-verse-bar]")).toBeVisible();
  await expect(stage.getByText(PASSAGE)).toBeVisible();
  await expect(stage.getByText("Fixture 1:1")).toBeVisible();

  const box = stage.locator("[data-block-box]").first();
  await expect(box).toBeVisible();
  await expect(box).toHaveCSS("background-color", "rgb(238, 232, 213)");

  const rule = stage.locator("[data-block-border]").first();
  await expect(rule).toBeVisible();
  await expect(rule).toHaveCSS("background-color", "rgb(168, 32, 26)");

  const pad = await stage.evaluate(() => {
    const boxEl = document.querySelector("[data-page-view] [data-block-box]") as HTMLElement | null;
    const line = document.querySelector("[data-page-view] [data-line][data-block=Scripture]") as HTMLElement | null;
    if (!boxEl || !line) return null;
    const b = boxEl.getBoundingClientRect();
    const l = line.getBoundingClientRect();
    return { top: l.top - b.top, left: l.left - b.left, bottom: b.bottom - l.bottom, right: b.right - l.right };
  });
  expect(pad).not.toBeNull();
  expect(pad!.top).toBeGreaterThan(4);
  expect(pad!.left).toBeGreaterThan(4);
  expect(pad!.bottom).toBeGreaterThan(4);
  expect(pad!.right).toBeGreaterThan(4);
});
