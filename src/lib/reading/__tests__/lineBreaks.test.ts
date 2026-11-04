/** Made-up text only. Line breaks only at breaking spaces; per-format text size max. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { breakWords, wrapLineRanges } from "@/lib/sermon/export/pngLayout";
import { fromSettings, stepTextSize, textSizeLimits, toPatch } from "@/lib/reading/pageSettings";

const words = (t: string) => breakWords(t).map(([a, z]) => t.slice(a, z));
const mono = (s: string, size: number) => s.length * size * 0.5;

test("NBSP and narrow NBSP never break; closing punctuation stays with its word", () => {
  assert.deepEqual(words("vin nouvo.\u00a0»] Alor"), ["vin", "nouvo.\u00a0»]", "Alor"]);
  assert.deepEqual(words("vin nouvo.\u202f»] Alor"), ["vin", "nouvo.\u202f»]", "Alor"]);
  assert.deepEqual(words("a  /  b c »  ] d"), ["a  /", "b", "c »  ]", "d"]);
  assert.deepEqual(words("vin nouvo. »] Alor ( a ) b ; c !"), ["vin", "nouvo. »]", "Alor", "(", "a )", "b ;", "c !"]);
});

test("'/' word that fits stays whole (#29 breaks after '/' only below 24 pt)", () => {
  const t = "lot pommes/poires/prunes";
  assert.deepEqual(words(t), ["lot", "pommes/poires/prunes"]);
  // Narrow column: the slash word goes whole to its own line, or is shrunk by the layout; never cut at "/".
  for (const [a, z] of wrapLineRanges(t, 10, 12 * 10 * 0.5, undefined, mono, false)) {
    const s = t.slice(a, z).trim();
    assert.ok(!s.endsWith("/") && !s.startsWith("/"), s);
  }
});

test("never breaks before » ] ) . , even when the line is full", () => {
  const t = "aaaa bbbb.\u00a0»] cccc";
  const lines = wrapLineRanges(t, 10, 7 * 10 * 0.5, undefined, mono, false).map(([a, z]) => t.slice(a, z).trim());
  assert.ok(lines.includes("bbbb.\u00a0»]"), JSON.stringify(lines));
});

test("text size max: 48 pt on A5 / half-Letter, 72 pt elsewhere; saved larger values clamp", () => {
  for (const f of ["a5", "half-letter"] as const) assert.equal(textSizeLimits(f).max, 48);
  for (const f of ["a4", "letter", "16:9", "4:3", "16:10", "fit-screen"] as const) assert.equal(textSizeLimits(f).max, 72);
  const c = fromSettings({ calibrationTarget: "screen-16-9", page: { format: "half-letter", orientation: "portrait", textSizePt: 72 } } as never);
  assert.equal(c.textSizePt, 48);
  assert.equal(stepTextSize(c, 1).textSizePt, 48);
  assert.equal(toPatch({ ...c, textSizePt: 72 }).page!.textSizePt, 48);
  const a4 = fromSettings({ calibrationTarget: "screen-16-9", page: { format: "a4", orientation: "portrait", textSizePt: 72 } } as never);
  assert.equal(a4.textSizePt, 72);
});
