import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  EDIT_ACCENT_FALLBACK_HEX,
  resolveEditAccentHex,
} from "../flattenColors";
import { buildExportPayload } from "../payload";
import type { CalibratedSnapshot } from "@/types/document";

/**
 * Minimal DOM stand-in: `getComputedStyle(document.documentElement)` returns
 * the given custom properties (as the browser does for :root tokens).
 */
function installFakeDom(props: Record<string, string>) {
  const root = { nodeName: "HTML" };
  const g = globalThis as Record<string, unknown>;
  g.window = {};
  g.document = { documentElement: root, body: {} };
  g.getComputedStyle = (el: unknown) => ({
    getPropertyValue: (name: string) =>
      el === root ? (props[name] ?? "") : "",
    color: "",
  });
}

function removeFakeDom() {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.document;
  delete g.getComputedStyle;
}

const HEX_RE = /^#[0-9a-f]{6}$/;

function snap(): CalibratedSnapshot {
  return {
    target: "screen-16-9",
    margins: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
    typeScaleStep: 0,
    lineHeight: 1.7,
    theme: "dark",
    flattenGradient: true,
    bionic: false,
    semanticBlocks: [],
    content: { type: "doc", content: [] },
  };
}

describe("resolveEditAccentHex (reads --edit-accent at export time)", () => {
  afterEach(removeFakeDom);

  it("token present → its hex (browser getComputedStyle on :root)", () => {
    installFakeDom({ "--edit-accent": " #1F6FEB " });
    assert.equal(resolveEditAccentHex(), "#1f6feb");
  });

  it("token missing → #5c4a1f fallback", () => {
    installFakeDom({});
    assert.equal(resolveEditAccentHex(), EDIT_ACCENT_FALLBACK_HEX);
    assert.equal(EDIT_ACCENT_FALLBACK_HEX, "#5c4a1f");
  });

  it("rgb() / rgba() token → hex", () => {
    installFakeDom({ "--edit-accent": "rgb(31, 111, 235)" });
    assert.equal(resolveEditAccentHex(), "#1f6feb");
    installFakeDom({ "--edit-accent": "rgba(92, 74, 31, 0.9)" });
    assert.equal(resolveEditAccentHex(), "#5c4a1f");
  });

  it("not in a browser, unresolvable, or throwing → fallback", () => {
    assert.equal(resolveEditAccentHex(), "#5c4a1f"); // no window/document
    assert.equal(resolveEditAccentHex(() => "not-a-color"), "#5c4a1f");
    assert.equal(resolveEditAccentHex(() => ""), "#5c4a1f");
    assert.equal(
      resolveEditAccentHex(() => {
        throw new Error("boom");
      }),
      "#5c4a1f",
    );
  });

  it("export payload carries the live token as hex, never a var or rgb()", () => {
    installFakeDom({ "--edit-accent": "rgb(10, 20, 30)" });
    const payload = buildExportPayload({
      snapshot: snap(),
      format: "pptx",
      filenameStem: "x",
      includeNotes: false,
      notes: "",
    });
    assert.deepEqual(payload.resolvedColors, { accent: "#0a141e" });

    const injected = buildExportPayload({
      snapshot: snap(),
      format: "pdf",
      filenameStem: "x",
      includeNotes: false,
      notes: "",
      resolveVar: (n) => (n === "--edit-accent" ? "#ABCDEF" : null),
    });
    assert.equal(injected.resolvedColors!.accent, "#abcdef");

    // A bogus explicit override is ignored rather than sent to Backend.
    const bogus = buildExportPayload({
      snapshot: snap(),
      format: "pdf",
      filenameStem: "x",
      includeNotes: false,
      notes: "",
      accentHex: "var(--edit-accent)",
      resolveVar: () => null,
    });
    assert.match(bogus.resolvedColors!.accent, HEX_RE);
    assert.equal(bogus.resolvedColors!.accent, "#5c4a1f");
  });
});
