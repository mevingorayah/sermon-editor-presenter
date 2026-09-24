import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
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

describe("store CRUD", () => {
  let tmp: string;
  let store: typeof import("../store");

  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "sermons-"));
    process.env.SERMON_DATA_DIR = tmp;
    store = await import(`../store.ts?t=${Date.now()}`);
  });

  after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates, lists, gets, updates, autosaves, deletes", async () => {
    const created = await store.createSermon({
      title: "Test",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello<script>bad()</script>" }],
          },
        ],
      },
    });
    assert.ok(created.id);
    assert.equal(created.meta.title, "Test");

    const listed = await store.listSermons();
    assert.ok(listed.some((s) => s.id === created.id));

    const got = await store.getSermon(created.id);
    assert.equal(got?.id, created.id);

    const updated = await store.updateSermon(created.id, { title: "Updated" });
    assert.equal(updated.meta.title, "Updated");

    const autosaved = await store.updateContent(created.id, {
      content: { type: "doc", content: [{ type: "title", content: [] }] },
    });
    assert.equal(autosaved.content.type, "doc");

    const deleted = await store.deleteSermon(created.id);
    assert.equal(deleted, true);
    assert.equal(await store.getSermon(created.id), null);
  });
});
