import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilenameStem } from "@/lib/sermon/export/filename";
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
    assert.equal(sermonFileName("Joy Without Ceasing"), "Joy-Without-Ceasing.sermon");
    assert.equal(sermonFileName("Ésaïe 40"), "Esaie-40.sermon");
    assert.equal(sermonFileName(""), "sermon-export.sermon");
  });

  it("sermonFileName turns every apostrophe into a hyphen", () => {
    assert.equal(sermonFileName("Qu'est-ce que l'amour ?"), "Qu-est-ce-que-l-amour.sermon");
    assert.equal(sermonFileName("Jusqu’à la fin"), "Jusqu-a-la-fin.sermon");
    assert.equal(sermonFileName("l'été"), "l-ete.sermon");
    assert.equal(sermonFileName("Prédication : L'été à Noël"), "Predication-L-ete-a-Noel.sermon");
  });
});

describe("QA restore edge cases", () => {
  it("rejects a truncated file as NOT_JSON", () => {
    const text = serializeSermonFile(sermon);
    assert.equal(code(() => parseSermonFile(text.slice(0, Math.floor(text.length / 2)))), "NOT_JSON");
  });

  it("opens a file with Windows line endings and a BOM", () => {
    const text = "\uFEFF" + serializeSermonFile(sermon).replace(/\n/g, "\r\n");
    assert.deepEqual(parseSermonFile(text).sermon, sermon);
  });

  it("keeps emoji with Kreol/French accents in title and notes", () => {
    const s = { ...sermon, title: "Lafwa 🙏 Ésaïe ç è ï", notes: "Priyé 🕊️ pou lafami — é" };
    assert.deepEqual(parseSermonFile(serializeSermonFile(s)).sermon, s);
    assert.ok(sermonFileName(s.title).endsWith(".sermon"));
    assert.ok(!sermonFileName(s.title).includes("/"));
  });
});

describe("forward compatibility with v2 fields", () => {
  it("keeps extra fields and unknown attrs on known blocks untouched", () => {
    const s = {
      ...sermon,
      definitions: [{ id: "d1", word: "agapē", language: "grc", gloss: "love", source: "user" }],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { blockId: "b1", textAlign: "left" }, content: [
            { type: "text", text: "agapē", marks: [{ type: "bold" }] },
          ] },
        ],
      },
    } as unknown as SermonDocument;
    assert.deepEqual(parseSermonFile(serializeSermonFile(s)).sermon, s);
  });

  it("refuses block or mark types this version of the editor doesn't know", () => {
    const withNode = { ...sermon, content: { type: "doc", content: [
      { type: "illustration", content: [{ type: "text", text: "Istwar" }] },
    ] } } as unknown as SermonDocument;
    const withMark = { ...sermon, content: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "definition" }] }] },
    ] } } as unknown as SermonDocument;
    assert.equal(code(() => parseSermonFile(serializeSermonFile(withNode))), "INVALID");
    assert.equal(code(() => parseSermonFile(serializeSermonFile(withMark))), "INVALID");
  });
});

describe("sermon content is checked against the editor schema", () => {
  const fileWith = (content: unknown) =>
    JSON.stringify({
      kind: "sermon-editor-presenter/sermon",
      schemaVersion: 1,
      savedAt: "2026-01-01T00:00:00Z",
      sermon: { ...sermon, content },
    });

  it("refuses an unknown node with a plain-language message (QA case)", () => {
    try {
      parseSermonFile(fileWith({ type: "doc", content: [{ type: "evil", content: 5 }] }));
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof SermonFileError);
      assert.equal(e.code, "INVALID");
      assert.match(e.message, /wasn't opened/);
      assert.match(e.message, /doesn't recognise/);
      assert.ok(e.details?.[0]?.startsWith("sermon.content:"));
    }
  });

  for (const [name, content] of [
    ["content is a number", { type: "doc", content: [{ type: "paragraph", content: 5 }] }],
    ["text node without text", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text" }] }] }],
    ["text directly in doc", { type: "doc", content: [{ type: "text", text: "x" }] }],
    ["list item outside a list", { type: "doc", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] }],
    ["node is not an object", { type: "doc", content: ["x"] }],
    ["null node", { type: "doc", content: [null] }],
    ["unknown mark", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "evil" }] }] }] }],
  ] as const) {
    it(`refuses: ${name}`, () => {
      assert.equal(code(() => parseSermonFile(fileWith(content))), "INVALID");
    });
  }

  it("refuses bad content inside a backup too", () => {
    const bad = { ...sermon, content: { type: "doc", content: [{ type: "evil" }] } } as unknown as SermonDocument;
    assert.equal(code(() => parseBackupFile(serializeBackupFile([sermon, bad]))), "INVALID");
  });

  it("opens every block type the editor makes, unchanged", () => {
    const content = { type: "doc", content: [
      { type: "title", content: [{ type: "text", text: "Tit" }] },
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H1" }] },
      { type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "H2" }] },
      { type: "paragraph", content: [
        { type: "text", text: "a", marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "strike" }] },
        { type: "hardBreak" },
        { type: "text", text: "b", marks: [{ type: "textStyle", attrs: { color: "#5c5c5c", fontFamily: null } }, { type: "highlight" }] },
        { type: "text", text: "c", marks: [{ type: "code" }] },
      ] },
      { type: "paragraph" },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] }] },
      { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "2" }] }] }] },
      { type: "horizontalRule" },
      { type: "scripture", attrs: { citation: "Jn 1:1" }, content: [{ type: "text", text: "Vers" }] },
    ] };
    const s = { ...sermon, content } as unknown as SermonDocument;
    assert.deepEqual(parseSermonFile(serializeSermonFile(s)).sermon, s);
  });

  it("opens an empty document", () => {
    const s = { ...sermon, content: { type: "doc" } } as unknown as SermonDocument;
    assert.deepEqual(parseSermonFile(serializeSermonFile(s)).sermon, s);
  });
});

describe("older server-shape files", () => {
  it("keeps the stored creation date instead of dropping it", () => {
    const old = {
      id: "3f1c2a4e-9b7d-4e2f-8a1b-2c3d4e5f6a7b",
      meta: { title: "Vye", createdAt: "2025-03-02T08:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z" },
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] },
    };
    const p = parseSermonFile(JSON.stringify(old)).sermon as SermonDocument & { createdAt?: string };
    assert.equal(p.createdAt, "2025-03-02T08:00:00.000Z");
    assert.equal(p.updatedAt, "2026-10-01T09:00:00.000Z");
    // Survives a save and reopen.
    const again = parseSermonFile(serializeSermonFile(p)).sermon as SermonDocument & { createdAt?: string };
    assert.equal(again.createdAt, "2025-03-02T08:00:00.000Z");
  });

  it("doesn't invent a creation date when none was stored", () => {
    const old = { id: "a1", meta: { title: "t", updatedAt: "2026-10-01T09:00:00.000Z" }, content: { type: "doc" } };
    assert.equal("createdAt" in parseSermonFile(JSON.stringify(old)).sermon, false);
  });
});

it("sermonFileName drops full stops like commas", () => {
  assert.equal(sermonFileName("Vivre pleinement. Rien de moins"), "Vivre-pleinement-Rien-de-moins.sermon");
  assert.equal(sermonFileName("Fin..."), "Fin.sermon");
});

it("export and .sermon names share the apostrophe rule", () => {
  for (const t of ["Qu'est-ce que l'amour ?", "Jusqu'à la fin", "l'été"]) {
    assert.equal(sermonFileName(t), `${sanitizeFilenameStem(t)}.sermon`);
  }
  assert.equal(sanitizeFilenameStem("Qu'est-ce que l'amour ?"), "Qu-est-ce-que-l-amour");
});

describe(".sermon round-trip: fit-screen pageSpec", () => {
  it("keeps format, measured width/height, orientation and dpr through save/open", () => {
    const page = {
      format: "fit-screen" as const,
      orientation: "landscape" as const,
      pageSpec: { kind: "fit" as const, width: 1280, height: 800, orientation: "landscape" as const, dpr: 2 },
    };
    const doc: SermonDocument = {
      ...sermon,
      title: "Made-up fit test",
      presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS, page },
    };
    const text = serializeSermonFile(doc, new Date("2026-10-22T10:00:00.000Z"));
    const opened = parseSermonFile(text).sermon;
    assert.deepEqual(opened.presentationSettings.page, page);
    assert.deepEqual(opened, doc);
    // and a second save of the opened sermon is byte-identical
    assert.equal(serializeSermonFile(opened, new Date("2026-10-22T10:00:00.000Z")), text);
  });
});
