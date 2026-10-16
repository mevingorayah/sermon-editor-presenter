import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

/**
 * Regression: /edit crashed on mount in Chromium with
 *   TypeError: Failed to set an indexed property [0] on 'CSSStyleDeclaration'
 * because the Scripture React NodeView forwarded TipTap's string
 * `style: "text-align: left"` (TextAlign global attribute) to NodeViewWrapper,
 * which spreads `props.style` into an object → {0:"t",1:"e",…}.
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";

type Scenario = { name: string; activeId: string | null };

const scenarios: Scenario[] = [
  { name: "cleared localStorage", activeId: null },
  { name: "stale seed active id", activeId: "seed-philippians-4:0" },
  { name: "random UUID active id", activeId: randomUUID() },
];

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(`${err.message}\n${err.stack ?? ""}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  return { pageErrors, consoleErrors };
}

async function openEdit(page: Page, activeId: string | null) {
  // Seed localStorage for this origin before the editor bundle runs.
  await page.addInitScript(
    ([key, id]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      // Local-storage gate (#15): use browser storage, no folder picker.
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      if (id) localStorage.setItem(key, id);
    },
    [ACTIVE_ID_KEY, activeId] as const,
  );
  await page.goto("/edit", { waitUntil: "networkidle" });
}

for (const scenario of scenarios) {
  test(`/edit mounts without pageerror (${scenario.name})`, async ({ page }) => {
    const { pageErrors, consoleErrors } = collectErrors(page);
    await openEdit(page, scenario.activeId);

    const history = page.getByRole("group", { name: "History" });
    await expect(history).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Alignment" })).toBeVisible();
    await expect(page.locator(".ProseMirror")).toBeVisible();

    // Give any deferred effects/NodeViews a beat to render.
    await page.waitForTimeout(1_000);

    expect(pageErrors, pageErrors.join("\n\n")).toEqual([]);
    expect(
      consoleErrors.filter((t) => /CSSStyleDeclaration|indexed property/i.test(t)),
    ).toEqual([]);
  });
}

test("Scripture block alignment renders as a real style (no crash)", async ({ page }) => {
  const { pageErrors } = collectErrors(page);
  await openEdit(page, null);
  await expect(page.getByRole("group", { name: "History" })).toBeVisible({
    timeout: 20_000,
  });

  const scripture = page.locator(".ProseMirror [data-node-view-wrapper].sermon-scripture").first();
  if ((await scripture.count()) === 0) {
    test.skip(true, "Active document has no Scripture block to align");
  }
  await expect(scripture).toBeVisible();

  // Alignment is driven by the TextAlign global attribute (rendered by TipTap
  // as a *string* style) and must be applied as a real CSS value, live.
  // The doc autosaves, so do not assume a starting alignment; end on "left".
  await scripture.locator(".sermon-scripture-quote").click();
  await page.getByRole("button", { name: "Align center" }).click();
  await expect(scripture).toHaveCSS("text-align", "center");
  await page.getByRole("button", { name: "Align right" }).click();
  await expect(scripture).toHaveCSS("text-align", "right");
  await page.getByRole("button", { name: "Align left" }).click();
  await expect(scripture).toHaveCSS("text-align", "left");

  expect(pageErrors, pageErrors.join("\n\n")).toEqual([]);
});
