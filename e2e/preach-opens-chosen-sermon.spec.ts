import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * QA blocker: Preach opened the most recently UPDATED sermon instead of the one
 * chosen, and overwrote the saved choice. Choose A, edit B, open Preach → A.
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";

function contentWith(title: string, body: string) {
  return {
    type: "doc",
    content: [
      { type: "title", content: [{ type: "text", text: title }] },
      { type: "paragraph", content: [{ type: "text", text: body }] },
    ],
  };
}

async function create(request: APIRequestContext, title: string, body: string) {
  const res = await request.post("/api/sermons", {
    data: { title, content: contentWith(title, body), notes: "" },
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { sermon: { id: string } }).sermon.id;
}

async function touch(request: APIRequestContext, id: string, title: string, body: string) {
  const res = await request.patch(`/api/sermons/${id}/content`, {
    data: { title, content: contentWith(title, body) },
  });
  expect(res.ok()).toBeTruthy();
}

async function expectPreachShows(page: Page, aMark: string, bMark: string) {
  await expect(page.getByText(aMark)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(bMark)).toHaveCount(0);
}

test("Preach opens the chosen sermon, not the newest one", async ({ page, request, browser }) => {
  const tag = randomUUID().slice(0, 8);
  const aTitle = `QA-A ${tag}`;
  const bTitle = `QA-B ${tag}`;
  const aMark = `alpha-marker-${tag}`;
  const bMark = `bravo-marker-${tag}`;
  const aId = await create(request, aTitle, aMark);
  const bId = await create(request, bTitle, bMark);

  // Choose A in Edit.
  await page.goto("/edit", { waitUntil: "networkidle" });
  await page
    .getByRole("navigation", { name: "Sermons" })
    .getByRole("button", { name: aTitle, exact: true })
    .click();
  await expect(page.locator(".ProseMirror")).toContainText(aMark, { timeout: 15_000 });

  // Edit B elsewhere so it becomes the most recently updated sermon.
  await touch(request, bId, bTitle, `${bMark} edited`);

  // Via the Edit button (explicit ?id=) …
  await page.getByRole("link", { name: "Enter Preaching" }).click();
  await expect(page).toHaveURL(new RegExp(`/preach\\?id=${aId}`));
  await expectPreachShows(page, aMark, bMark);
  await page.reload({ waitUntil: "networkidle" });
  await expectPreachShows(page, aMark, bMark);

  // … and plain /preach falls back to the last chosen id, never "newest".
  await page.goto("/preach", { waitUntil: "networkidle" });
  await expectPreachShows(page, aMark, bMark);
  expect(await page.evaluate((k) => localStorage.getItem(k), ACTIVE_ID_KEY)).toBe(aId);

  // Fresh context holding only the chosen id (no cached doc).
  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await p2.addInitScript(
    ([k, id]) => {
      if (!sessionStorage.getItem("__seeded")) {
        sessionStorage.setItem("__seeded", "1");
        localStorage.clear();
        localStorage.setItem(k, id);
      }
    },
    [ACTIVE_ID_KEY, aId] as const,
  );
  await p2.goto(page.url().replace(/\/preach.*$/, "/preach"), { waitUntil: "networkidle" });
  await expectPreachShows(p2, aMark, bMark);
  expect(await p2.evaluate((k) => localStorage.getItem(k), ACTIVE_ID_KEY)).toBe(aId);
  await p2.reload({ waitUntil: "networkidle" });
  await expectPreachShows(p2, aMark, bMark);
  await fresh.close();

  // Fresh context, explicit link only.
  const fresh2 = await browser.newContext();
  const p3 = await fresh2.newPage();
  await p3.goto(page.url().replace(/\/preach.*$/, `/preach?id=${aId}`), { waitUntil: "networkidle" });
  await expectPreachShows(p3, aMark, bMark);
  await fresh2.close();
});

const DOC_KEY = "sermon-editor-presenter:document:v1";

async function chooseInEdit(page: Page, title: string, mark: string) {
  await page.goto("/edit", { waitUntil: "networkidle" });
  await page
    .getByRole("navigation", { name: "Sermons" })
    .getByRole("button", { name: title, exact: true })
    .click();
  await expect(page.locator(".ProseMirror")).toContainText(mark, { timeout: 15_000 });
}

test("Preach top bar shows the sermon title small, one line, ellipsis", async ({ page, request }) => {
  const tag = randomUUID().slice(0, 8);
  const title = `QA-Title ${tag} ${"very long words ".repeat(12)}`.trim();
  const mark = `title-marker-${tag}`;
  const id = await create(request, title, mark);
  await page.goto(`/preach?id=${id}`, { waitUntil: "networkidle" });
  const bar = page.getByRole("banner").getByTestId("preach-title");
  await expect(bar).toHaveText(title, { timeout: 20_000 });
  const css = await bar.evaluate((el) => {
    const s = getComputedStyle(el);
    return { ws: s.whiteSpace, to: s.textOverflow, h: el.getBoundingClientRect().height };
  });
  expect(css.ws).toBe("nowrap");
  expect(css.to).toBe("ellipsis");
  expect(css.h).toBeLessThan(30);
});

test("stale /preach?id=<unknown> keeps the stored choice and does not overwrite it", async ({ page, request }) => {
  const tag = randomUUID().slice(0, 8);
  const aTitle = `QA-Stale-A ${tag}`;
  const aMark = `stale-a-${tag}`;
  const bMark = `stale-b-${tag}`;
  const aId = await create(request, aTitle, aMark);
  await chooseInEdit(page, aTitle, aMark);
  // B becomes the newest sermon.
  await create(request, `QA-Stale-B ${tag}`, bMark);

  await page.goto(`/preach?id=${randomUUID()}`, { waitUntil: "networkidle" });
  await expectPreachShows(page, aMark, bMark);
  expect(await page.evaluate((k) => localStorage.getItem(k), ACTIVE_ID_KEY)).toBe(aId);
});

test("opening a sermon in Preach does not re-stamp the local copy's updatedAt", async ({ page, request }) => {
  const tag = randomUUID().slice(0, 8);
  const mark = `ro-marker-${tag}`;
  const id = await create(request, `QA-RO ${tag}`, mark);
  const res = await request.get(`/api/sermons/${id}`);
  const serverUpdatedAt = ((await res.json()) as { sermon: { meta: { updatedAt: string } } })
    .sermon.meta.updatedAt;

  await page.goto(`/preach?id=${id}`, { waitUntil: "networkidle" });
  await expect(page.getByText(mark)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1100);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(mark)).toBeVisible({ timeout: 20_000 });
  const cached = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), DOC_KEY);
  expect(cached.id).toBe(id);
  expect(cached.updatedAt).toBe(serverUpdatedAt);
});
