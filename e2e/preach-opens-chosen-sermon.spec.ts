import { test, expect, type Page } from "@playwright/test";

/** Ported from #27 onto local storage: Preach opens the chosen sermon. Made-up fixtures. */
const LIB = "sermon-editor-presenter:library:v1";
const ACTIVE = "sermon-editor-presenter:active-id:v1";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function sermon(id: string, title: string, mark: string, updatedAt: string) {
  return {
    id, title, updatedAt, notes: "",
    content: { type: "doc", content: [
      { type: "title", content: [{ type: "text", text: title }] },
      { type: "paragraph", content: [{ type: "text", text: mark }] },
    ] },
    presentationSettings: {
      theme: "dark", typeScaleStep: 0, lineHeight: 1.7, bionic: false, calibrationTarget: "screen-16-9",
    },
  };
}

async function seed(page: Page, active: string, longTitle = "Fixture A") {
  const lib = {
    [A]: { doc: sermon(A, longTitle, "alpha-marker", "2026-01-01T00:00:00.000Z"), savedAt: null },
    [B]: { doc: sermon(B, "Fixture B", "bravo-marker", "2026-03-01T00:00:00.000Z"), savedAt: null },
  };
  await page.addInitScript(([l, a, libKey, activeKey]) => {
    if (!sessionStorage.getItem("__e2e_seeded")) {
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem(libKey, l);
      localStorage.setItem(activeKey, a);
    }
  }, [JSON.stringify(lib), active, LIB, ACTIVE] as const);
}

test("Edit → Enter Preaching opens the chosen sermon, not the newest", async ({ page }) => {
  await seed(page, A);
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toContainText("alpha-marker", { timeout: 20_000 });
  await page.getByRole("link", { name: "Enter Preaching" }).click();
  await expect(page).toHaveURL(new RegExp(`/preach\\?id=${A}`));
  await expect(page.getByText("alpha-marker")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("bravo-marker")).toHaveCount(0);
  await page.goto("/preach", { waitUntil: "networkidle" });
  await expect(page.getByText("alpha-marker")).toBeVisible({ timeout: 20_000 });
});

test("explicit ?id opens that sermon; unknown ?id keeps the stored choice", async ({ page }) => {
  await seed(page, A);
  await page.goto(`/preach?id=${B}`, { waitUntil: "networkidle" });
  await expect(page.getByText("bravo-marker")).toBeVisible({ timeout: 20_000 });
  await page.goto("/preach?id=cccccccc-cccc-4ccc-8ccc-cccccccccccc", { waitUntil: "networkidle" });
  await expect(page.getByText("alpha-marker")).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate((k) => localStorage.getItem(k), ACTIVE)).toBe(A);
});

test("Preach top bar shows the sermon title small, one line, ellipsis", async ({ page }) => {
  const title = `Fixture A ${"very long words ".repeat(12)}`.trim();
  await seed(page, A, title);
  await page.goto(`/preach?id=${A}`, { waitUntil: "networkidle" });
  const bar = page.getByTestId("preach-title");
  await expect(bar).toHaveText(title, { timeout: 20_000 });
  const css = await bar.evaluate((el) => {
    const s = getComputedStyle(el);
    return { ws: s.whiteSpace, to: s.textOverflow, h: el.getBoundingClientRect().height };
  });
  expect(css.ws).toBe("nowrap");
  expect(css.to).toBe("ellipsis");
  expect(css.h).toBeLessThan(30);
});
