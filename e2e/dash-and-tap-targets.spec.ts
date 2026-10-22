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
  // Page view shows one page at a time: read every page's lines.
  const view = page.locator("[data-page-view]");
  await expect(view).toBeVisible({ timeout: 20_000 });
  const count = Number(await view.getAttribute("data-page-count"));
  let all = "";
  for (let i = 0; i < count; i++) {
    await expect(view).toHaveAttribute("data-page-index", String(i));
    all += (await view.locator("[data-line]").allTextContents()).join(" ") + " ";
    if (i < count - 1) await page.keyboard.press("ArrowRight");
  }
  all = all.replace(/\s+/g, " ");
  expect(all).toContain(`Lire ${RANGE} ${EN_DASH} -- fin`);
  expect(all).not.toContain("3.16\u201318");
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
  // Theme (Dark/Light) and Calibrate… now live in the ⚙ panel; the sweep below covers them.
  // Every control in the bar and the ⚙ panel (incl. Page controls such as
  // "Follow device rotation") is at least 44x44.
  await page.getByRole("button", { name: "Reading settings" }).click();
  const panel = page.locator("[data-settings-panel]");
  await expect(panel).toBeVisible();
  const small = await page.evaluate(() => {
    const bad: string[] = [];
    const sel = "header button, header a, header select, [data-settings-panel] button, [data-settings-panel] a, [data-settings-panel] select, [data-settings-panel] input";
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || el.closest("[hidden]")) continue;
      let target: HTMLElement = el;
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) target = el.closest("label") ?? el;
      const r = target.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const minW = el instanceof HTMLInputElement && el.type === "range" ? 0 : 44;
      if (r.width < minW - 0.5 || r.height < 43.5) {
        const name = el.getAttribute("aria-label") || target.textContent?.trim() || el.outerHTML.slice(0, 60);
        bad.push(`${name}: ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return bad;
  });
  expect(small, "controls under 44x44").toEqual([]);
  const follow = panel.getByText("Follow device rotation");
  if (await follow.count()) await expectTap(panel.locator("label").filter({ has: page.getByRole("checkbox", { name: "Follow device rotation" }) }), "Follow device rotation");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/after-tap-preach.png` });
});
