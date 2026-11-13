import { test, expect, type Page, type Locator } from "@playwright/test";

/** Made-up paste text only; bundled LSG/WEB is asserted from /bibles at runtime. */
const ESV_PASTE = "  PASTED ESV — made-up, stored exactly.  ";
const NIV_PASTE = "PASTED NIV — a different made-up line.";
const OLD_SCRIPTURE = "Existing scripture quote — left untouched.";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ACTIVE = "sermon-editor-presenter:active-id:v1";
const LIB = "sermon-editor-presenter:library:v1";

const content = {
  type: "doc",
  content: [
    { type: "title", content: [{ type: "text", text: "Verse snippet fixture" }] },
    {
      type: "scripture",
      attrs: { citation: "Philippians 4:4" },
      content: [{ type: "text", text: OLD_SCRIPTURE }],
    },
    {
      type: "verseSnippet",
      attrs: { ref: "Jean 3:16", translation: "LSG", texts: {} },
    },
  ],
};

function sermon() {
  return {
    id: ID,
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "Verse snippet fixture",
    content,
    presentationSettings: {
      theme: "dark",
      bionic: false,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: "screen-16-9",
      page: { format: "a4", orientation: "portrait" },
    },
  };
}

/** Read bundled verses at runtime so this file never stores Bible text. */
async function bundledText(
  page: Page,
  translation: "lsg" | "web",
  book: string,
  chapter: number,
  from: number,
  to = from,
): Promise<string> {
  return page.evaluate(
    async ({ translation, book, chapter, from, to }) => {
      const res = await fetch(`/bibles/${translation}/${book}.json`);
      const data = (await res.json()) as Record<string, Record<string, string>>;
      const ch = data[String(chapter)];
      const parts: string[] = [];
      for (let v = from; v <= to; v++) parts.push(ch[String(v)]);
      return parts.join(" ");
    },
    { translation, book, chapter, from, to },
  );
}

async function seed(page: Page) {
  const doc = JSON.stringify({ [ID]: { doc: sermon(), savedAt: null, dirty: true } });
  await page.addInitScript(
    ([activeKey, id, libKey, lib]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem("sermon-editor-presenter:preach-view:v1", "flow");
      localStorage.setItem(libKey as string, lib as string);
      localStorage.setItem(activeKey as string, id as string);
    },
    [ACTIVE, ID, LIB, doc] as const,
  );
}

async function openEdit(page: Page) {
  await seed(page);
  await page.goto("/edit");
  const notNow = page.getByRole("button", { name: "Not now, keep them in this browser" });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 20_000 });
  const n = page.getByRole("button", { name: "Not now, keep them in this browser" });
  if (await n.isVisible().catch(() => false)) await n.click();
  await expect(page.locator("[data-verse-snippet]")).toBeVisible({ timeout: 20_000 });
}

async function expectTap(l: Locator, name: string) {
  await expect(l, name).toBeVisible();
  const b = await l.boundingBox();
  expect(b, name).not.toBeNull();
  expect(b!.width, `${name} width`).toBeGreaterThanOrEqual(44);
  expect(b!.height, `${name} height`).toBeGreaterThanOrEqual(44);
}

test("verse snippet: bundled switch, paste restore, 44px controls, Preach serif", async ({ page }) => {
  await openEdit(page);
  const lsg16 = await bundledText(page, "lsg", "JHN", 3, 16);
  const web16 = await bundledText(page, "web", "JHN", 3, 16);
  const lsgRange = await bundledText(page, "lsg", "JHN", 3, 16, 18);
  expect(lsg16.length).toBeGreaterThan(10);
  expect(web16.length).toBeGreaterThan(10);

  const block = page.locator("[data-verse-snippet]").first();
  await expect(block).toContainText(lsg16, { timeout: 20_000 });
  await expect(page.locator(".ProseMirror")).toContainText(OLD_SCRIPTURE);

  const refInput = block.getByRole("textbox", { name: "Reference" });
  const translation = block.getByRole("combobox", { name: "Translation" });
  const refresh = block.getByRole("button", { name: "Refresh passage" });
  await expect(refInput).toHaveValue("Jean 3:16");
  await expect(translation).toHaveValue("LSG");
  await expectTap(refInput, "Reference");
  await expectTap(translation, "Translation");
  await expectTap(refresh, "Refresh");

  // Changing the bundled translation updates the block in place from the offline bundle.
  await translation.selectOption("WEB");
  await expect(block).toContainText(web16, { timeout: 20_000 });
  await expect(block).not.toContainText(lsg16);

  // Licensed path: Bible Gateway link + paste, restore on switch-back.
  await translation.selectOption("ESV");
  const gateway = block.getByRole("link", { name: "Open on Bible Gateway" });
  await expect(gateway).toBeVisible();
  await expectTap(gateway, "Open on Bible Gateway");
  const href = await gateway.getAttribute("href");
  expect(href).toContain("https://www.biblegateway.com/passage/");
  expect(href).toContain("version=ESV");
  expect(href).toMatch(/search=John/);
  const paste = block.getByRole("textbox", { name: "Paste passage" });
  await expectTap(paste, "Paste passage");
  await paste.fill(ESV_PASTE);
  await expect(paste).toHaveValue(ESV_PASTE);

  await translation.selectOption("NIV");
  await expect(block.getByRole("textbox", { name: "Paste passage" })).toHaveValue("");
  await block.getByRole("textbox", { name: "Paste passage" }).fill(NIV_PASTE);
  await translation.selectOption("ESV");
  await expect(block.getByRole("textbox", { name: "Paste passage" })).toHaveValue(ESV_PASTE);

  // Bundled refresh after a new reference updates in place.
  await translation.selectOption("LSG");
  await refInput.fill("Jn 3.16-18");
  await refInput.press("Enter");
  await expect(block).toContainText(lsgRange, { timeout: 20_000 });

  // Existing scripture citation is unchanged.
  await expect(page.locator(".sermon-scripture-citation-input")).toHaveValue("Philippians 4:4");

  // Persist through a reload (localStore).
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-saved", "true", { timeout: 20_000 });
  await page.reload();
  await expect(page.locator("[data-verse-snippet]")).toBeVisible({ timeout: 20_000 });
  const block2 = page.locator("[data-verse-snippet]").first();
  await expect(block2).toContainText(lsgRange);
  await expect(block2.getByRole("combobox", { name: "Translation" })).toHaveValue("LSG");
  await block2.getByRole("combobox", { name: "Translation" }).selectOption("ESV");
  await expect(block2.getByRole("textbox", { name: "Paste passage" })).toHaveValue(ESV_PASTE);
  await expect(page.locator(".ProseMirror")).toContainText(OLD_SCRIPTURE);
  // Switch back so Preach shows the bundled LSG range, not the ESV paste.
  await block2.getByRole("combobox", { name: "Translation" }).selectOption("LSG");
  await expect(block2).toContainText(lsgRange);
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-saved", "true", { timeout: 20_000 });

  await page.goto("/preach");
  const view = page.locator("[data-reading-mode]");
  await expect(view).toBeVisible({ timeout: 20_000 });
  const snippet = page.locator("[data-verse-snippet]").first();
  await expect(snippet).toBeVisible({ timeout: 20_000 });
  await expect(snippet).toContainText(lsgRange);
  await expect(snippet.locator("cite")).toContainText(/Jn 3\.16-18/i);
  await expect(page.getByRole("button", { name: "Refresh passage" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open on Bible Gateway" })).toHaveCount(0);
  await expect(view).toContainText(OLD_SCRIPTURE);
  const font = await snippet.locator("p").first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font.toLowerCase()).toMatch(/literata|georgia|serif/);
});

test("Verse snippet toolbar inserts an empty node that is keyboard-accessible", async ({ page }) => {
  await openEdit(page);
  // Move the caret off the existing atom so insert adds a second node instead of replacing it.
  await page.locator(".ProseMirror").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Verse snippet", exact: true }).click();
  const blocks = page.locator("[data-verse-snippet]");
  await expect(blocks).toHaveCount(2);
  const fresh = blocks.last();
  const translation = fresh.getByRole("combobox", { name: "Translation" });
  await translation.selectOption("LSG");
  const ref = fresh.getByRole("textbox", { name: "Reference" });
  await ref.focus();
  await expect(ref).toBeFocused();
  await ref.fill("Jean 3:16");
  await ref.press("Enter");
  const lsg16 = await bundledText(page, "lsg", "JHN", 3, 16);
  await expect(fresh).toContainText(lsg16, { timeout: 20_000 });
  await ref.press("Tab");
  await expect(translation).toBeFocused();
});
