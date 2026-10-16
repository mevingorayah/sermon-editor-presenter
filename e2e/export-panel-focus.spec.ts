import { test, expect, type Page } from "@playwright/test";

/**
 * Slice 2 QA follow-ups on Document setup & export (/preach?calibrate=1):
 * Q3 focus returns to the opener (or a sane fallback) on close; filename /
 * notes are not persisted between openings. Q4 400 field errors. D1 the
 * export accent is read from the live --edit-accent token (as hex).
 */

async function freshEdit(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
  });
  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
}

async function activeElementInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      tag: el?.tagName ?? null,
      text: el?.textContent?.trim() ?? null,
      pressed: el?.getAttribute("aria-pressed") ?? null,
    };
  });
}

const panelOf = (page: Page) =>
  page.getByRole("complementary", { name: /Document setup/ });

test("closing Document setup returns focus; filename/notes are not persisted", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await freshEdit(page);

  // Arrive via Edit's "Export…" deep link: the opener lives on /edit.
  await page.getByRole("link", { name: "Export…" }).click();
  await page.waitForURL(/\/preach\?calibrate=1$/);
  const panel = panelOf(page);
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByRole("heading", { name: /Document setup/ })).toBeFocused();

  const stem = panel.getByLabel("Filename");
  const defaultStem = await stem.inputValue();
  await stem.fill("Temporary-Name");
  await panel.getByLabel("Include study notes").check();

  // Close: the "Export…" link is gone (cross-route) → in-page Calibrate toggle.
  await panel.getByRole("button", { name: "Close document setup" }).click();
  await expect(panel).toBeHidden();
  const calibrate = page.getByRole("button", { name: "Calibrate" });
  await expect(calibrate).toBeFocused();
  expect(await activeElementInfo(page)).toEqual({
    tag: "BUTTON",
    text: "Calibrate",
    pressed: "false",
  });

  // Reopen from the in-page trigger: settings are fresh (not persisted).
  await calibrate.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel("Filename")).toHaveValue(defaultStem);
  await expect(panel.getByLabel("Include study notes")).not.toBeChecked();

  // Close via the panel's Close button → focus returns to the opener.
  await panel.getByRole("button", { name: "Close document setup" }).focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeHidden();
  await expect(calibrate).toBeFocused();

  // Toggle closed from the trigger itself → focus stays on it.
  await calibrate.click();
  await expect(panel).toBeVisible();
  await calibrate.click();
  await expect(panel).toBeHidden();
  expect((await activeElementInfo(page)).text).toBe("Calibrate");

  expect(pageErrors).toEqual([]);
});

test("export 400 shows field errors; accent comes from the live --edit-accent token", async ({
  page,
}) => {
  await freshEdit(page);
  await page.goto("/preach?calibrate=1", { waitUntil: "networkidle" });
  const panel = panelOf(page);
  await expect(panel).toBeVisible({ timeout: 20_000 });

  // Retheme the token at runtime (rgb() form) — export must read it now.
  await page.addStyleTag({ content: ":root { --edit-accent: rgb(31, 111, 235); }" });

  const bodies: Record<string, unknown>[] = [];
  let responder = 0;
  await page.route("**/api/export**", async (route) => {
    bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    responder++;
    if (responder === 1) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Validation failed",
          details: [
            {
              code: "custom",
              path: ["resolvedColors", "accent"],
              message:
                "Color must be #RRGGBB or rgb(r, g, b). Named colors, #RGB, rgba(), hsl() and CSS var(--…) are not allowed.",
            },
          ],
        }),
      });
    } else if (responder === 2) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Validation failed",
          details: ["a", "b", "c", "d", "e"].map((p) => ({ path: [p], message: "Required" })),
        }),
      });
    } else {
      await route.fulfill({ status: 400, contentType: "text/html", body: "<h1>Bad</h1>" });
    }
  });

  const status = panel.getByRole("status");
  await panel.getByRole("button", { name: "Export DOCX" }).click();
  await expect(status).toHaveText(
    "Export failed: resolvedColors.accent — color must be #RRGGBB or rgb(r, g, b)",
  );
  expect((bodies[0].resolvedColors as { accent: string }).accent).toBe("#1f6feb");

  await panel.getByRole("button", { name: "Export PDF" }).click();
  await expect(status).toHaveText(
    "Export failed: a — required; b — required; c — required (+2 more)",
  );

  await panel.getByRole("button", { name: "Export DOCX" }).click();
  await expect(status).toHaveText(/^Export failed \(HTTP 400.*\)\. Please try again\.$/);
  for (const b of bodies) {
    expect((b.resolvedColors as { accent: string }).accent).toMatch(/^#[0-9a-f]{6}$/);
  }
});
