import { test, expect, type Page } from "@playwright/test";

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const LIB = "sermon-editor-presenter:library:v1";
const ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const FACES = [
  { id: "eb-garamond", css: "EB Garamond", text: "éèê à ç ô û ï œ «suppléments»" },
  { id: "crimson-pro", css: "Crimson Pro", text: "éèê à ç ô û ï œ «compléments»" },
  { id: "noto-serif", css: "Noto Serif", text: "éèê à ç ô û ï œ «être»" },
  { id: "source-sans-3", css: "Source Sans 3", text: "éèê à ç ô û ï œ «français»" },
  { id: "noto-sans", css: "Noto Sans", text: "éèê à ç ô û ï œ «déjà»" },
  { id: "ibm-plex-sans", css: "IBM Plex Sans", text: "éèê à ç ô û ï œ «cœur»" },
] as const;

async function seed(page: Page, strength?: number) {
  const runs = FACES.flatMap((f, i) => [
    {
      type: "paragraph" as const,
      content: [
        {
          type: "text",
          text: f.text,
          marks: [{ type: "textStyle", attrs: { fontFamily: `"${f.css}", ${i < 3 ? "serif" : "sans-serif"}` } }],
        },
      ],
    },
  ]);
  const sermon = {
    id: ID,
    updatedAt: new Date().toISOString(),
    notes: "",
    title: "Phase 2 Fonts",
    content: { type: "doc", content: runs },
    presentationSettings: {
      theme: "light",
      bionic: false,
      typeScaleStep: 0,
      lineHeight: 1.55,
      calibrationTarget: "paper-a4",
      page: { format: "a4", orientation: "portrait" },
      ...(strength != null ? { bionicStrength: strength } : {}),
    },
  };
  await page.addInitScript(
    ([k, id, doc]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      localStorage.setItem("sermon-editor-presenter:storage-mode:v1", "browser");
      localStorage.setItem("sermon-editor-presenter:library:v1", doc);
      localStorage.setItem(k, id);
      localStorage.setItem("sermon-editor-presenter:preach-view:v1", "flow");
    },
    [ACTIVE_ID_KEY, ID, JSON.stringify({ [ID]: { doc: sermon, savedAt: null, dirty: true } })] as const,
  );
}

test("Preach turns Bionic on even when the file says false; strength slider is 44px, defaults to 45%, persists, and cannot reach 0", async ({ page }) => {
  await seed(page);
  await page.goto("/preach", { waitUntil: "networkidle" });
  await expect(page.locator("[data-bionic]").first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Reading settings" }).click();
  const slider = page.getByRole("slider", { name: "Bionic strength" });
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(slider).toHaveValue("45");
  const min = Number(await slider.getAttribute("min"));
  expect(min).toBeGreaterThan(0);
  await slider.fill("20");
  await expect(page.locator("[data-bionic]").first()).toBeVisible();
  const raw = await page.evaluate((k) => localStorage.getItem(k), LIB);
  expect(raw).toMatch(/"bionicStrength":0\.2/);
});

test("each of the six bundled faces loads in Preach and keeps French accents", async ({ page }) => {
  await seed(page);
  await page.goto("/preach", { waitUntil: "networkidle" });
  for (const f of FACES) {
    const el = page.locator("article p", { hasText: f.text }).first();
    await expect(el).toBeVisible({ timeout: 20_000 });
    const family = await el.evaluate((node) => {
      const span = node.querySelector("span") ?? node;
      return getComputedStyle(span).fontFamily;
    });
    expect(family, f.id).toMatch(new RegExp(f.css.replace(/ /g, "\\s*"), "i"));
    const loaded = await page.evaluate((name) => document.fonts.check(`16px "${name}"`) || document.fonts.check(`700 16px "${name}"`), f.css);
    expect(loaded, `${f.css} should be loaded`).toBe(true);
  }
});
