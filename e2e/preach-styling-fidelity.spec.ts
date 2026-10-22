import { test, expect, type Page } from "@playwright/test";

/**
 * Edit → Preach styling fidelity (UI UX acceptance rule):
 * every mark, font, alignment and block in Edit is kept in Preach. Allowed
 * differences: (1) uniform size scale, (2) dark theme lifts low-contrast user
 * colours (same hue) and uses a dark highlight, (3) bionic only adds bold.
 */

const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";
const RED = "#b91c1c";
const NAVY = "#1e3a8a"; // low contrast on dark → lifted
const GOLD = "#fbbf24"; // passes on dark → unchanged
const FONT = "Courier New";

const run = (text: string, marks: unknown[]) => ({ type: "text", text, marks });

const content = {
  type: "doc",
  content: [
    { type: "title", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Fidelity Sermon" }] },
    { type: "heading", attrs: { level: 1, textAlign: "right" }, content: [{ type: "text", text: "Point one" }] },
    { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [{ type: "text", text: "Sub point" }] },
    {
      type: "paragraph",
      attrs: { textAlign: "center" },
      content: [
        run("Navy", [{ type: "textStyle", attrs: { color: NAVY, fontFamily: FONT } }]),
        { type: "text", text: " " },
        run("Gold", [{ type: "textStyle", attrs: { color: GOLD } }]),
        { type: "text", text: " " },
        run("Marked", [{ type: "highlight" }]),
        { type: "text", text: " " },
        run("Bold", [{ type: "bold" }]),
        { type: "text", text: " " },
        run("Italic", [{ type: "italic" }]),
        { type: "text", text: " " },
        run("Under", [{ type: "underline" }]),
        { type: "text", text: " " },
        run("Struck", [{ type: "strike" }]),
        { type: "hardBreak" },
        run("Linked", [{ type: "link", attrs: { href: "https://example.org" } }]),
      ],
    },
    {
      type: "bulletList",
      content: ["Alpha", "Beta"].map((t) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [run(t, [{ type: "textStyle", attrs: { color: RED } }])] }],
      })),
    },
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: ["First", "Second"].map((t) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
      })),
    },
    { type: "horizontalRule" },
    {
      type: "scripture",
      attrs: { citation: "John 3:16", textAlign: "center" },
      content: [run("For God so loved the world", [{ type: "italic" }])],
    },
  ],
};

function lum(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map((n) => {
    const s = Number(n) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

async function seed(page: Page, theme: "light" | "dark", bionic: boolean) {
  const res = await page.request.post("/api/sermons", {
    data: {
      title: "Fidelity Sermon",
      content,
      presentation: { theme, bionic, typeScaleStep: 0, lineHeight: 1.7, calibrationTarget: "screen-16-9" },
    },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const { sermon } = await res.json();
  await page.addInitScript(
    ([k, id]) => {
      localStorage.clear();
      localStorage.setItem(k, id);
      localStorage.setItem("sermon-editor-presenter:preach-view:v1", "flow");
    },
    [ACTIVE_ID_KEY, sermon.id] as const,
  );
  return sermon.id as string;
}

for (const theme of ["light", "dark"] as const) {
  for (const bionic of [false, true]) {
    test(`Preach keeps Edit styling (${theme}, bionic ${bionic ? "on" : "off"})`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await seed(page, theme, bionic);
      await page.goto("/preach", { waitUntil: "networkidle" });
      const col = page.locator("article");
      await expect(col.getByText("Fidelity Sermon")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator(`[data-reading-mode][data-theme="${theme}"]`).first()).toBeVisible();

      const para = col.locator("p", { hasText: "Linked" }).first();
      // Font family + colour (rule 2: dark lifts NAVY but keeps hue; GOLD unchanged).
      const navy = col.locator(`span[style*="font-family"]`).first();
      await expect(navy).toHaveCSS("font-family", /Courier New/);
      const navyColor = await navy.evaluate((el) => getComputedStyle(el).color);
      await expect(col.locator('span[style*="color"]').nth(1)).toHaveCSS("color", "rgb(251, 191, 36)");
      const bg = await page
        .locator("[data-reading-mode]")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      if (theme === "light") {
        expect(navyColor).toBe("rgb(30, 58, 138)");
      } else {
        expect(navyColor).not.toBe("rgb(30, 58, 138)");
        expect(contrast(navyColor, bg)).toBeGreaterThanOrEqual(4.5);
        const [r, g, b] = navyColor.match(/\d+/g)!.map(Number);
        expect(b).toBeGreaterThan(r); // still blue
        expect(b).toBeGreaterThan(g);
      }

      // Highlight
      const mark = para.locator("mark.sermon-highlight");
      await expect(mark).toHaveText("Marked");
      const markBg = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(markBg).not.toBe("rgba(0, 0, 0, 0)");
      const markFg = await mark.evaluate((el) => getComputedStyle(el).color);
      const opaqueBg = theme === "dark" ? "rgb(101, 95, 51)" : bg;
      if (theme === "dark") expect(markBg).toBe(opaqueBg);
      expect(contrast(markFg, opaqueBg)).toBeGreaterThanOrEqual(4.5);

      // Marks (rule 3: bionic never removes them)
      await expect(para.locator("strong:not([data-bionic])")).toHaveText("Bold");
      await expect(para.locator("em")).toHaveText("Italic");
      await expect(para.locator("u")).toHaveText("Under");
      await expect(para.locator("s")).toHaveText("Struck");
      await expect(para.locator("a[href='https://example.org']")).toHaveText("Linked");
      await expect(para.locator("br")).toHaveCount(1);
      if (bionic) {
        await expect(col.locator("[data-bionic]").first()).toBeVisible();
        await expect(para.locator("em [data-bionic]")).toHaveCount(1);
      } else {
        await expect(col.locator("[data-bionic]")).toHaveCount(0);
      }

      // Alignment on every block type
      await expect(col.locator("h1")).toHaveCSS("text-align", "center");
      await expect(col.locator("h2", { hasText: "Point one" })).toHaveCSS("text-align", "right");
      await expect(col.locator("h3", { hasText: "Sub point" })).toHaveCSS("text-align", "center");
      await expect(para).toHaveCSS("text-align", "center");
      await expect(col.locator("figure[data-scripture]")).toHaveCSS("text-align", "center");

      // Lists + rule
      await expect(col.locator("ul > li")).toHaveText(["Alpha", "Beta"]);
      await expect(col.locator("ol > li")).toHaveText(["First", "Second"]);
      await expect(col.locator("hr")).toHaveCount(1);

      // Scripture: marks kept, never bionic, citation caption-right below.
      const fig = col.locator("figure[data-scripture]");
      await expect(fig.locator("em")).toHaveText("For God so loved the world");
      await expect(fig.locator("[data-bionic]")).toHaveCount(0);
      await expect(fig.locator("figcaption")).toHaveCSS("text-align", "right");

      // Body font matches Edit's body font.
      await expect(para).toHaveCSS("font-family", /Source Serif/);

      await page.screenshot({
        path: `/workspace/fidelity-shots/after-preach-${theme}-bionic-${bionic ? "on" : "off"}.png`,
        fullPage: true,
      });
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
}

test("Edit and Preach agree on fonts, colours and proportions (light)", async ({ page }) => {
  await seed(page, "light", false);
  await page.goto("/edit", { waitUntil: "networkidle" });
  const pm = page.locator(".ProseMirror");
  await expect(pm.getByText("Fidelity Sermon")).toBeVisible({ timeout: 20_000 });
  const read = async (scope: ReturnType<Page["locator"]>, titleSel: string, h1Sel: string, h2Sel: string) =>
    scope.evaluate(
      (root, [ts, h1s, h2s]) => {
        const fs = (sel: string) => parseFloat(getComputedStyle(root.querySelector(sel)!).fontSize);
        const p = root.querySelector("p")!;
        const span = root.querySelector('span[style*="font-family"]')!;
        return {
          ratios: [fs(ts), fs(h1s), fs(h2s)].map((v) => +(v / parseFloat(getComputedStyle(p).fontSize)).toFixed(2)),
          bodyFont: getComputedStyle(p).fontFamily,
          spanFont: getComputedStyle(span).fontFamily,
          spanColor: getComputedStyle(span).color,
          markBg: getComputedStyle(root.querySelector("mark")!).backgroundColor,
          tags: ["strong", "em", "u", "s", "a", "ul li", "ol li", "hr", "br:not(.ProseMirror-trailingBreak)"].map((t) => root.querySelectorAll(t).length),
        };
      },
      [titleSel, h1Sel, h2Sel] as const,
    );
  const edit = await read(pm, "h1[data-sermon-title]", "h1:not([data-sermon-title])", "h2");
  await page.screenshot({ path: "/workspace/fidelity-shots/after-edit.png", fullPage: true });
  await page.goto("/preach", { waitUntil: "networkidle" });
  const col = page.locator("article");
  await expect(col.getByText("Fidelity Sermon")).toBeVisible({ timeout: 20_000 });
  const preach = await read(col, "h1", "h2", "h3");
  // Preach headings are deliberately larger (pulpit layout); everything else matches.
  const { ratios: pr, ...pRest } = preach;
  const { ratios: er, ...eRest } = edit;
  expect(pRest).toEqual(eRest);
  pr.forEach((r, i) => expect(r).toBeGreaterThanOrEqual(er[i]));
});
