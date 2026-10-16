import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SERMON_FILE_SCHEMA_VERSION,
  SermonFileError,
  isNewerOnDisk,
  parseBackupFile,
  parseSermonFile,
  serializeBackupFile,
  serializeSermonFile,
  sermonFileName,
} from "../index";
import { DEFAULT_PRESENTATION_SETTINGS, type SermonDocument } from "@/types/document";

const kreol = "Bondié pé dir nou: ène lafwa ki pa trambl. Ésaïe 40:31 — ç, è, ï, «Lévangil»";

const sermon: SermonDocument = {
  id: "3f1c2a4e-9b7d-4e2f-8a1b-2c3d4e5f6a7b",
  title: "Ésaïe 40 – L'espérance",
  updatedAt: "2026-10-16T07:00:00.000Z",
  content: {
    type: "doc",
    content: [
      { type: "title", content: [{ type: "text", text: "Ésaïe 40 – L'espérance" }] },
      {
        type: "paragraph",
        attrs: { textAlign: "center" },
        content: [
          {
            type: "text",
            text: kreol,
            marks: [{ type: "textStyle", attrs: { color: "#5c4a1f" } }, { type: "highlight" }],
          },
        ],
      },
      { type: "scripture", attrs: { citation: "Ésaïe 40:31" }, content: [{ type: "text", text: "Mé zot ki espere dan Lé Ségnèr…" }] },
    ],
  },
  presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS, theme: "dark" },
  notes: "Not privé: <script>pa kouri</script> & * ' \" - _ < >",
};

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof SermonFileError, String(e));
    return e.code;
  }
  return undefined;
}

describe("sermon file round-trip", () => {
  it("keeps every character, mark and setting exactly", () => {
    const text = serializeSermonFile(sermon, new Date("2026-10-16T07:05:00Z"));
    const back = parseSermonFile(text);
    assert.deepEqual(back.sermon, sermon);
    assert.equal(back.schemaVersion, SERMON_FILE_SCHEMA_VERSION);
    assert.equal(back.savedAt, "2026-10-16T07:05:00.000Z");
    assert.ok(text.includes("Bondié"), "accents stored as real characters, not escapes");
  });

  it("survives a UTF-8 byte round trip and a leading BOM", () => {
    const bytes = new TextEncoder().encode("\uFEFF" + serializeSermonFile(sermon));
    const back = parseSermonFile(new TextDecoder().decode(bytes));
    assert.equal(back.sermon.notes, sermon.notes);
    assert.equal(
      (back.sermon.content.content as Array<{ content?: Array<{ text: string }> }>)[1].content![0].text,
      kreol,
    );
  });

  it("does not sanitize or alter notes text (stored as written)", () => {
    const back = parseSermonFile(serializeSermonFile(sermon));
    assert.equal(back.sermon.notes, sermon.notes);
  });
});

describe("sermon file errors", () => {
  it("rejects non-JSON", () => {
    assert.equal(code(() => parseSermonFile("hello")), "NOT_JSON");
  });

  it("rejects a backup opened as a sermon, and vice versa", () => {
    assert.equal(code(() => parseSermonFile(serializeBackupFile([sermon]))), "WRONG_KIND");
    assert.equal(code(() => parseBackupFile(serializeSermonFile(sermon))), "WRONG_KIND");
  });

  it("rejects an unrelated JSON file", () => {
    assert.equal(code(() => parseSermonFile('{"name":"package"}')), "WRONG_KIND");
  });

  it("rejects files from a newer app version", () => {
    const text = JSON.stringify({
      ...JSON.parse(serializeSermonFile(sermon)),
      schemaVersion: SERMON_FILE_SCHEMA_VERSION + 1,
    });
    assert.equal(code(() => parseSermonFile(text)), "NEWER_VERSION");
  });

  it("rejects damaged content and names the field", () => {
    const f = JSON.parse(serializeSermonFile(sermon));
    f.sermon.content = { type: "not-a-doc" };
    try {
      parseSermonFile(JSON.stringify(f));
      assert.fail("should throw");
    } catch (e) {
      assert.ok(e instanceof SermonFileError);
      assert.equal(e.code, "INVALID");
      assert.ok(e.details?.some((d) => d.startsWith("sermon.content")));
    }
  });

  it("rejects ids with path characters", () => {
    const f = JSON.parse(serializeSermonFile(sermon));
    f.sermon.id = "../../etc/passwd";
    assert.equal(code(() => parseSermonFile(JSON.stringify(f))), "INVALID");
  });

  it("rejects oversize files before parsing", () => {
    assert.equal(code(() => parseSermonFile(" ".repeat(21 * 1024 * 1024))), "TOO_LARGE");
  });
});

describe("upgrading older data (v0)", () => {
  it("opens a bare localStorage SermonDocument", () => {
    const back = parseSermonFile(JSON.stringify(sermon));
    assert.deepEqual(back.sermon, sermon);
    assert.equal(back.savedAt, sermon.updatedAt);
  });

  it("opens the old server Sermon shape", () => {
    const old = {
      id: sermon.id,
      meta: { title: "Old", createdAt: "2026-09-24T10:00:00Z", updatedAt: "2026-09-24T11:00:00Z" },
      content: sermon.content,
      notes: "n",
    };
    const back = parseSermonFile(JSON.stringify(old));
    assert.equal(back.sermon.title, "Old");
    assert.equal(back.sermon.updatedAt, "2026-09-24T11:00:00Z");
    assert.deepEqual(back.sermon.presentationSettings, DEFAULT_PRESENTATION_SETTINGS);
  });

  it("legacy seed ids are still accepted locally", () => {
    const back = parseSermonFile(JSON.stringify({ ...sermon, id: "seed-philippians-4:0" }));
    assert.equal(back.sermon.id, "seed-philippians-4:0");
  });
});

describe("backup files", () => {
  const second = { ...sermon, id: "local-abc", title: "Lévangil Zan", notes: "" };

  it("round-trips every sermon", () => {
    const back = parseBackupFile(serializeBackupFile([sermon, second]));
    assert.deepEqual(back.sermons, [sermon, second]);
  });

  it("refuses the whole restore if one sermon is damaged", () => {
    const f = JSON.parse(serializeBackupFile([sermon, second]));
    f.sermons[1].content = null;
    try {
      parseBackupFile(JSON.stringify(f));
      assert.fail("should throw");
    } catch (e) {
      assert.ok(e instanceof SermonFileError);
      assert.equal(e.code, "INVALID");
      assert.ok(e.details?.some((d) => d.startsWith("sermons.1") || d.startsWith("sermons[1]")));
    }
  });

  it("refuses duplicate ids", () => {
    assert.equal(code(() => parseBackupFile(serializeBackupFile([sermon, sermon]))), "INVALID");
  });
});

describe("helpers", () => {
  it("isNewerOnDisk compares savedAt", () => {
    assert.equal(isNewerOnDisk("2026-10-16T07:00:00Z", "2026-10-16T07:00:01Z"), true);
    assert.equal(isNewerOnDisk("2026-10-16T07:00:01Z", "2026-10-16T07:00:00Z"), false);
  });

  it("sermonFileName uses the export filename rules", () => {
    assert.match(sermonFileName("Joy Without Ceasing"), /^Joy-Without-Ceasing\.sermon$/);
  });
});
