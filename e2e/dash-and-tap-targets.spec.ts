import { test, expect, type Page, type Locator } from "@playwright/test";

/** Made-up fixture text; never real sermon content. */
const RANGE = "Jean 3.16-18";
const EN_DASH = "Rom 8.28\u201330";
const SHOTS = process.env.SHOTS_DIR;

async function openEdit(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
  });
  await page.goto("/edit");
  const notNow = page.getByRole("button", { name: "Not now, keep them in this browser" });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  const n = page.getByRole("button", { name: "Not now, keep them in this browser" });
  if (await n.isVisible().catch(() => false)) await n.click();
}

async function expectTap(l: Locator, name: string) {
  await expect(l, name).toBeVisible();
  const b = await l.boundingBox();
  expect(b, name).not.toBeNull();
  expect(b!.width, `${name} width`).toBeGreaterThanOrEqual(44);
  expect(b!.height, `${name} height`).toBeGreaterThanOrEqual(44);
}

test("typed hyphen range stays a hyphen in Edit and Preach; typed en dash kept", async ({ page }) => {
  await openEdit(page);
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(`Lire ${RANGE} `);
  await page.keyboard.insertText(EN_DASH);
  await page.keyboard.type(" -- fin");
  const ed = page.locator(".ProseMirror");
  await expect(ed).toContainText(`Lire ${RANGE} ${EN_DASH} -- fin`);
  await expect(ed).not.toContainText("3.16\u201318");
  await page.waitForTimeout(1500); // let autosave run
  await page.goto("/preach");
  const body = page.locator("body");
  await expect(body).toContainText(`Lire ${RANGE} ${EN_DASH} -- fin`, { timeout: 20_000 });
  await expect(body).not.toContainText("3.16\u201318");
});

test("tap targets are at least 44x44 on /edit and /preach", async ({ page }) => {
  await openEdit(page);
  await expectTap(page.getByRole("button", { name: "Document", exact: true }), "Document");
  await expectTap(page.getByRole("link", { name: "Export…" }), "Export");
  await expectTap(page.getByRole("link", { name: "Enter Preaching" }), "Enter Preaching");
  await expectTap(page.getByRole("button", { name: "New", exact: true }), "New");
  const sermons = page.getByRole("navigation", { name: "Sermons" });
  const rows = sermons.locator("li");
  expect(await rows.count()).toBeGreaterThan(0);
  await expectTap(rows.first().locator("button").first(), "Sermon row");
  await expectTap(sermons.getByRole("button", { name: /^Delete/ }).first(), "Delete");
  const outline = page.getByRole("navigation", { name: "Sermon outline" }).getByRole("button");
  expect(await outline.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await outline.count()); i++) await expectTap(outline.nth(i), `Outline item ${i}`);
  const find = page.getByRole("search", { name: "Find and replace" }).getByRole("button");
  expect(await find.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await find.count()); i++) await expectTap(find.nth(i), `Find/replace button ${i}`);
  const blocks = page.getByRole("group", { name: "Block type" });
  for (const n of ["Title", "H1", "H2", "Body"]) await expectTap(blocks.getByRole("button", { name: n, exact: true }), n);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-tap-edit.png` });

  await page.goto("/preach");
  await expectTap(page.getByRole("link", { name: /Back to Edit/ }), "Back to Edit");
  await expectTap(page.getByRole("button", { name: "Dark", exact: true }), "Dark");
  await expectTap(page.getByRole("button", { name: "Light", exact: true }), "Light");
  await expectTap(page.getByRole("button", { name: "Calibrate", exact: true }), "Calibrate");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-tap-preach.png` });
});
