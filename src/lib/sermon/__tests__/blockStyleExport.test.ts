/** Builder block styles in exports (made-up text only). */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CalibratedSnapshot } from "@/types/document";
import { layoutSnapshot } from "../export/pngLayout";
import { styledBlocksFromSnapshot } from "../export/contentWalk";
import { calibratedSnapshotSchema } from "../schema";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";

const T = (text: string) => ({ type: "text", text });
const WORDS = "Phrase inventée pour l’essai, avec quelques mots ordinaires et un exemple assez long. ";

function base(extra: Partial<CalibratedSnapshot> = {}): CalibratedSnapshot {
  return {
    target: "paper-a4",
    margins: { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" },
    typeScaleStep: 0,
    lineHeight: 1.55,
    theme: "light",
    flattenGradient: true,
    bionic: false,
    semanticBlocks: [],
    content: {
      type: "doc",
      content: [
        { type: "title", content: [T("Titre inventé")] },
        { type: "paragraph", content: [T("Paragraphe inventé. " + WORDS)] },
      ],
    },
    ...extra,
  };
}

test("unstyled sermons have no look, no boxes, and no line x/width", () => {
  const s = base();
  const styled = styledBlocksFromSnapshot(s);
  assert.ok(styled.every((b) => !b.look && !b.column));
  const layout = layoutSnapshot(s);
  assert.ok(layout.pages.every((p) => !p.boxes));
  assert.ok(layout.pages.every((p) => p.lines.every((l) => l.x === undefined && l.width === undefined)));
  const text = styled.map((b) => b.runs.map((r) => r.text).join("")).join("\n");
  assert.match(text, /Titre inventé/);
  assert.match(text, /Paragraphe inventé/);
});

test("styled blocks and section columns flow into PDF/PNG/PPTX layout", () => {
  const col = (n: number) => ({ type: "column", content: [{ type: "paragraph", content: [T(`Colonne ${n} : ` + WORDS)] }] });
  const s = base({
    content: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1, style: { weight: 400, color: "#123456", align: "right" } }, content: [T("Titre léger inventé")] },
        { type: "paragraph", attrs: { style: { size: 30, font: "jetbrains-mono", highlight: "#FFF176" }, spacing: { mt: 20, mb: 20 } }, content: [T(WORDS)] },
        { type: "quote", content: [T("Citation inventée " + WORDS)] },
        { type: "illustration", attrs: { style: { background: "#F6F3EA", borderLeft: null } }, content: [T("Récit inventé " + WORDS)] },
        { type: "section", attrs: { columns: 2 }, content: [col(1), col(2)] },
      ],
    },
  });
  const parsed = calibratedSnapshotSchema.safeParse(s);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  const styled = styledBlocksFromSnapshot(s);
  const heading = styled.find((b) => b.type === "H1");
  assert.equal(heading?.look?.color, "#123456");
  assert.equal(heading?.look?.weight, 400);
  const quote = styled.find((b) => b.look?.borderLeft === "#BDBDBD" || b.look?.italic);
  assert.ok(quote, "quote keeps its built-in look");
  const cols = styled.filter((b) => b.column);
  assert.equal(cols.length, 2);
  assert.equal(cols[0].column?.count, 2);
  const layout = layoutSnapshot(s);
  const hasBox = layout.pages.some((p) => (p.boxes ?? []).length > 0);
  assert.equal(hasBox, true, "illustration/background produces a box");
  const colLines = layout.pages.flatMap((p) => p.lines).filter((l) => l.x !== undefined);
  assert.ok(colLines.length >= 2, "column lines carry x/width");
  // Words survive the walk unchanged.
  const all = styled.map((b) => b.runs.map((r) => r.text).join("")).join(" ");
  assert.match(all, /Titre léger inventé/);
  assert.match(all, /Citation inventée/);
  assert.match(all, /Récit inventé/);
  assert.match(all, /Colonne 1/);
  assert.match(all, /Colonne 2/);
});

test("calibratedSnapshotSchema accepts optional globalStyles", () => {
  const s = base({ globalStyles: { paragraph: { style: { color: "#336640" } } } });
  const parsed = calibratedSnapshotSchema.safeParse(s);
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  const body = styledBlocksFromSnapshot(s).find((b) => b.type === "Body");
  assert.equal(body?.look?.color, "#336640");
});

void DEFAULT_PRESENTATION_SETTINGS;
