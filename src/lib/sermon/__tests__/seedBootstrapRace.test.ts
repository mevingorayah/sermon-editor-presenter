import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  autosaveContent,
  deleteSermon,
  getSermon,
  updateSermon,
} from "../../sermonApi";
import {
  ACTIVE_ID_KEY,
  loadDocument,
  purgeLegacySeedIdsFromStorage,
  resolveActiveDocument,
} from "../../documentStore";
import { STORAGE_KEY } from "@/types/document";
import { DEFAULT_PRESENTATION_SETTINGS } from "@/types/document";

type FetchCall = { url: string; method: string };

function installLocalStorage() {
  const mem = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
  (globalThis as { window?: { localStorage: typeof localStorage } }).window = {
    localStorage,
  };
  (globalThis as { localStorage?: typeof localStorage }).localStorage =
    localStorage;
  return mem;
}

function seedDoc(id: string) {
  return {
    id,
    title: "Joy That Outlasts the Moment",
    updatedAt: new Date().toISOString(),
    content: { type: "doc", content: [] },
    presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS },
    notes: "",
  };
}

describe("getSermon never fetches non-UUID ids", () => {
  let calls: FetchCall[];
  let originalFetch: typeof fetch;

  beforeEach(() => {
    calls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: (init?.method ?? "GET").toUpperCase(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  for (const id of [
    "seed-philippians-4",
    "seed-philippians-4:0",
    "local-seed",
    "local-20260924183800",
    "",
  ]) {
    it(`getSermon rejects and does not fetch: ${JSON.stringify(id)}`, async () => {
      await assert.rejects(() => getSermon(id));
      assert.equal(calls.length, 0);
    });

    it(`update/delete/autosave reject without fetch: ${JSON.stringify(id)}`, async () => {
      await assert.rejects(() => updateSermon(id, { notes: "x" }));
      await assert.rejects(() => deleteSermon(id));
      await assert.rejects(() =>
        autosaveContent(id, { content: { type: "doc", content: [] } }),
      );
      assert.equal(calls.length, 0);
    });
  }
});

describe("bootstrap never requests seed ids (first-paint race)", () => {
  let calls: FetchCall[];
  let mem: Map<string, string>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    mem = installLocalStorage();
    calls = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });

      if (url === "/api/sermons" && method === "GET") {
        return new Response(JSON.stringify({ sermons: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/sermons" && method === "POST") {
        const sermon = {
          id: "a940f792-34e1-4e33-a507-a267f81ef960",
          meta: {
            title: "Joy That Outlasts the Moment",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          content: { type: "doc", content: [] },
        };
        return new Response(JSON.stringify({ sermon }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("purges seed-philippians-4 from localStorage synchronously", () => {
    mem.set(STORAGE_KEY, JSON.stringify(seedDoc("seed-philippians-4")));
    mem.set(ACTIVE_ID_KEY, "seed-philippians-4:0");

    purgeLegacySeedIdsFromStorage();

    assert.equal(mem.get(ACTIVE_ID_KEY), undefined);
    const doc = JSON.parse(mem.get(STORAGE_KEY)!);
    assert.equal(doc.id, "local-seed");
  });

  it("loadDocument remaps seed id before any network", () => {
    mem.set(STORAGE_KEY, JSON.stringify(seedDoc("seed-philippians-4")));
    mem.set(ACTIVE_ID_KEY, "seed-philippians-4");

    const loaded = loadDocument();
    assert.equal(loaded.id, "local-seed");
    assert.equal(calls.length, 0);
  });

  it("resolveActiveDocument with stale seed never GETs /api/sermons/seed-*", async () => {
    mem.set(STORAGE_KEY, JSON.stringify(seedDoc("seed-philippians-4")));
    mem.set(ACTIVE_ID_KEY, "seed-philippians-4:0");

    const resolved = await resolveActiveDocument();

    const seedGets = calls.filter(
      (c) =>
        c.method === "GET" &&
        /\/api\/sermons\/[^/?]*seed/.test(c.url),
    );
    assert.equal(
      seedGets.length,
      0,
      `unexpected seed GETs: ${JSON.stringify(seedGets)}`,
    );
    assert.ok(
      calls.some((c) => c.url === "/api/sermons" && c.method === "GET"),
      "expected list first",
    );
    assert.ok(
      calls.some((c) => c.url === "/api/sermons" && c.method === "POST"),
      "expected POST create when list empty",
    );
    assert.equal(resolved.doc.id, "a940f792-34e1-4e33-a507-a267f81ef960");
  });

  it("resolveActiveDocument with seed + non-empty list opens UUID without seed GET", async () => {
    mem.set(STORAGE_KEY, JSON.stringify(seedDoc("seed-philippians-4")));
    mem.set(ACTIVE_ID_KEY, "seed-philippians-4");

    const uuid = "b1111111-1111-4111-8111-111111111111";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ url, method });
      if (url === "/api/sermons" && method === "GET") {
        return new Response(
          JSON.stringify({
            sermons: [
              {
                id: uuid,
                meta: {
                  title: "Existing",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                content: { type: "doc", content: [] },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === `/api/sermons/${uuid}` && method === "GET") {
        return new Response(
          JSON.stringify({
            sermon: {
              id: uuid,
              meta: {
                title: "Existing",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              content: { type: "doc", content: [] },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "unexpected" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const resolved = await resolveActiveDocument();
    const seedGets = calls.filter((c) => /seed-/.test(c.url));
    assert.equal(seedGets.length, 0, JSON.stringify(seedGets));
    assert.equal(resolved.doc.id, uuid);
  });
});
