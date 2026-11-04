import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Save to PC / Open (.sermon files). Uses only made-up text. Every test asserts
 * that no request reaches /api/sermons while saving or opening.
 */
const SHOTS = process.env.FE_SHOTS_DIR;
const MADE_UP = "Made-up test line: the lamp on the hill, é è ç";
const LATER = "Later edit that is not in the file";

function trackSermonApi(page: Page) {
  const hits: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/sermons")) hits.push(`${req.method()} ${req.url()}`);
  });
  return hits;
}

async function startInBrowserMode(page: Page, opts: { picker: boolean }) {
  await page.addInitScript((usePicker: boolean) => {
    // Keep runs independent: always start from first run.
    if (!sessionStorage.getItem("__e2e_started")) {
      localStorage.clear();
      sessionStorage.setItem("__e2e_started", "1");
    }
    const w = window as unknown as Record<string, unknown>;
    if (!usePicker) {
      delete w.showSaveFilePicker;
      return;
    }
    w.__saved = [] as Array<{ name: string; text: string }>;
    w.showSaveFilePicker = async (o: { suggestedName: string }) => ({
      createWritable: async () => {
        let text = "";
        return {
          write: async (d: Blob | string) => {
            text += typeof d === "string" ? d : await d.text();
          },
          close: async () => {
            (w.__saved as Array<{ name: string; text: string }>).push({ name: o.suggestedName, text });
          },
        };
      },
    });
  }, opts.picker);
  await page.goto("/edit");
  await page.getByRole("button", { name: "Not now, keep them in this browser" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test.describe("Save to PC / Open", () => {
  test("buttons are 44px with labels; save (download) → edit → Open asks first → round trip", async ({ page }, testInfo) => {
    const hits = trackSermonApi(page);
    await startInBrowserMode(page, { picker: false });

    const save = page.getByRole("button", { name: /^Save to PC/ });
    const open = page.getByRole("button", { name: /^Open a sermon file/ });
    for (const b of [save, open]) {
      const box = (await b.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    await shot(page, "01-toolbar");

    await typeAtEnd(page, MADE_UP);
    const dl = page.waitForEvent("download");
    await save.click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/\.sermon$/);
    const path = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(path);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    expect(saved.kind).toBe("sermon-editor-presenter/sermon");
    expect(JSON.stringify(saved.sermon.content)).toContain(MADE_UP);

    await typeAtEnd(page, LATER);

    // Cancel keeps the edits.
    let chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+o");
    await (await chooser).setFiles(path);
    const confirm = page.getByTestId("open-confirm");
    await expect(confirm).toContainText("Opening will replace unsaved changes. Continue?");
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await shot(page, "02-unsaved-confirm");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator(".ProseMirror")).toContainText(LATER);

    // Continue opens the file exactly.
    chooser = page.waitForEvent("filechooser");
    await open.click();
    await (await chooser).setFiles(path);
    await page.getByTestId("open-confirm").getByRole("button", { name: "Open" }).click();
    await expect(page.locator(".ProseMirror")).toContainText(MADE_UP);
    await expect(page.locator(".ProseMirror")).not.toContainText(LATER);
    await shot(page, "03-after-open");

    // The reopened sermon saves back with identical content.
    const dl2 = page.waitForEvent("download");
    await page.keyboard.press("Control+s");
    const again = JSON.parse(readFileSync(await (await dl2).path(), "utf8"));
    expect(again.sermon.content).toEqual(saved.sermon.content);
    expect(again.sermon.id).toBe(saved.sermon.id);

    expect(hits).toEqual([]);
  });

  test("Ctrl+S uses the save picker where supported; Open with no unsaved edits doesn't ask", async ({ page }, testInfo) => {
    const hits = trackSermonApi(page);
    await startInBrowserMode(page, { picker: true });
    await typeAtEnd(page, MADE_UP);
    await page.keyboard.press("Control+s");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __saved: unknown[] }).__saved.length)).toBe(1);
    const rec = await page.evaluate(() => (window as unknown as { __saved: Array<{ name: string; text: string }> }).__saved[0]);
    expect(rec.name).toMatch(/\.sermon$/);
    const path = testInfo.outputPath("picker.sermon");
    writeFileSync(path, rec.text);

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^Open a sermon file/ }).click();
    await (await chooser).setFiles(path);
    await expect(page.getByTestId("open-confirm")).toHaveCount(0);
    await expect(page.locator(".ProseMirror")).toContainText(MADE_UP);
    expect(hits).toEqual([]);
  });

  test("bad files show the clear error and change nothing", async ({ page }, testInfo) => {
    const hits = trackSermonApi(page);
    await startInBrowserMode(page, { picker: false });
    await typeAtEnd(page, MADE_UP);
    const before = await page.locator(".ProseMirror").innerText();

    const bad = testInfo.outputPath("bad.sermon");
    writeFileSync(bad, '{"kind":"sermon-editor-presenter/sermon","schemaVersion":1,"sermon":{"oops":');
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^Open a sermon file/ }).click();
    await (await chooser).setFiles(bad);
    // Unsaved edits → confirm is not shown for a file that can't be opened.
    await expect(page.getByTestId("open-confirm")).toHaveCount(0);
    const err = page.getByRole("dialog", { name: "Open" });
    await expect(err.getByRole("alert")).toBeVisible();
    await shot(page, "04-bad-file-error");
    await err.getByRole("button", { name: "OK" }).click();
    expect(await page.locator(".ProseMirror").innerText()).toBe(before);
    expect(hits).toEqual([]);
  });
});
