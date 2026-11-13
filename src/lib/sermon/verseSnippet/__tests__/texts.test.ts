import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  currentPassageText,
  normalizeAttrs,
  withTranslationText,
} from "../texts";

describe("verse snippet text map", () => {
  it("stores pasted text verbatim and restores it when switching back", () => {
    let texts = withTranslationText({}, "ESV", "  PASTED ESV line.\nExactly as typed.  ");
    texts = withTranslationText(texts, "NIV", "PASTED NIV line.");
    assert.equal(texts.ESV, "  PASTED ESV line.\nExactly as typed.  ");
    assert.equal(
      currentPassageText({ ref: "John 3:16", translation: "ESV", texts }),
      "  PASTED ESV line.\nExactly as typed.  ",
    );
    assert.equal(
      currentPassageText({ ref: "John 3:16", translation: "NIV", texts }),
      "PASTED NIV line.",
    );
    // Switching back does not alter the stored ESV paste.
    assert.equal(texts.ESV, "  PASTED ESV line.\nExactly as typed.  ");
  });

  it("does not invent text for a translation that was never pasted", () => {
    const texts = withTranslationText({}, "ESV", "only esv");
    assert.equal(
      currentPassageText({ translation: "NIV", texts, ref: "John 3:16" }),
      "",
    );
  });

  it("normalises a JSON string text map (HTML attribute form)", () => {
    const attrs = normalizeAttrs({
      ref: "Jean 3:16",
      translation: "LSG",
      texts: JSON.stringify({ LSG: "FIXTURE" }),
    });
    assert.equal(attrs.texts.LSG, "FIXTURE");
    assert.equal(currentPassageText(attrs), "FIXTURE");
  });
});
