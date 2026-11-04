import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ACTIVE_ID_KEY, LIBRARY_KEY } from "../browserCache";
import { STORAGE_KEY } from "@/types/document";
import { createSeedDocument } from "@/lib/seed";
import { resolveActiveDocument } from "@/lib/documentStore";

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    m,
  };
}
let store: ReturnType<typeof mem>;
function fixture(id: string, title: string, updatedAt: string) {
  return { ...createSeedDocument(), id, title, updatedAt };
}
const A = fixture("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Fixture A", "2026-01-01T00:00:00.000Z");
const B = fixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Fixture B", "2026-02-01T00:00:00.000Z");

beforeEach(() => {
  store = mem();
  (globalThis as unknown as { window: unknown }).window = { localStorage: store };
  store.setItem(LIBRARY_KEY, JSON.stringify({ [A.id]: { doc: A, savedAt: null }, [B.id]: { doc: B, savedAt: null } }));
  store.setItem(ACTIVE_ID_KEY, A.id);
});

test("explicit ?id opens that sermon without writing anything", async () => {
  const before = JSON.stringify([...store.m]);
  const r = await resolveActiveDocument({ requestedId: B.id });
  assert.equal(r.doc.id, B.id);
  assert.equal(JSON.stringify([...store.m]), before);
});

test("no ?id opens the chosen sermon, never the newest", async () => {
  const r = await resolveActiveDocument();
  assert.equal(r.doc.id, A.id);
});

test("unknown ?id falls back to the stored choice and keeps it", async () => {
  const r = await resolveActiveDocument({ requestedId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  assert.equal(r.doc.id, A.id);
  assert.equal(store.getItem(ACTIVE_ID_KEY), A.id);
  assert.equal(store.getItem(STORAGE_KEY), null);
});
