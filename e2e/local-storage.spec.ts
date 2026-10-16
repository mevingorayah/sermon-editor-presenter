import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Local-only storage (Mevin's PC only). showDirectoryPicker is stubbed with an
 * OPFS-backed "Sermons" directory because real pickers can't run headless.
 * Every test also asserts the app never calls /api/sermons.
 */

const ACCENTED = "Lavi é bon: é è ç ï, Bondié kontan nou";

function trackSermonApi(page: Page) {
  const hits: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/sermons")) hits.push(`${req.method()} ${req.url()}`);
  });
  return hits;
}

async function stubPicker(page: Page) {
  await page.context().addInitScript(() => {
    const getSermonsDir = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle("Sermons", { create: true });
    (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker = getSermonsDir;

    // Chromium (headless and full, build 1243) crashes the renderer when an
    // OPFS handle is read back from IndexedDB. Real folder handles from the
    // picker are fine, so in tests only: store a marker instead and hand back
    // a delegating handle on read. App code is unchanged.
    const MARK = "__e2e_opfs_sermons__";
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (value instanceof FileSystemDirectoryHandle) {
        return put.call(this, MARK, key);
      }
      return put.call(this, value, key);
    };
    const proxyDir = () => {
      let cached: Promise<FileSystemDirectoryHandle> | null = null;
      const dir = () => (cached ??= getSermonsDir());
      return {
        kind: "directory",
        name: "Sermons",
        getFileHandle: async (n: string, o?: FileSystemGetFileOptions) => (await dir()).getFileHandle(n, o),
        removeEntry: async (n: string) => (await dir()).removeEntry(n),
        values: async function* () {
          yield* ((await dir()) as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
        },
        queryPermission: async () => "granted",
        requestPermission: async () => "granted",
      };
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key: IDBValidKey | IDBKeyRange) {
      const req = get.call(this, key);
      const desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result")!;
      Object.defineProperty(req, "result", {
        get() {
          const v = desc.get!.call(req);
          return v === MARK ? proxyDir() : v;
        },
      });
      return req;
    };
  });
}

async function freshStart(page: Page) {
  await page.goto("/edit");
  await page.evaluate(async () => {
    localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      await root.removeEntry(name, { recursive: true });
    }
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase("sermon-editor-presenter");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.reload();
}

async function folderFiles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("Sermons", { create: true });
    const out: Record<string, string> = {};
    for await (const h of (dir as unknown as { values(): AsyncIterable<FileSystemFileHandle> }).values()) {
      if (h.kind === "file") out[h.name] = await (await h.getFile()).text();
    }
    return out;
  });
}

async function pickFolder(page: Page) {
  await expect(page.getByRole("heading", { name: "Choose where your sermons are saved" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Choosing a folder inside Google Drive or OneDrive also gives you a free backup.")).toBeVisible();
  await page.getByRole("button", { name: "Choose folder" }).click();
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
}

async function typeAtEnd(page: Page, text: string) {
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

async function restoreFrom(page: Page, path: string) {
  await page.getByRole("button", { name: "Document" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Restore…" }).click();
  await (await chooser).setFiles(path);
}

async function backupTo(page: Page, testInfo: { outputPath(n: string): string }) {
  await page.getByRole("button", { name: "Document" }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Back up…" }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/^sermons-backup-\d{4}-\d{2}-\d{2}\.sermon-backup$/);
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return path;
}

test.describe("local-only storage", () => {
  test.beforeEach(async ({ page }) => {
    await stubPicker(page);
  });

  test("first-run folder pick, status words, type → reload → still there", async ({ page }) => {
    const hits = trackSermonApi(page);
    await freshStart(page);
    await pickFolder(page);
    const files = await folderFiles(page);
    expect(Object.keys(files).some((n) => n.endsWith(".sermon"))).toBe(true);

    await typeAtEnd(page, ACCENTED);
    await expect(page.getByTestId("save-status")).toHaveText("Saving…");
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    const after = Object.values(await folderFiles(page)).join("\n");
    expect(after).toContain(ACCENTED);
    expect(JSON.parse(Object.values(await folderFiles(page))[0])).toMatchObject({ schemaVersion: 1 });

    await page.reload();
    await expect(page.locator(".ProseMirror")).toContainText(ACCENTED, { timeout: 20_000 });
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");

    // Preach shows the same sermon from local storage.
    await page.goto("/preach");
    await expect(page.getByText(ACCENTED)).toBeVisible({ timeout: 20_000 });
    expect(hits).toEqual([]);
  });

  test("moved folder shows Couldn't save. Folder not found. [Choose folder]", async ({ page }) => {
    const hits = trackSermonApi(page);
    await freshStart(page);
    await pickFolder(page);
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry("Sermons", { recursive: true });
    });
    await typeAtEnd(page, "after move");
    await expect(page.getByTestId("save-status")).toHaveText("Couldn't save. Folder not found.");
    await expect(page.getByRole("button", { name: "Choose folder" })).toBeVisible();
    await page.getByRole("button", { name: "Choose folder" }).click();
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    expect(Object.values(await folderFiles(page)).join("")).toContain("after move");
    expect(hits).toEqual([]);
  });

  test("backup → clear storage → restore with preview keeps accents", async ({ page }, testInfo) => {
    const hits = trackSermonApi(page);
    await freshStart(page);
    await pickFolder(page);
    await typeAtEnd(page, ACCENTED);
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    const backup = await backupTo(page, testInfo);
    expect(readFileSync(backup, "utf8")).toContain(ACCENTED);

    await freshStart(page);
    await pickFolder(page); // new empty folder → sample sermon only
    await expect(page.locator(".ProseMirror")).not.toContainText(ACCENTED);

    await restoreFrom(page, backup);
    const dialog = page.getByRole("dialog", { name: "Restore from backup" });
    await expect(dialog.getByTestId("restore-summary")).toContainText("has 1 sermon");
    await expect(dialog.getByTestId("restore-preview")).toContainText("Joy That Outlasts the Moment");
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("button", { name: "OK" }).click();

    // The restored copy (different id → added alongside the new sample).
    const restored = page.getByRole("navigation", { name: "Sermons" }).getByRole("button", { name: /^Joy That Outlasts/ });
    await expect(restored).toHaveCount(2);
    const all = Object.values(await folderFiles(page)).join("\n");
    expect(all).toContain(ACCENTED);
    for (const b of await restored.all()) {
      await b.click();
      if (await page.locator(".ProseMirror").getByText(ACCENTED).count()) break;
    }
    await expect(page.locator(".ProseMirror")).toContainText(ACCENTED);
    await expect(page.locator(".ProseMirror")).toContainText("Rejoice in the Lord always");
    expect(hits).toEqual([]);
  });

  test("broken backup shows an error, not a crash", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await freshStart(page);
    await pickFolder(page);
    const bad = testInfo.outputPath("bad.sermon-backup");
    writeFileSync(bad, '{"kind":"sermon-editor-presenter/backup","schemaVersion":1,"savedAt":"2026-10-01T00:00:00Z","sermons":[{"id":"x"}]}');
    await restoreFrom(page, bad);
    await expect(page.getByRole("dialog", { name: "Restore" }).getByRole("alert")).toContainText("damaged or incomplete");
    expect(errors).toEqual([]);
  });

  test("restore id conflict: keep-both default gives new id + distinct file; replace warns and keeps open edits", async ({ page }, testInfo) => {
    const hits = trackSermonApi(page);
    await freshStart(page);
    await pickFolder(page);
    await typeAtEnd(page, "version one");
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    const backup = await backupTo(page, testInfo);
    const backupId = JSON.parse(readFileSync(backup, "utf8")).sermons[0].id as string;

    await typeAtEnd(page, "version two");
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");

    // Keep both (default).
    await restoreFrom(page, backup);
    let dialog = page.getByRole("dialog", { name: "Restore from backup" });
    await expect(dialog.getByRole("radio", { name: "Keep both" })).toBeChecked();
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("button", { name: "OK" }).click();
    const files = await folderFiles(page);
    expect(Object.keys(files)).toHaveLength(2);
    const parsed = Object.values(files).map((t) => JSON.parse(t).sermon);
    const copy = parsed.find((s) => s.title.endsWith(" (restored)"));
    expect(copy).toBeTruthy();
    expect(copy.id).not.toBe(backupId);
    expect(parsed.find((s) => s.id === backupId)).toBeTruthy();
    // Open sermon untouched.
    await expect(page.locator(".ProseMirror")).toContainText("version two");

    // Replace while the open sermon has unsaved edits: warning shown, edits kept as a copy.
    await typeAtEnd(page, "unsaved three");
    await restoreFrom(page, backup);
    dialog = page.getByRole("dialog", { name: "Restore from backup" });
    await dialog.getByRole("radio", { name: "Replace" }).check();
    await expect(dialog.getByTestId("restore-unsaved-warning")).toBeVisible();
    await dialog.getByRole("button", { name: "Restore", exact: true }).click();
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.locator(".ProseMirror")).not.toContainText("version two");
    const all = Object.values(await folderFiles(page)).map((t) => JSON.parse(t).sermon);
    const mine = all.find((s) => s.title.endsWith("(my edits)"));
    expect(mine, "open-tab edits preserved").toBeTruthy();
    expect(JSON.stringify(mine.content)).toContain("unsaved three");
    expect(hits).toEqual([]);
  });

  test("two tabs: a newer copy saved elsewhere is never overwritten silently", async ({ page, context }) => {
    await freshStart(page);
    await pickFolder(page);
    // Another window saves a newer version (direct disk write: no broadcast reaches us).
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("Sermons");
      for await (const h of (dir as unknown as { values(): AsyncIterable<FileSystemFileHandle> }).values()) {
        const f = JSON.parse(await (await h.getFile()).text());
        f.savedAt = new Date(Date.now() + 60_000).toISOString();
        f.sermon.notes = "from the other window";
        const w = await h.createWritable();
        await w.write(JSON.stringify(f));
        await w.close();
      }
    });
    await typeAtEnd(page, "mine A");
    await expect(page.getByRole("alertdialog", { name: "Sermon changed elsewhere" })).toBeVisible();
    await expect(page.getByTestId("save-status")).not.toHaveText("Saved to Sermons folder");
    expect(Object.values(await folderFiles(page)).join("")).not.toContain("mine A");
    await page.getByRole("button", { name: "Keep mine" }).click();
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    expect(Object.values(await folderFiles(page)).join("")).toContain("mine A");

    // A second tab saves; this tab (clean) picks it up via BroadcastChannel.
    const other = await context.newPage();
    await other.goto("/edit");
    await expect(other.getByTestId("save-status")).toHaveText("Saved to Sermons folder", { timeout: 20_000 });
    await typeAtEnd(other, "from tab B");
    await expect(other.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    await expect(page.locator(".ProseMirror")).toContainText("from tab B");
    await expect(page.locator(".ProseMirror")).toContainText("mine A");

    // Load theirs path.
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("Sermons");
      for await (const h of (dir as unknown as { values(): AsyncIterable<FileSystemFileHandle> }).values()) {
        const f = JSON.parse(await (await h.getFile()).text());
        f.savedAt = new Date(Date.now() + 120_000).toISOString();
        f.sermon.content.content.push({ type: "paragraph", content: [{ type: "text", text: "theirs C" }] });
        const w = await h.createWritable();
        await w.write(JSON.stringify(f));
        await w.close();
      }
    });
    await typeAtEnd(page, "mine D");
    await page.getByRole("button", { name: "Load theirs" }).click();
    await expect(page.locator(".ProseMirror")).toContainText("theirs C");
    await expect(page.getByTestId("save-status")).toHaveText("Saved to Sermons folder");
    await other.close();
  });
});

test("browser-only fallback when the folder API is absent", async ({ page }, testInfo) => {
  const hits = trackSermonApi(page);
  await page.addInitScript(() => {
    delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    // Chromium defines it on the prototype chain too.
    Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true });
  });
  await page.goto("/edit");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("browser-only-note")).toContainText("kept in this browser");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser", { timeout: 20_000 });
  await typeAtEnd(page, ACCENTED);
  await expect(page.getByTestId("save-status")).toHaveText("Saved in this browser");
  await page.reload();
  await expect(page.locator(".ProseMirror")).toContainText(ACCENTED, { timeout: 20_000 });
  const backup = await backupTo(page, testInfo);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".ProseMirror")).not.toContainText(ACCENTED);
  await restoreFrom(page, backup);
  await page.getByRole("dialog").getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByRole("button", { name: "OK" }).click();
  const btns = page.getByRole("navigation", { name: "Sermons" }).getByRole("button", { name: /^Joy That Outlasts/ });
  for (const b of await btns.all()) {
    await b.click();
    if (await page.locator(".ProseMirror").getByText(ACCENTED).count()) break;
  }
  await expect(page.locator(".ProseMirror")).toContainText(ACCENTED);
  expect(hits).toEqual([]);
});

test("backup reminder after 7 days: Edit only, dismissible, never in Preach", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    localStorage.clear();
    localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
    localStorage.setItem("sermon-editor-presenter:first-use-at:v1", new Date(Date.now() - 8 * 86_400_000).toISOString());
  });
  await page.goto("/edit");
  await expect(page.getByTestId("backup-reminder")).toBeVisible({ timeout: 20_000 });
  await page.goto("/preach");
  await expect(page.getByText("Rejoice in the Lord always").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  await page.goto("/edit");
  await page.getByRole("button", { name: "Dismiss backup reminder" }).click();
  await page.reload();
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
});
