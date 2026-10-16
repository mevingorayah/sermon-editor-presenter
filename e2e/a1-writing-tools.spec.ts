import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Step A1 writing tools (spec v2 §4.2, §4.4, §4.16a): MK1–MK4, PG2, W1, W2.
 * Every mark is applied in Edit (button and shortcut), saved, reloaded, and
 * checked in Preach (light + dark, bionic on) under the A1 fidelity rule.
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const STORAGE_MODE_KEY = "sermon-editor-presenter:storage-mode:v1";

const TARGET = "Grace abounds today";

async function seed(page: Page, opts: { theme?: "light" | "dark"; bionic?: boolean } = {}) {
  const res = await page.request.post("/api/sermons", {
    data: {
      title: "Writing Tools",
      content: {
        type: "doc",
        content: [
          { type: "title", content: [{ type: "text", text: "Writing Tools" }] },
          { type: "paragraph", content: [{ type: "text", text: TARGET }] },
          { type: "paragraph", content: [{ type: "text", text: "Plain body text for reference" }] },
        ],
      },
      presentation: {
        theme: opts.theme ?? "dark",
        bionic: opts.bionic ?? true,
        typeScaleStep: 0,
        lineHeight: 1.7,
        calibrationTarget: "screen-16-9",
      },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { sermon } = await res.json();
  await page.addInitScript(
    ([k, id, modeKey]) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      localStorage.clear();
      // Local-storage gate (#15): use browser storage, no folder picker.
      localStorage.setItem(modeKey, "browser");
      localStorage.setItem(k, id);
    },
    [ACTIVE_ID_KEY, sermon.id, STORAGE_MODE_KEY] as const,
  );
  return sermon.id as string;
}

async function openEdit(page: Page) {
  await page.goto("/edit", { waitUntil: "networkidle" });
  const pm = page.locator(".ProseMirror");
  await expect(pm.getByText(TARGET)).toBeVisible({ timeout: 20_000 });
  return pm;
}

/**
 * Put the caret/selection in a paragraph. TipTap restores its last selection
 * on a deferred focus() after toolbar commands, so retry until it sticks.
 */
async function placeIn(pm: Locator, text: string, select: boolean) {
  const page = pm.page();
  const p = pm.locator("p", { hasText: text }).first();
  await expect(async () => {
    await p.click();
    await page.keyboard.press("Home");
    await page.keyboard.press(select ? "Shift+End" : "End");
    await page.waitForTimeout(50);
    const sel = await page.evaluate(() => ({ text: String(getSelection()), node: getSelection()?.anchorNode?.textContent ?? "" }));
    if (select) expect(sel.text).toBe(text);
    else expect(sel.node).toContain(text);
  }).toPass({ timeout: 10_000 });
}

async function selectTarget(pm: Locator) {
  await placeIn(pm, TARGET, true);
}

async function waitSaved(page: Page) {
  await expect(page.getByTestId("save-status")).toHaveText("Saved to server", { timeout: 15_000 });
}

async function openPreach(page: Page) {
  await page.goto("/preach", { waitUntil: "networkidle" });
  const col = page.locator("article");
  await expect(col.getByText("Writing Tools").first()).toBeVisible({ timeout: 20_000 });
  return col;
}

/** Computed style of the first `sel` inside the paragraph containing TARGET, relative to that paragraph. */
async function runStyle(scope: Locator, sel: string) {
  return scope.evaluate(
    (root, [s, target]) => {
      const p = Array.from(root.querySelectorAll("p")).find((x) => x.textContent?.includes(target))!;
      const el = p.querySelector(s) as HTMLElement;
      const cs = getComputedStyle(el);
      const body = parseFloat(getComputedStyle(p).fontSize);
      return {
        tag: el.tagName.toLowerCase(),
        verticalAlign: cs.verticalAlign,
        sizeRatio: +(parseFloat(cs.fontSize) / body).toFixed(2),
        weight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        decoration: cs.textDecorationLine,
        textShadow: cs.textShadow,
      };
    },
    [sel, TARGET] as const,
  );
}

const MARKS = [
  { name: "Bold", tag: "strong", key: "Control+b" },
  { name: "Italic", tag: "em", key: "Control+i" },
  { name: "Underline", tag: "u", key: "Control+u" },
  { name: "Strikethrough", tag: "s", key: "Control+Shift+x" },
  { name: "Superscript", tag: "sup", key: "Control+." },
  { name: "Subscript", tag: "sub", key: "Control+," },
] as const;

for (const m of MARKS) {
  test(`MK1/MK3: ${m.name} via button and shortcut, saved, identical in Preach`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seed(page, { theme: "dark", bionic: true });
    const pm = await openEdit(page);
    const btn = page.getByRole("button", { name: m.name, exact: true });
    await expect(btn).toHaveAttribute("aria-pressed", "false");

    await selectTarget(pm);
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await expect(pm.locator(`p ${m.tag}`, { hasText: TARGET })).toHaveCount(1);

    // Shortcut toggles it off and on again.
    await selectTarget(pm);
    await page.keyboard.press(m.key);
    await expect(btn).toHaveAttribute("aria-pressed", "false");
    await expect(pm.locator(`p ${m.tag}`)).toHaveCount(0);
    await page.keyboard.press(m.key);
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    await waitSaved(page);

    // Stored after reload.
    await page.reload({ waitUntil: "networkidle" });
    const pm2 = page.locator(".ProseMirror");
    await expect(pm2.locator(`p ${m.tag}`, { hasText: TARGET })).toHaveCount(1, { timeout: 20_000 });
    const edit = await runStyle(pm2, m.tag);

    // Preach (dark, bionic on): same element and the same computed styles.
    const col = await openPreach(page);
    await expect(col.locator(`p ${m.tag}`).first()).toBeVisible();
    const preach = await runStyle(col, m.tag);
    expect(preach.tag).toBe(edit.tag);
    expect(preach.verticalAlign).toBe(edit.verticalAlign);
    expect(preach.sizeRatio).toBe(edit.sizeRatio);
    expect(preach.fontStyle).toBe(edit.fontStyle);
    expect(preach.decoration).toBe(edit.decoration);
    expect(preach.weight).toBe(edit.weight);
    expect(preach.textShadow).toBe("none");
    if (m.tag === "strong") {
      expect(edit.weight).toBe("800");
      // A3: nothing bionic inside user bold.
      await expect(col.locator("p strong:not([data-bionic]) [data-bionic]")).toHaveCount(0);
    }
    if (m.tag === "sup" || m.tag === "sub") {
      expect(edit.verticalAlign).toBe(m.tag === "sup" ? "super" : "sub");
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("MK2: superscript and subscript exclude each other", async ({ page }) => {
  await seed(page);
  const pm = await openEdit(page);
  const sup = page.getByRole("button", { name: "Superscript", exact: true });
  const sub = page.getByRole("button", { name: "Subscript", exact: true });
  await selectTarget(pm);
  await sub.click();
  await expect(pm.locator("p sub")).toHaveCount(1);
  await selectTarget(pm);
  await sup.click();
  await expect(sup).toHaveAttribute("aria-pressed", "true");
  await expect(sub).toHaveAttribute("aria-pressed", "false");
  await expect(pm.locator("p sub")).toHaveCount(0);
  await expect(pm.locator("p sup")).toHaveCount(1);
  await selectTarget(pm);
  await page.keyboard.press("Control+,");
  await expect(pm.locator("p sup")).toHaveCount(0);
  await expect(pm.locator("p sub")).toHaveCount(1);
});

test("PG2/W1/W2: fonts, size, colour dialog and highlight carry into Preach", async ({ page }) => {
  await seed(page, { theme: "dark", bionic: true });
  const pm = await openEdit(page);

  // PG2: 10 fonts plus JetBrains Mono.
  const font = page.getByLabel("Font family");
  await expect(font.locator("optgroup[label='Serif'] option")).toHaveCount(5);
  await expect(font.locator("optgroup[label='Sans'] option")).toHaveCount(5);
  await expect(font.locator("optgroup[label='Code'] option")).toHaveText(["JetBrains Mono"]);

  await selectTarget(pm);
  await font.selectOption("lora");
  await selectTarget(pm);
  const size = page.getByLabel("Font size (pt)");
  await size.fill("24");
  await size.press("Enter");

  // W2: colour dialog — focus on active swatch, arrows wrap, Enter applies, Esc returns focus.
  await selectTarget(pm);
  const trigger = page.getByRole("button", { name: "Text colour" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Text colour" });
  const radios = dialog.getByRole("radio");
  await expect(radios).toHaveCount(7); // Default + 6 presets
  await expect(radios.first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("radio", { name: "Purple" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // W1: invalid hex blocks Apply with the message.
  await selectTarget(pm);
  await trigger.click();
  const hex = dialog.getByLabel("Custom hex");
  await hex.fill("12");
  await expect(dialog.getByText("Enter 3 or 6 hex digits, e.g. #A8201A")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await hex.fill("");
  await dialog.getByRole("radio", { name: "Crimson" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);

  // Active state is shown with a check mark, not colour alone.
  await selectTarget(pm);
  await trigger.click();
  await expect(dialog.getByRole("radio", { name: "Crimson" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("radio", { name: "Crimson" })).toHaveText("✓");
  await page.keyboard.press("Escape");

  await selectTarget(pm);
  await page.getByRole("button", { name: "Highlight" }).click();
  const hl = page.getByRole("dialog", { name: "Highlight" });
  await expect(hl.getByRole("radio")).toHaveCount(7); // None + 6
  await hl.getByRole("radio", { name: "Green" }).click();

  const span = pm.locator("p span[data-font='lora']").first();
  await expect(span).toHaveCSS("color", "rgb(168, 32, 26)");
  await expect(span).toHaveCSS("font-family", /Lora/);
  await expect(pm.locator("p mark")).toHaveCSS("background-color", "rgb(197, 232, 183)");
  await waitSaved(page);

  const ratio = (scope: Locator) =>
    scope.evaluate((root, target) => {
      const p = Array.from(root.querySelectorAll("p")).find((x) => x.textContent?.includes(target))!;
      const el = p.querySelector("span[style*='font-family']") as HTMLElement;
      return +(parseFloat(getComputedStyle(el).fontSize) / parseFloat(getComputedStyle(p).fontSize)).toFixed(2);
    }, TARGET);
  const editRatio = await ratio(pm);
  expect(editRatio).toBeCloseTo(24 / 18, 1);

  const col = await openPreach(page);
  const pSpan = col.locator("p span[style*='font-family']").first();
  await expect(pSpan).toHaveCSS("font-family", /Lora/);
  await expect(pSpan).toHaveCSS("color", "rgb(255, 138, 128)"); // Crimson dark variant
  await expect(col.locator("p mark")).toHaveCSS("background-color", "rgb(81, 92, 74)"); // Green dark
  expect(await ratio(col)).toBe(editRatio);
});

test("custom hex applies, normalises, and joins Recent", async ({ page }) => {
  await seed(page);
  const pm = await openEdit(page);
  await selectTarget(pm);
  await page.getByRole("button", { name: "Text colour" }).click();
  const dialog = page.getByRole("dialog", { name: "Text colour" });
  await dialog.getByLabel("Custom hex").fill("1d6");
  await expect(dialog.getByTestId("contrast-meter")).toContainText("Light:");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(pm.locator("p span[style*='color']").first()).toHaveCSS("color", "rgb(17, 221, 102)");
  const recent = await page.evaluate(() => localStorage.getItem("sermon-editor-presenter:recent-colors:v1"));
  expect(JSON.parse(recent!)).toEqual(["#11DD66"]);
});

test("R4/MK4: bionic shows on JetBrains Mono, not on short superscripts", async ({ page }) => {
  await seed(page, { theme: "light", bionic: true });
  const pm = await openEdit(page);
  await selectTarget(pm);
  await page.getByLabel("Font family").selectOption("jetbrains-mono");
  await waitSaved(page);
  await placeIn(pm, "Plain body text for reference", false);
  await page.keyboard.press("Control+.");
  await page.keyboard.type("16");
  await waitSaved(page);
  await expect(pm.locator("p span[data-font='jetbrains-mono']")).toHaveText(TARGET);
  const col = await openPreach(page);
  const mono = col.locator("p span[style*='JetBrains'] strong[data-bionic]").first();
  await expect(mono).toBeVisible();
  const [bionicW, regularW] = await mono.evaluate((el) => {
    const regular = el.nextElementSibling as HTMLElement;
    return [el.getBoundingClientRect().width / el.textContent!.length, regular.getBoundingClientRect().width / regular.textContent!.length];
  });
  // Monospace: every glyph has the same advance, so compare weight instead.
  expect(await mono.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("600");
  expect(bionicW).toBeGreaterThan(0);
  expect(regularW).toBeGreaterThan(0);
  await expect(col.locator("p sup")).toHaveText("16");
  await expect(col.locator("p sup [data-bionic]")).toHaveCount(0);
});
