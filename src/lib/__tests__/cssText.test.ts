import { test } from "node:test";
import assert from "node:assert/strict";
import { cssTextToReactStyle } from "../cssText";

test("TextAlign string style becomes a camelCased object", () => {
  assert.deepEqual(cssTextToReactStyle("text-align: left"), {
    textAlign: "left",
  });
});

test("multiple declarations, trailing semicolon, custom props", () => {
  assert.deepEqual(
    cssTextToReactStyle("text-align: center; color: #5c4a1f; --edit-accent: #fff;"),
    { textAlign: "center", color: "#5c4a1f", "--edit-accent": "#fff" },
  );
});

test("values containing colons are preserved", () => {
  assert.deepEqual(
    cssTextToReactStyle("background-image: url(http://x/y.png)"),
    { backgroundImage: "url(http://x/y.png)" },
  );
});

test("never returns indexed (string-spread) keys", () => {
  const out = cssTextToReactStyle("text-align: right") ?? {};
  assert.equal(Object.prototype.hasOwnProperty.call(out, "0"), false);
  // Spreading the result the way NodeViewWrapper does must stay index-free.
  const merged = { whiteSpace: "normal", ...out };
  assert.deepEqual(Object.keys(merged), ["whiteSpace", "textAlign"]);
});

test("empty / invalid inputs yield undefined; objects pass through", () => {
  assert.equal(cssTextToReactStyle(undefined), undefined);
  assert.equal(cssTextToReactStyle(""), undefined);
  assert.equal(cssTextToReactStyle("garbage"), undefined);
  assert.equal(cssTextToReactStyle(["a"]), undefined);
  assert.equal(cssTextToReactStyle(42), undefined);
  assert.deepEqual(cssTextToReactStyle({ color: "red" }), { color: "red" });
});
