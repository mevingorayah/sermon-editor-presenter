import { test } from "node:test";
import assert from "node:assert/strict";
import type { JSONContent } from "@tiptap/react";
import {
  EDIT_ACCENT_HEX,
  FALLBACK_TEXT_HEX,
  containsCssVar,
  flattenContentColors,
  parseCssVar,
  resolveCssVarColor,
  toHex,
} from "../flattenColors";
import { findCssVarColorMarks } from "../../sermon/schema";

function colored(color: string, text = "x"): JSONContent {
  return {
    type: "text",
    text,
    marks: [{ type: "textStyle", attrs: { color, fontFamily: null } }],
  };
}

function doc(...inline: JSONContent[]): JSONContent {
  return { type: "doc", content: [{ type: "paragraph", content: inline }] };
}

function firstColor(d: JSONContent): unknown {
  return d.content?.[0].content?.[0].marks?.[0].attrs?.color;
}

test("var(--edit-accent) resolves from the live token, falling back to #5c4a1f", () => {
  const seen: string[] = [];
  const out = flattenContentColors(doc(colored("var(--edit-accent)")), {
    resolveVar: (name) => {
      seen.push(name);
      return "#FFFFFF";
    },
  });
  assert.equal(firstColor(out), "#ffffff");
  assert.deepEqual(seen, ["--edit-accent"]);

  const missing = flattenContentColors(doc(colored("var(--edit-accent)")), {
    resolveVar: () => null,
  });
  assert.equal(firstColor(missing), EDIT_ACCENT_HEX);
  assert.equal(EDIT_ACCENT_HEX, "#5c4a1f");
  // No resolver (SSR / tests) → fallback too.
  assert.equal(firstColor(flattenContentColors(doc(colored("var(--edit-accent)")))), "#5c4a1f");
});

test("other vars resolve via the runtime resolver and normalize to hex", () => {
  const seen: string[] = [];
  const out = flattenContentColors(
    doc(colored("var(--edit-fg)"), colored("var( --rm-accent )")),
    {
      resolveVar: (name) => {
        seen.push(name);
        return name === "--edit-fg" ? "rgb(26, 24, 20)" : "#8B6914";
      },
    },
  );
  const inline = out.content![0].content!;
  assert.equal(inline[0].marks![0].attrs!.color, "#1a1814");
  assert.equal(inline[1].marks![0].attrs!.color, "#8b6914");
  assert.deepEqual(seen, ["--edit-fg", "--rm-accent"]);
});

test("unresolvable var uses its own fallback, then the default hex", () => {
  const none = () => null;
  assert.equal(resolveCssVarColor("var(--nope, #abc)", { resolveVar: none }), "#aabbcc");
  assert.equal(
    resolveCssVarColor("var(--nope, var(--edit-accent))", { resolveVar: none }),
    EDIT_ACCENT_HEX,
  );
  assert.equal(resolveCssVarColor("var(--nope)", { resolveVar: none }), FALLBACK_TEXT_HEX);
  assert.equal(resolveCssVarColor("var(--nope)"), FALLBACK_TEXT_HEX);
  assert.equal(
    resolveCssVarColor("var(--nope)", { fallbackHex: "#123456" }),
    "#123456",
  );
  // Resolver returning garbage or throwing still falls back safely.
  assert.equal(resolveCssVarColor("var(--x)", { resolveVar: () => "tomato" }), FALLBACK_TEXT_HEX);
  assert.equal(
    resolveCssVarColor("var(--x)", {
      resolveVar: () => {
        throw new Error("boom");
      },
    }),
    FALLBACK_TEXT_HEX,
  );
  // Composite expressions containing a var fall back to hex, never pass through.
  assert.equal(
    resolveCssVarColor("color-mix(in srgb, var(--edit-accent) 50%, white)"),
    FALLBACK_TEXT_HEX,
  );
});

test("concrete colors and non-color attrs are left untouched", () => {
  const input = doc(colored("#d47870"), colored("rgb(1, 2, 3)"));
  input.content![0].content![0].marks!.push({ type: "italic" });
  input.content![0].attrs = { textAlign: "center" };
  const out = flattenContentColors(input);
  assert.deepEqual(out, input);
});

test("walks nested nodes, mark.color, node attrs.color; input never mutated", () => {
  const input: JSONContent = {
    type: "doc",
    content: [
      { type: "title", content: [colored("var(--edit-accent)", "T")] },
      {
        type: "scripture",
        attrs: { citation: "Phil 4:4", textAlign: "right" },
        content: [
          colored("var(--edit-accent)", "a"),
          { type: "text", text: "b", marks: [{ type: "textStyle", color: "var(--x)" } as never] },
        ],
      },
      { type: "paragraph", attrs: { color: "var(--edit-accent)" }, content: [] },
    ],
  };
  const snapshot = JSON.stringify(input);
  const out = flattenContentColors(input, { resolveVar: () => "#010203" });

  assert.equal(JSON.stringify(input), snapshot, "input must not be mutated");
  assert.notEqual(out, input);
  // --edit-accent is read from the (runtime) resolver like any other token.
  assert.equal(out.content![0].content![0].marks![0].attrs!.color, "#010203");
  assert.equal(out.content![1].content![0].marks![0].attrs!.color, "#010203");
  assert.equal((out.content![1].content![1].marks![0] as { color?: string }).color, "#010203");
  assert.equal(out.content![1].attrs!.citation, "Phil 4:4");
  assert.equal(out.content![2].attrs!.color, "#010203");
  // Backend's validator finds nothing left to reject.
  assert.deepEqual(findCssVarColorMarks(out), []);
  assert.ok(findCssVarColorMarks(input).length >= 3);
});

test("tolerates empty / odd content", () => {
  assert.deepEqual(flattenContentColors({ type: "doc" }), { type: "doc" });
  assert.deepEqual(flattenContentColors({ type: "doc", content: [] }), { type: "doc", content: [] });
  const weird = { type: "doc", content: [null, "x", { type: "p", marks: [null] }] } as unknown as JSONContent;
  assert.doesNotThrow(() => flattenContentColors(weird));
});

test("helpers: containsCssVar / parseCssVar / toHex", () => {
  assert.equal(containsCssVar("var(--a)"), true);
  assert.equal(containsCssVar("VAR( --a )"), true);
  assert.equal(containsCssVar("#fff"), false);
  assert.equal(containsCssVar(undefined), false);
  assert.deepEqual(parseCssVar("var(--edit-accent)"), { name: "--edit-accent", fallback: undefined });
  assert.deepEqual(parseCssVar(" var( --a , rgb(1,2,3) ) "), { name: "--a", fallback: "rgb(1,2,3)" });
  assert.equal(parseCssVar("color-mix(in srgb, var(--a), white)"), null);
  assert.equal(toHex("#ABCDEF"), "#abcdef");
  assert.equal(toHex("#abc"), "#aabbcc");
  assert.equal(toHex("#11223344"), "#112233");
  assert.equal(toHex("rgba(255, 0, 300, 0.5)"), "#ff00ff");
  assert.equal(toHex("rgb(92 74 31)"), "#5c4a1f");
  assert.equal(toHex("red"), null);
  assert.equal(toHex(""), null);
});
