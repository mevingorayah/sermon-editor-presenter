import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseBackupFile,
  parseSermonFile,
  serializeBackupFile,
  serializeSermonFile,
  SermonFileError,
} from "@/lib/sermon-file";
import type { SermonDocument } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS, STORAGE_KEY } from "@/types/document";
import { isConflictCopyId, listFolder, RestoreWriteError, writeSermonFilesAtomically, readFolderFile, uniqueFileName, writeSermonFile } from "../folder";
import { decideWrite, isStaleFor, OPEN_ELSEWHERE_TEXT, presenceAction } from "../conflict";
import { browserModeBanner, BROWSER_ONLY_TEXT } from "../status";
import { parseRestoreFile, replaceConfirmText } from "../backup";
import { classifyWriteError, isSaved, nextStatus, statusAction, statusLabel, type SaveStatus } from "../status";
import {
  backupFileName,
  BACKUP_REMINDER_MS,
  planRestore,
  previewRestore,
  shouldShowBackupReminder,
} from "../backup";
import { cacheSermon, LIBRARY_KEY, readLibrary } from "../browserCache";
import { syncFolderAndCache } from "../sync";
import { MemoryDir, MemoryKV } from "./memoryFs";

const ACCENTS = "Lavi é bon, mo kontan: é è ç ï — Kreol & français «Bondié»";

function sermon(id: string, title: string, updatedAt = "2026-10-10T10:00:00.000Z", extra = ""): SermonDocument {
  return {
    id,
    title,
    updatedAt,
    content: {
      type: "doc",
      content: [
        { type: "title", content: [{ type: "text", text: title }] },
        {
          type: "scripture",
          attrs: { citation: "Jean 3:16 (LSG)" },
          content: [{ type: "text", text: "Car Dieu a tant aimé le monde qu’il a donné son Fils unique… " + extra }],
        },
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [{ type: "text", text: ACCENTS, marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#5c4a1f" } }] }],
        },
      ],
    },
    presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS, theme: "light", bionic: true },
    notes: "Nòt: ç ï è é",
  };
}

let n = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("file serialisation", () => {
  test("round-trips accents, Scripture, marks and settings exactly through the folder", async () => {
    const dir = new MemoryDir();
    const doc = sermon("a1", "Lagras é Lapé");
    const r = await writeSermonFile(dir, "Lagras é Lapé.sermon", doc, { loadedSavedAt: null });
    assert.equal(r.status, "ok");
    const back = await readFolderFile(dir, "Lagras é Lapé.sermon");
    assert.deepEqual(back!.sermon, doc);
    assert.ok(dir.files.get("Lagras é Lapé.sermon")!.includes(ACCENTS), "stored as written, not escaped");
    const f = parseSermonFile(dir.files.get("Lagras é Lapé.sermon")!);
    assert.equal(f.schemaVersion, 1);
    assert.equal(typeof f.savedAt, "string");
  });

  test("listFolder reports damaged files instead of throwing", async () => {
    const dir = new MemoryDir();
    dir.files.set("good.sermon", serializeSermonFile(sermon("g", "Good")));
    dir.files.set("bad.sermon", "{ not json");
    dir.files.set("notes.txt", "ignored");
    const l = await listFolder(dir);
    assert.equal(l.entries.length, 1);
    assert.deepEqual(l.unreadable.map((u) => u.fileName), ["bad.sermon"]);
  });

  test("uniqueFileName avoids clobbering a same-titled sermon", () => {
    assert.equal(uniqueFileName("Grace", []), "Grace.sermon");
    assert.equal(uniqueFileName("Grace", ["grace.sermon"]), "Grace (2).sermon");
  });
});

describe("validator (shared sermon-file module)", () => {
  test("valid file", () => {
    assert.equal(parseSermonFile(serializeSermonFile(sermon("v", "Valid"))).sermon.id, "v");
  });
  test("old version (v0 bare localStorage doc) is upgraded", () => {
    const f = parseSermonFile(JSON.stringify(sermon("old", "Old")));
    assert.equal(f.sermon.title, "Old");
    assert.equal(f.schemaVersion, 1);
  });
  test("corrupt and newer-version files throw SermonFileError", () => {
    assert.throws(() => parseSermonFile("garbage"), (e: unknown) => e instanceof SermonFileError && e.code === "NOT_JSON");
    const newer = JSON.parse(serializeSermonFile(sermon("n", "N")));
    newer.schemaVersion = 99;
    assert.throws(() => parseSermonFile(JSON.stringify(newer)), (e: unknown) => (e as SermonFileError).code === "NEWER_VERSION");
    const edited = JSON.parse(serializeSermonFile(sermon("e", "E")));
    delete edited.sermon.content;
    assert.throws(() => parseSermonFile(JSON.stringify(edited)), (e: unknown) => (e as SermonFileError).code === "INVALID");
  });
});

describe("two-tab conflict decision", () => {
  test("decideWrite", () => {
    assert.equal(decideWrite("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"), "write");
    assert.equal(decideWrite("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z"), "conflict");
    assert.equal(decideWrite("2026-01-01T00:00:01.000Z", "2026-01-01T00:00:00.000Z"), "write");
    assert.equal(decideWrite("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:01.000Z", true), "write");
    assert.equal(decideWrite(null, null), "write");
    assert.equal(decideWrite(null, "2026-01-01T00:00:00.000Z"), "conflict");
  });

  test("writeSermonFile refuses to overwrite a newer copy from another tab", async () => {
    const dir = new MemoryDir();
    const a = await writeSermonFile(dir, "s.sermon", sermon("s", "S"), { loadedSavedAt: null, now: new Date("2026-01-01T00:00:00Z") });
    assert.equal(a.status, "ok");
    const loaded = (a as { savedAt: string }).savedAt;
    // Tab B saves later.
    const b = await writeSermonFile(dir, "s.sermon", sermon("s", "S", undefined, "B"), { loadedSavedAt: loaded, now: new Date("2026-01-01T00:00:05Z") });
    assert.equal(b.status, "ok");
    // Tab A (still on its old savedAt) tries again → conflict, B's text kept.
    const c = await writeSermonFile(dir, "s.sermon", sermon("s", "S", undefined, "A"), { loadedSavedAt: loaded });
    assert.equal(c.status, "conflict");
    assert.ok(dir.files.get("s.sermon")!.includes("B"));
    // Keep mine.
    const d = await writeSermonFile(dir, "s.sermon", sermon("s", "S", undefined, "A"), { loadedSavedAt: loaded, force: true });
    assert.equal(d.status, "ok");
    assert.ok(Date.parse((d as { savedAt: string }).savedAt) > Date.parse("2026-01-01T00:00:05Z"));
  });

  test("broadcast staleness", () => {
    const m = { type: "saved" as const, id: "x", savedAt: "2026-01-02T00:00:00.000Z", tabId: "other" };
    assert.equal(isStaleFor(m, "me", "x", "2026-01-01T00:00:00.000Z"), true);
    assert.equal(isStaleFor(m, "me", "y", "2026-01-01T00:00:00.000Z"), false);
    assert.equal(isStaleFor({ ...m, tabId: "me" }, "me", "x", null), false);
  });
});

describe("save status", () => {
  test("exact words", () => {
    assert.equal(statusLabel({ kind: "saved-folder" }), "Saved to Sermons folder");
    assert.equal(statusLabel({ kind: "saving" }), "Saving…");
    assert.equal(statusLabel({ kind: "error", reason: "folder-not-found" }), "Couldn't save. Folder not found.");
    assert.equal(statusAction({ kind: "error", reason: "folder-not-found" }), "choose-folder");
    assert.equal(statusLabel({ kind: "saved-browser" }), "Saved in this browser");
  });

  test("transitions: saved only after a completed write", () => {
    let s: SaveStatus = { kind: "saved-folder" };
    s = nextStatus(s, { type: "edit" });
    assert.equal(s.kind, "saving");
    assert.equal(isSaved(s), false);
    s = nextStatus(s, { type: "write-failed", target: "folder", error: { name: "NotFoundError" } });
    assert.deepEqual(s, { kind: "error", reason: "folder-not-found", detail: "NotFoundError" });
    s = nextStatus(s, { type: "write-ok", target: "folder" });
    assert.equal(s.kind, "saved-folder");
    s = nextStatus(s, { type: "conflict" });
    assert.equal(nextStatus(s, { type: "edit" }).kind, "conflict", "conflict stays visible while typing");
    assert.deepEqual(nextStatus(s, { type: "write-failed", target: "browser", error: { name: "QuotaExceededError" } }), { kind: "error", reason: "browser-full" });
  });

  test("error classification", () => {
    assert.equal(classifyWriteError({ name: "NotFoundError" }), "folder-not-found");
    assert.equal(classifyWriteError({ name: "NotAllowedError" }), "permission");
    assert.equal(classifyWriteError({ name: "QuotaExceededError" }), "disk-full");
    assert.equal(classifyWriteError(new Error("x")), "unknown");
  });

  test("failed writes propagate (moved folder, disk full, lost permission)", async () => {
    const dir = new MemoryDir();
    dir.failWrite = "QuotaExceededError";
    await assert.rejects(writeSermonFile(dir, "a.sermon", sermon("a", "A"), { loadedSavedAt: null }), { name: "QuotaExceededError" });
    assert.equal(dir.files.get("a.sermon"), "", "nothing committed");
    dir.failWrite = null;
    dir.gone = true;
    await assert.rejects(writeSermonFile(dir, "a.sermon", sermon("a", "A"), { loadedSavedAt: null }), { name: "NotFoundError" });
    dir.gone = false;
    dir.permission = "prompt";
    await assert.rejects(writeSermonFile(dir, "a.sermon", sermon("a", "A"), { loadedSavedAt: null }), { name: "NotAllowedError" });
  });
});

describe("backup / restore", () => {
  const mine = [sermon("a", "Alpha", "2026-10-01T00:00:00.000Z"), sermon("b", "Bèta", "2026-10-05T00:00:00.000Z")];

  test("backup file name and accent round-trip", () => {
    assert.equal(backupFileName(new Date(2026, 9, 6)), "sermons-backup-2026-10-06.sermon-backup");
    const back = parseBackupFile(serializeBackupFile(mine));
    assert.deepEqual(back.sermons, mine);
  });

  test("preview lists count, titles, dates and conflicts", () => {
    const backup = parseBackupFile(
      serializeBackupFile([mine[0], { ...mine[1], updatedAt: "2026-10-09T00:00:00.000Z", notes: "x" }, sermon("c", "Ç new")]),
    );
    const p = previewRestore(mine, backup);
    assert.equal(p.count, 3);
    assert.deepEqual(p.items.map((i) => [i.title, i.change, i.conflict]), [
      ["Alpha", "same", false],
      ["Bèta", "newer", true],
      ["Ç new", "new", false],
    ]);
  });

  test("apply: keep-both by default (new id + (restored)), replace only when chosen, nothing removed", () => {
    const backup = parseBackupFile(serializeBackupFile([{ ...mine[1], notes: "from backup" }, sermon("c", "C")]));
    const keep = planRestore(mine, backup, {}, nextId);
    assert.deepEqual(keep.replaced, []);
    assert.equal(keep.keptBoth.length, 1);
    const copy = keep.toWrite.find((d) => d.id === keep.keptBoth[0].toId)!;
    assert.equal(copy.title, "Bèta (restored)");
    assert.notEqual(copy.id, "b");
    assert.ok(keep.toWrite.some((d) => d.id === "c"));
    const rep = planRestore(mine, backup, { b: "replace" }, nextId);
    assert.deepEqual(rep.replaced, ["b"]);
    assert.equal(rep.toWrite.find((d) => d.id === "b")!.notes, "from backup");
  });

  test("broken or edited backups error, never partially restore", () => {
    assert.throws(() => parseBackupFile("{"), SermonFileError);
    const edited = JSON.parse(serializeBackupFile(mine));
    edited.sermons[1].presentationSettings = "nope";
    assert.throws(() => parseBackupFile(JSON.stringify(edited)), (e: unknown) => (e as SermonFileError).code === "INVALID");
  });

  test("reminder after 7 days only", () => {
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    const base = { lastBackupAt: null, firstUseAt: new Date(t0).toISOString(), dismissedAt: null };
    assert.equal(shouldShowBackupReminder({ ...base, now: t0 + BACKUP_REMINDER_MS - 1 }), false);
    assert.equal(shouldShowBackupReminder({ ...base, now: t0 + BACKUP_REMINDER_MS }), true);
    assert.equal(
      shouldShowBackupReminder({ ...base, lastBackupAt: new Date(t0 + 86_400_000).toISOString(), now: t0 + BACKUP_REMINDER_MS }),
      false,
    );
  });
});

describe("browser cache + first-run migration", () => {
  test("legacy single-doc cache is folded into the library", () => {
    const kv = new MemoryKV();
    kv.setItem(STORAGE_KEY, JSON.stringify(sermon("local-seed", "Seed")));
    const lib = readLibrary(kv);
    assert.equal(lib["local-seed"].doc.title, "Seed");
    assert.equal(lib["local-seed"].dirty, true);
  });

  test("quota errors surface to the caller", () => {
    const kv = new MemoryKV();
    kv.quota = 10;
    assert.throws(() => cacheSermon({ doc: sermon("q", "Q"), savedAt: null }, {}, kv), { name: "QuotaExceededError" });
  });

  test("migrates every cached sermon into the folder without losing any", async () => {
    const dir = new MemoryDir();
    const kv = new MemoryKV();
    cacheSermon({ doc: sermon("a", "Alpha"), savedAt: null, dirty: true }, {}, kv);
    cacheSermon({ doc: sermon("b", "Alpha"), savedAt: null, dirty: true }, {}, kv);
    // Folder already has a different, newer version of "c" than this browser's edit.
    dir.files.set("Cee.sermon", serializeSermonFile(sermon("c", "Cee", "2026-10-12T00:00:00.000Z", "disk"), new Date("2026-10-12T00:00:00Z")));
    cacheSermon({ doc: sermon("c", "Cee", "2026-10-11T00:00:00.000Z", "browser"), savedAt: "2026-10-01T00:00:00.000Z", dirty: true }, {}, kv);
    const r = await syncFolderAndCache(dir, readLibrary(kv), nextId);
    assert.deepEqual([...dir.files.keys()].sort(), ["Alpha (2).sermon", "Alpha.sermon", "Cee-copy-from-this-browser.sermon", "Cee.sermon"]);
    assert.ok(dir.files.get("Cee.sermon")!.includes("disk"));
    assert.ok(dir.files.get("Cee-copy-from-this-browser.sermon")!.includes("browser"));
    assert.equal(Object.keys(r.library).length, 4);
    assert.equal(r.copies.length, 1);
    assert.ok(kv.getItem(LIBRARY_KEY));
  });
});

describe("Drive conflict copies (two files, same sermon id)", () => {
  function driveDir() {
    const dir = new MemoryDir();
    dir.files.set("Grace.sermon", serializeSermonFile(sermon("s1", "Grace", "2026-10-10T10:00:00.000Z", "orig"), new Date("2026-10-10T10:00:00.000Z")));
    dir.files.set("Grace (1).sermon", serializeSermonFile(sermon("s1", "Grace", "2026-10-11T10:00:00.000Z", "other device"), new Date("2026-10-11T10:00:00.000Z")));
    return dir;
  }

  test("listFolder keeps both; the renamed file gets its own stable id and is flagged", async () => {
    const a = await listFolder(driveDir());
    assert.equal(a.entries.length, 2);
    const orig = a.entries.find((e) => e.fileName === "Grace.sermon")!;
    const copy = a.entries.find((e) => e.fileName === "Grace (1).sermon")!;
    assert.equal(orig.file.sermon.id, "s1");
    assert.equal(orig.conflictCopyOf, undefined);
    assert.equal(copy.conflictCopyOf, "s1");
    assert.notEqual(copy.file.sermon.id, "s1");
    assert.ok(isConflictCopyId(copy.file.sermon.id));
    assert.ok(!isConflictCopyId("s1"));
    const b = await listFolder(driveDir());
    assert.equal(b.entries.find((e) => e.fileName === "Grace (1).sermon")!.file.sermon.id, copy.file.sermon.id, "stable across reloads");
  });

  test("without a renamed file, the newer save is the flagged copy", async () => {
    const dir = new MemoryDir();
    dir.files.set("A.sermon", serializeSermonFile(sermon("s1", "A"), new Date("2026-10-12T10:00:00.000Z")));
    dir.files.set("B.sermon", serializeSermonFile(sermon("s1", "B"), new Date("2026-10-10T10:00:00.000Z")));
    const l = await listFolder(dir);
    assert.equal(l.entries.find((e) => e.fileName === "B.sermon")!.file.sermon.id, "s1");
    assert.equal(l.entries.find((e) => e.fileName === "A.sermon")!.conflictCopyOf, "s1");
  });

  test("sync lists both in the library and writes neither file", async () => {
    const dir = driveDir();
    const before = new Map(dir.files);
    const r = await syncFolderAndCache(dir, {}, nextId);
    assert.equal(Object.keys(r.library).length, 2);
    assert.deepEqual(Object.values(r.library).map((e) => e.fileName).sort(), ["Grace (1).sermon", "Grace.sermon"]);
    assert.deepEqual(r.written, []);
    assert.deepEqual(dir.files, before);
  });

  test("re-reading the copy by its library id keeps that id (edits never route to the original)", async () => {
    const dir = driveDir();
    const r = await syncFolderAndCache(dir, {}, nextId);
    const copy = Object.values(r.library).find((e) => e.fileName === "Grace (1).sermon")!;
    const f = await readFolderFile(dir, "Grace (1).sermon", copy.doc.id);
    assert.equal(f!.sermon.id, copy.doc.id);
    assert.equal((await readFolderFile(dir, "Grace.sermon", "s1"))!.sermon.id, "s1");
  });

  test("saving either one writes only its own file", async () => {
    const dir = driveDir();
    const r = await syncFolderAndCache(dir, {}, nextId);
    const copy = Object.values(r.library).find((e) => e.fileName === "Grace (1).sermon")!;
    const origText = dir.files.get("Grace.sermon");
    const w = await writeSermonFile(dir, copy.fileName!, { ...copy.doc, notes: "edited copy" }, { loadedSavedAt: copy.savedAt });
    assert.equal(w.status, "ok");
    assert.equal(dir.files.get("Grace.sermon"), origText, "original untouched");
    assert.equal(parseSermonFile(dir.files.get("Grace (1).sermon")!).sermon.notes, "edited copy");
    // After the copy is saved the two files no longer share an id, and the copy stays tagged.
    const l = await listFolder(dir);
    assert.equal(l.entries.length, 2);
    assert.ok(isConflictCopyId(l.entries.find((e) => e.fileName === "Grace (1).sermon")!.file.sermon.id));
    const orig = r.library["s1"]!;
    const copyText = dir.files.get("Grace (1).sermon");
    await writeSermonFile(dir, orig.fileName!, { ...orig.doc, notes: "edited orig" }, { loadedSavedAt: orig.savedAt });
    assert.equal(dir.files.get("Grace (1).sermon"), copyText, "copy untouched");
    assert.equal(parseSermonFile(dir.files.get("Grace.sermon")!).sermon.notes, "edited orig");
  });
});

describe("ST9 presence on open", () => {
  test("a tab with the same sermon open warns and replies; others ignore", () => {
    const m = (type: "opened" | "here" | "closed" | "saved", id = "s1", tabId = "B") => ({ type, id, tabId });
    assert.equal(presenceAction(m("opened"), "A", "s1"), "warn-and-reply");
    assert.equal(presenceAction(m("here"), "A", "s1"), "warn");
    assert.equal(presenceAction(m("closed"), "A", "s1"), "clear");
    assert.equal(presenceAction(m("opened", "s2"), "A", "s1"), null);
    assert.equal(presenceAction(m("opened", "s1", "A"), "A", "s1"), null);
    assert.equal(presenceAction(m("saved"), "A", "s1"), null);
    assert.equal(isStaleFor(m("opened"), "A", "s1", "2026-10-10T10:00:00.000Z"), false);
    assert.equal(OPEN_ELSEWHERE_TEXT, "This sermon is open in another tab");
  });
});

describe("ST18 replace confirmation text", () => {
  test("names the sermon", () => {
    assert.equal(replaceConfirmText("Grace"), "Replace your copy of Grace? Your current version will be lost.");
  });
});

describe("ST20 restore is all-or-nothing", () => {
  const items = () => [
    { fileName: "A.sermon", doc: sermon("a", "A") },
    { fileName: "B.sermon", doc: sermon("b", "B") },
    { fileName: "C.sermon", doc: sermon("c", "C") },
  ];
  test("all succeed: files in place, no temp files left", async () => {
    const dir = new MemoryDir();
    const r = await writeSermonFilesAtomically(dir, items());
    assert.deepEqual([...dir.files.keys()].sort(), ["A.sermon", "B.sermon", "C.sermon"]);
    assert.equal(Object.keys(r).length, 3);
    assert.equal(parseSermonFile(dir.files.get("B.sermon")!).sermon.id, "b");
  });
  test("2nd of 3 writes fails: nothing written, existing file untouched, error names the sermon", async () => {
    const dir = new MemoryDir();
    dir.files.set("A.sermon", "ORIGINAL");
    dir.failCloseAt = 2;
    await assert.rejects(writeSermonFilesAtomically(dir, items()), (e: unknown) => {
      assert.ok(e instanceof RestoreWriteError);
      assert.equal((e as RestoreWriteError).title, "B");
      return true;
    });
    assert.deepEqual([...dir.files.entries()], [["A.sermon", "ORIGINAL"]]);
  });
  test("temp files are never listed as sermons", async () => {
    const dir = new MemoryDir();
    dir.files.set(".X.sermon.abc-0.tmp", serializeSermonFile(sermon("x", "X")));
    assert.equal((await listFolder(dir)).entries.length, 0);
  });
});

describe("ST2/ST15 browser-only banner", () => {
  test("plain text, stronger when persist() refused", () => {
    assert.deepEqual(browserModeBanner(true), { text: BROWSER_ONLY_TEXT, strong: false });
    assert.equal(BROWSER_ONLY_TEXT, "Saved in this browser only. Back up regularly.");
    const w = browserModeBanner(false);
    assert.equal(w.strong, true);
    assert.ok(w.text.startsWith(BROWSER_ONLY_TEXT) && w.text.length > BROWSER_ONLY_TEXT.length);
  });
});

describe("restore accepts a single .sermon file", () => {
  test("treated as a one-sermon backup; junk still refused", () => {
    const b = parseRestoreFile(serializeSermonFile(sermon("one", "One")));
    assert.equal(b.sermons.length, 1);
    assert.equal(b.sermons[0].id, "one");
    assert.throws(() => parseRestoreFile(JSON.stringify({ kind: "other" })));
  });
});
