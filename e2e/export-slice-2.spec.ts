import { readFile } from "node:fs/promises";
import { test, expect, type Page, type Request } from "@playwright/test";

/**
 * Slice 2: Edit "Export…" → Preach with Document setup (Calibration) open →
 * Save-as filename stem → DOCX + PNG downloads with the expected filenames.
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const STEM = "Slice2-E2E-Sermon";

function sanitizeStem(raw: string): string {
  const s = raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return s || "sermon-export";
}

async function exportAndDownload(page: Page, name: string | RegExp) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name }).click(),
  ]);
  return download;
}

test("Edit Export… → Preach Calibration → DOCX + PNG downloads", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack ?? ""}`));
  const exportBodies: Record<string, unknown>[] = [];
  const exportUrls: string[] = [];
  page.on("request", (req: Request) => {
    if (req.method() === "POST" && new URL(req.url()).pathname === "/api/export") {
      exportUrls.push(req.url());
      exportBodies.push(JSON.parse(req.postData() ?? "{}"));
    }
  });

  await page.addInitScript((key) => {
    if (sessionStorage.getItem("__e2e_seeded")) return;
    sessionStorage.setItem("__e2e_seeded", "1");
    localStorage.clear();
      // Skip the first-run folder screen: these tests cover the editor itself.
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
    localStorage.removeItem(key);
  }, ACTIVE_ID_KEY);

  await page.goto("/edit", { waitUntil: "networkidle" });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  const editTitle = (await page.locator("header h1").first().innerText()).trim();

  // Edit topbar entry is a keyboard-reachable link to the deep link.
  const exportLink = page.getByRole("link", { name: "Export…" });
  await expect(exportLink).toHaveAttribute("href", "/preach?calibrate=1");
  await exportLink.click();

  await page.waitForURL(/\/preach\?calibrate=1$/);
  const panel = page.getByRole("complementary", { name: /Document setup/ });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  // Deep link moves focus into the panel.
  await expect(panel.getByRole("heading", { name: /Document setup/ })).toBeFocused();

  const stem = panel.getByLabel("Filename");
  await expect(stem).toHaveValue(sanitizeStem(editTitle));
  await expect(panel.getByLabel("Include study notes")).not.toBeChecked();

  // All four format buttons are enabled.
  for (const name of [
    "Export DOCX",
    "Export PDF",
    // PNG label carries the page count at >= 24pt: "Image (.png)" or "Images (N pages, .zip)".
    /^Images? \((\.png|\d+ pages, \.zip)\)$/,
    "Export PowerPoint (PPTX)",
  ]) {
    await expect(panel.getByRole("button", { name })).toBeEnabled();
  }

  await stem.fill(STEM);
  await expect(panel.getByText(`${STEM}`, { exact: true })).toBeVisible();

  const docx = await exportAndDownload(page, "Export DOCX");
  expect(docx.suggestedFilename()).toBe(`${STEM}.docx`);
  const docxBytes = await readFile((await docx.path())!);
  expect(docxBytes.subarray(0, 2).toString("latin1")).toBe("PK");
  await expect(panel.getByRole("status")).toHaveText(`Downloaded ${STEM}.docx`);

  const png = await exportAndDownload(page, /^Images? \(/);
  expect(png.suggestedFilename()).toBe(`${STEM}.png`);
  const pngBytes = await readFile((await png.path())!);
  expect(pngBytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  await expect(panel.getByRole("status")).toHaveText(`Downloaded ${STEM}.png`);

  // Request contract checks.
  expect(exportBodies.map((b) => b.format)).toEqual(["docx", "png"]);
  expect(exportUrls.map((u) => new URL(u).searchParams.get("format"))).toEqual([
    "docx",
    "png",
  ]);
  for (const body of exportBodies) {
    expect(body.filenameStem).toBe(STEM);
    expect(body.includeNotes).toBe(false);
    expect(body).not.toHaveProperty("notes");
    expect(body.bionic).toBe(false);
    expect(body.flattenGradient).toBe(true);
    expect((body.resolvedColors as { accent: string }).accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(JSON.stringify(body.content)).not.toMatch(/var\s*\(\s*--/i);
  }
  expect(exportBodies[0].theme).toBe("light"); // DOCX prints light

  expect(pageErrors, pageErrors.join("\n\n")).toEqual([]);
});
