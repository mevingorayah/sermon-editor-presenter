import { test, expect, type Page } from "@playwright/test";

/**
 * QA High: an edit made just before switching sermons must be saved.
 * Fixtures are made up; both sermons are created through the API.
 */

function doc(title: string, text: string) {
  return {
    type: "doc",
    content: [
      { type: "title", content: [{ type: "text", text: title }] },
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  };
}

async function makeSermon(page: Page, title: string, text: string) {
  const res = await page.request.post("/api/sermons", {
    data: { title, content: doc(title, text), notes: "" },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { sermon: { id: string } }).sermon.id;
}

async function setup(page: Page, tag: string) {
  const a = `Fixture A ${tag} ${Date.now()}`;
  const b = `Fixture B ${tag} ${Date.now()}`;
  const aId = await makeSermon(page, a, "Alpha placeholder line.");
  await makeSermon(page, b, "Beta placeholder line.");
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__e2e_seeded")) {
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
    }
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible({ timeout: 20_000 });
  const nav = page.getByRole("navigation", { name: "Sermons" });
  await nav.getByRole("button", { name: a, exact: true }).click();
  await expect(editor).toContainText("Alpha placeholder", { timeout: 20_000 });
  return {
    editor,
    aId,
    open: (title: string) => nav.getByRole("button", { name: title, exact: true }).click(),
    a,
    b,
  };
}

test("typing then switching within 300 ms keeps the edit", async ({ page }) => {
  const s = await setup(page, "type");
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Zeta marker.");
  await page.waitForTimeout(100);
  await s.open(s.b);
  await expect(s.editor).toContainText("Beta placeholder");
  await s.open(s.a);
  await expect(s.editor).toContainText("Alpha placeholder line. Zeta marker.");

  const server = await page.request.get(`/api/sermons/${s.aId}`);
  expect(JSON.stringify(await server.json())).toContain("Zeta marker.");
  await page.reload({ waitUntil: "networkidle" });
  await s.open(s.a);
  await expect(s.editor).toContainText("Zeta marker.");
});

test("Replace All then switching within 300 ms keeps the edit", async ({
  page,
}) => {
  const s = await setup(page, "replace");
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByPlaceholder("Find in sermon…").fill("placeholder");
  await page.getByPlaceholder("Replace with…").fill("swapped");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(s.editor).toContainText("Alpha swapped line.");
  await page.waitForTimeout(100);
  await s.open(s.b);
  await expect(s.editor).toContainText("Beta placeholder");
  await s.open(s.a);
  await expect(s.editor).toContainText("Alpha swapped line.");

  const server = await page.request.get(`/api/sermons/${s.aId}`);
  expect(JSON.stringify(await server.json())).toContain("Alpha swapped line.");
});
