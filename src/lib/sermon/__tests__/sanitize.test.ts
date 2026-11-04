import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml, sanitizeDocumentJson } from "../sanitize";

describe("sanitizeHtml", () => {
  it("strips script tags and event handlers", () => {
    const dirty =
      '<p onclick="alert(1)">Hi</p><script>evil()</script><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeHtml(dirty);
    assert.equal(clean.includes("<script"), false);
    assert.equal(/onclick/i.test(clean), false);
    assert.equal(/javascript:/i.test(clean), false);
    assert.equal(clean.includes("Hi"), true);
  });
});

describe("sanitizeDocumentJson", () => {
  it("scrubs nested strings", () => {
    const cleaned = sanitizeDocumentJson({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "ok<script>x</script>" }],
        },
      ],
    }) as { content: Array<{ content: Array<{ text: string }> }> };
    assert.equal(
      cleaned.content[0].content[0].text.includes("<script"),
      false,
    );
  });
});
