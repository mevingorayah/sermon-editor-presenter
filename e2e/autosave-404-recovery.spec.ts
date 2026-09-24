import { test, expect, type Page } from "@playwright/test";

/**
 * Issue #9 — autosave PATCH 404 (sermon gone on the server, e.g. a fresh
 * Cloud Run revision with an empty disk store) must re-create the sermon,
 * end at "Saved to server", never claim "Offline", and keep the content.
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare global {
  interface Window {
    __saveStatusHistory?: string[];
  }
}

async function openFreshEdit(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__e2e_seeded")) {
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
    }
    // Record every label the save indicator ever shows.
    const history: string[] = [];
    window.__saveStatusHistory = history;
    const record = () => {
      const el = document.querySelector('[data-testid="save-status"]');
      const text = el?.textContent?.trim();
      if (text && history[history.length - 1] !== text) history.push(text);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
}

const status = (page: Page) => page.getByTestId("save-status");

async function typeAtEnd(page: Page, text: string) {
  await page.locator(".ProseMirror p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
}

async function activeId(page: Page): Promise<string> {
  return (await page.evaluate(
    (k) => localStorage.getItem(k),
    ACTIVE_ID_KEY,
  )) as string;
}

async function history(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__saveStatusHistory ?? []);
}

async function saveOnce(page: Page, text: string) {
  await typeAtEnd(page, text);
  await expect(status(page)).toHaveText("Saved to server", { timeout: 15_000 });
  const id = await activeId(page);
  expect(id).toMatch(UUID_RE);
  return id;
}

test("sermon deleted on the server → re-created on next autosave, never Offline", async ({
  page,
}) => {
  await openFreshEdit(page);
  const originalId = await saveOnce(page, " First save.");

  // The server loses the sermon (real delete through the backend API).
  const del = await page.request.delete(`/api/sermons/${originalId}`);
  expect(del.ok()).toBeTruthy();

  const posts: Record<string, unknown>[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/sermons") {
      posts.push(req.postDataJSON() as Record<string, unknown>);
    }
  });

  const marker = ` Restored-${Date.now()}`;
  await typeAtEnd(page, marker);
  await expect(status(page)).toHaveText("Saved to server", { timeout: 20_000 });

  expect(posts).toHaveLength(1);
  // Restore is attempted under the same id with the full local copy.
  expect(posts[0].id).toBe(originalId);
  expect(JSON.stringify(posts[0].content)).toContain(marker.trim());

  const labels = await history(page);
  expect(labels).toContain("Restoring on server…");
  expect(labels.some((l) => /offline/i.test(l))).toBe(false);

  // The backend honours the client id (same-id restore): nothing re-keyed.
  // (A server without the contract would re-key; covered by unit tests.)
  const recoveredId = await activeId(page);
  expect(recoveredId).toBe(originalId);
  const res = await page.request.get(`/api/sermons/${recoveredId}`);
  expect(res.ok()).toBeTruthy();
  expect(JSON.stringify(await res.json())).toContain(marker.trim());

  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toContainText(marker.trim(), {
    timeout: 20_000,
  });
  expect(await activeId(page)).toBe(recoveredId);
});

test("PATCH 404 once with the same-id POST contract (mocked) → no re-key, Saved", async ({
  page,
}) => {
  await openFreshEdit(page);
  const id = await saveOnce(page, " Before the redeploy.");

  // Server "loses" the sermon for one PATCH; the restore POST follows the
  // Backend contract (201 under the client-supplied id). Later PATCHes hit
  // the real server, so the content really persists.
  let failed = false;
  await page.route(`**/api/sermons/${id}/content`, async (route) => {
    if (!failed && route.request().method() === "PATCH") {
      failed = true;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Sermon not found" }),
      });
      return;
    }
    await route.continue();
  });
  const postBodies: Record<string, unknown>[] = [];
  await page.route("**/api/sermons", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    const body = req.postDataJSON() as Record<string, unknown>;
    postBodies.push(body);
    const now = new Date().toISOString();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        sermon: {
          id: body.id,
          meta: { title: body.title, createdAt: now, updatedAt: now },
          content: body.content,
          presentation: body.presentation,
          notes: body.notes,
        },
      }),
    });
  });

  const marker = ` Replayed-${Date.now()}`;
  await typeAtEnd(page, marker);
  await expect(status(page)).toHaveText("Saved to server", { timeout: 20_000 });

  expect(failed).toBe(true);
  expect(postBodies).toHaveLength(1);
  expect(postBodies[0].id).toBe(id);
  expect(await activeId(page)).toBe(id);
  const labels = await history(page);
  expect(labels).toContain("Restoring on server…");
  expect(labels.some((l) => /offline/i.test(l))).toBe(false);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toContainText(marker.trim(), {
    timeout: 20_000,
  });
  expect(await activeId(page)).toBe(id);
});
