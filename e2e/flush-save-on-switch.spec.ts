import { test, expect } from "@playwright/test";

/** Ported from #36 onto local storage: an edit made just before switching sermons is saved. */
const LIB = "sermon-editor-presenter:library:v1";
const ACTIVE = "sermon-editor-presenter:active-id:v1";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
const ps = { theme: "dark", typeScaleStep: 0, lineHeight: 1.7, bionic: false, calibrationTarget: "screen-16-9" };
const doc = (id: string, title: string, text: string) => ({
  id, title, notes: "", updatedAt: "2026-01-01T00:00:00.000Z", presentationSettings: ps,
  content: { type: "doc", content: [
    { type: "title", content: [{ type: "text", text: title }] },
    { type: "paragraph", content: [{ type: "text", text }] },
  ] },
});

test.beforeEach(async ({ page }) => {
  const lib = {
    [A]: { doc: doc(A, "Fixture Alpha", "Alpha placeholder line."), savedAt: "2026-01-01T00:00:00.000Z" },
    [B]: { doc: doc(B, "Fixture Beta", "Beta placeholder line."), savedAt: "2026-01-01T00:00:00.000Z" },
  };
  await page.addInitScript(([l, libKey, activeKey, a]) => {
    if (!sessionStorage.getItem("__e2e_seeded")) {
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem(libKey, l);
      localStorage.setItem(activeKey, a);
    }
  }, [JSON.stringify(lib), LIB, ACTIVE, A] as const);
});

test("typing then switching within 300 ms keeps the edit", async ({ page }) => {
  await page.goto("/edit", { waitUntil: "networkidle" });
  const editor = page.locator(".ProseMirror");
  await expect(editor).toContainText("Alpha placeholder", { timeout: 20_000 });
  const nav = page.getByRole("navigation", { name: "Sermons" });
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Zeta marker.");
  await page.waitForTimeout(100);
  await nav.getByRole("button", { name: "Fixture Beta", exact: true }).click();
  await expect(editor).toContainText("Beta placeholder");
  await nav.getByRole("button", { name: "Fixture Alpha", exact: true }).click();
  await expect(editor).toContainText("Alpha placeholder line. Zeta marker.");
  const stored = await page.evaluate(([k, id]) => JSON.stringify(JSON.parse(localStorage.getItem(k)!)[id].doc), [LIB, A] as const);
  expect(stored).toContain("Zeta marker.");
  await page.reload({ waitUntil: "networkidle" });
  await nav.getByRole("button", { name: "Fixture Alpha", exact: true }).click();
  await expect(editor).toContainText("Zeta marker.");
});
