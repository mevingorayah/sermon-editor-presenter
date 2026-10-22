import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  AutosaveController,
  backoffDelay,
  classifySaveError,
  type AutosaveStatus,
  type TimerApi,
} from "../autosaveController";
import {
  SermonNetworkError,
  autosaveContent,
  createSermon,
  getSermon,
  updateSermon,
} from "../../sermonApi";
import { ACTIVE_ID_KEY, saveDocument } from "../../documentStore";
import type { Sermon } from "@/lib/sermon/types";
import {
  DEFAULT_PRESENTATION_SETTINGS,
  STORAGE_KEY,
  type SermonDocument,
} from "@/types/document";

const LOST_ID = "98d45ed6-1df6-4eab-a97e-837661fbc464";

/* ------------------------------------------------------------------ */
/* Test doubles                                                         */
/* ------------------------------------------------------------------ */

function installLocalStorage() {
  const mem = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return mem;
}

/** Manual clock: timers only fire on advance(). */
class FakeTimers implements TimerApi {
  now = 0;
  private seq = 0;
  private pending = new Map<number, { at: number; fn: () => void; ms: number }>();
  scheduled: number[] = [];

  set = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.pending.set(id, { at: this.now + ms, fn, ms });
    this.scheduled.push(ms);
    return id;
  };

  clear = (h: unknown) => {
    this.pending.delete(h as number);
  };

  get size() {
    return this.pending.size;
  }

  /** Advance the clock, firing due timers in order and draining microtasks. */
  async advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      await settle();
      const due = [...this.pending.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.pending.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
    }
    this.now = target;
    await settle();
  }
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

type Call = { method: string; path: string; body?: Record<string, unknown> };

type Responder = (call: Call) => Response | Promise<Response> | "network";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * In-memory backend mirroring /api/sermons.
 * idMode:
 *  - "contract": POST honours a client `id` (201 under it; 409 if it exists)
 *  - "strict-legacy": POST rejects `id` with zod-style 400 unrecognized_keys
 *  - "ignore-legacy": POST strips `id` and mints a UUID (today's staging)
 */
class FakeServer {
  idMode: "contract" | "strict-legacy" | "ignore-legacy" = "contract";
  sermons = new Map<string, Sermon>();
  calls: Call[] = [];
  nextIds: string[] = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  override: Responder | null = null;

  handle = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://test.local");
    const call: Call = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    this.calls.push(call);
    if (this.override) {
      const r = await this.override(call);
      if (r === "network") throw new TypeError("Failed to fetch");
      return r;
    }
    return this.route(call);
  };

  route(call: Call): Response {
    const now = new Date().toISOString();
    if (call.path === "/api/sermons" && call.method === "POST") {
      const b = call.body ?? {};
      let id: string;
      if (b.id !== undefined && this.idMode === "strict-legacy") {
        return json(400, {
          error: "Validation failed",
          details: [
            {
              code: "unrecognized_keys",
              keys: ["id"],
              path: [],
              message: "Unrecognized key(s) in object: 'id'",
            },
          ],
        });
      }
      if (b.id !== undefined && this.idMode === "contract") {
        id = b.id as string;
        if (this.sermons.has(id)) {
          return json(409, { error: "Sermon already exists" });
        }
      } else {
        id = this.nextIds.shift()!;
      }
      const sermon: Sermon = {
        id,
        meta: {
          title: (b.title as string) ?? "Untitled sermon",
          createdAt: now,
          updatedAt: now,
        },
        content: b.content as Sermon["content"],
        presentation: b.presentation as Sermon["presentation"],
        notes: b.notes as string,
      };
      this.sermons.set(id, sermon);
      return json(201, { sermon });
    }
    const m = /^\/api\/sermons\/([^/]+)(\/content)?$/.exec(call.path);
    if (m && !m[2] && call.method === "GET") {
      const existing = this.sermons.get(m[1]);
      return existing
        ? json(200, { sermon: existing })
        : json(404, { error: "Sermon not found" });
    }
    if (m && call.method === "PATCH") {
      const existing = this.sermons.get(m[1]);
      if (!existing) return json(404, { error: "Sermon not found" });
      const b = call.body ?? {};
      const next: Sermon = {
        ...existing,
        content: (b.content as Sermon["content"]) ?? existing.content,
        notes: (b.notes as string) ?? existing.notes,
        meta: {
          ...existing.meta,
          title: (b.title as string) ?? existing.meta.title,
          updatedAt: now,
        },
      };
      this.sermons.set(m[1], next);
      return json(200, { sermon: next });
    }
    return json(404, { error: "Not found" });
  }

  count(method: string, pathRe: RegExp) {
    return this.calls.filter((c) => c.method === method && pathRe.test(c.path))
      .length;
  }
}

function makeDoc(id: string, text = "Grace upon grace"): SermonDocument {
  return {
    id,
    title: "Joy That Outlasts the Moment",
    updatedAt: new Date().toISOString(),
    content: {
      type: "doc",
      content: [
        {
          type: "title",
          content: [{ type: "text", text: "Joy That Outlasts the Moment" }],
        },
        { type: "paragraph", content: [{ type: "text", text }] },
      ],
    },
    presentationSettings: { ...DEFAULT_PRESENTATION_SETTINGS, theme: "light" },
    notes: "Illustration: the lighthouse",
  };
}

/** Harness mirroring EditShell's wiring (docRef + saveDocument re-key). */
function setup(
  server: FakeServer,
  doc: SermonDocument,
  options: ConstructorParameters<typeof AutosaveController>[0]["options"] = {},
) {
  const timers = new FakeTimers();
  const statuses: AutosaveStatus[] = [];
  const ref = { current: doc as SermonDocument | null };
  saveDocument(doc);
  const controller = new AutosaveController({
    getDoc: () => ref.current,
    rekeyDoc: (fromId, toId, updatedAt) => {
      if (!ref.current || ref.current.id !== fromId) return null;
      ref.current = { ...ref.current, id: toId, updatedAt };
      saveDocument(ref.current);
      return ref.current;
    },
    save: {
      content: (d) =>
        autosaveContent(d.id, { content: d.content, title: d.title }),
      notes: (d) => updateSermon(d.id, { notes: d.notes }),
    },
    create: (input) => createSermon(input),
    get: (id) => getSermon(id),
    onStatus: (s) => statuses.push(s),
    timers,
    options: { debounceMs: { content: 650, notes: 800 }, ...options },
  });
  const edit = (text: string) => {
    ref.current = { ...makeDoc(ref.current!.id, text) };
    saveDocument(ref.current);
    controller.request("content");
  };
  return { timers, statuses, ref, controller, edit };
}

function cachedDoc(mem: Map<string, string>): SermonDocument {
  return JSON.parse(mem.get(STORAGE_KEY)!) as SermonDocument;
}

function kinds(statuses: AutosaveStatus[]) {
  return statuses.map((s) => s.kind);
}

/* ------------------------------------------------------------------ */

describe("autosave 404 recovery (issue #9)", () => {
  let mem: Map<string, string>;
  let server: FakeServer;
  let originalFetch: typeof fetch;
  const NEW_1 = "11111111-1111-4111-8111-111111111111";
  const NEW_2 = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    mem = installLocalStorage();
    server = new FakeServer();
    originalFetch = globalThis.fetch;
    globalThis.fetch = server.handle as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as { window?: unknown }).window;
  });

  function seq() {
    return server.calls.map((c) => `${c.method} ${c.path}`);
  }

  it("PATCH 404 → single POST with the same id + full local copy → replay (no re-key)", async () => {
    // Server lost LOST_ID (fresh Cloud Run revision with an empty disk).
    const { timers, statuses, ref, controller, edit } = setup(
      server,
      makeDoc(LOST_ID),
    );
    edit("Typed after the redeploy");
    await timers.advance(650);

    assert.deepEqual(seq(), [
      `PATCH /api/sermons/${LOST_ID}/content`,
      "POST /api/sermons",
      `PATCH /api/sermons/${LOST_ID}/content`,
    ]);
    const post = server.calls[1].body!;
    assert.equal(post.id, LOST_ID);
    assert.equal(post.title, "Joy That Outlasts the Moment");
    assert.deepEqual(
      post.content,
      makeDoc(LOST_ID, "Typed after the redeploy").content,
    );
    assert.equal(post.notes, "Illustration: the lighthouse");
    assert.deepEqual(post.presentation, {
      ...DEFAULT_PRESENTATION_SETTINGS,
      theme: "light",
    });

    // Nothing re-keyed: same id in memory, local cache and active-id.
    assert.equal(ref.current!.id, LOST_ID);
    assert.equal(cachedDoc(mem).id, LOST_ID);
    assert.equal(mem.get(ACTIVE_ID_KEY), LOST_ID);
    assert.deepEqual(
      cachedDoc(mem).content,
      makeDoc(LOST_ID, "Typed after the redeploy").content,
    );
    assert.deepEqual(
      server.sermons.get(LOST_ID)!.content,
      makeDoc(LOST_ID, "Typed after the redeploy").content,
    );

    assert.deepEqual(kinds(statuses), ["saving", "restoring", "saved"]);
    assert.equal(controller.hasPending, false);

    // Subsequent saves go straight through (no more 404s / POSTs).
    edit("Next paragraph");
    await timers.advance(650);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);
    assert.equal(server.calls.length, 4);
  });

  it("two tabs: 409 on restore → GET → replay our PATCH (last writer wins, no dropped edits)", async () => {
    // Both tabs share origin localStorage and the (wiped) server.
    const tabA = setup(server, makeDoc(LOST_ID, "tab A words"));
    const tabB = setup(server, makeDoc(LOST_ID, "tab B words"));

    // Hold tab A's POST so tab B can restore the sermon first.
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => (releaseA = r));
    let firstPost = true;
    server.override = async (call) => {
      if (call.method === "POST" && firstPost) {
        firstPost = false;
        await gateA;
      }
      return server.route(call);
    };

    tabA.edit("tab A words");
    await tabA.timers.advance(650); // A: PATCH 404 → POST (held)
    tabB.edit("tab B words");
    await tabB.timers.advance(650); // B: PATCH 404 → POST 201 → PATCH 200
    assert.deepEqual(
      server.sermons.get(LOST_ID)!.content,
      makeDoc(LOST_ID, "tab B words").content,
    );
    assert.equal(kinds(tabB.statuses).at(-1), "saved");

    releaseA(); // A: POST → 409 → GET → replay PATCH
    await tabA.timers.advance(0);

    const aCalls = server.calls.map((c) => `${c.method} ${c.path}`);
    assert.deepEqual(aCalls.slice(-2), [
      `GET /api/sermons/${LOST_ID}`,
      `PATCH /api/sermons/${LOST_ID}/content`,
    ]);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 2);
    assert.equal(server.sermons.size, 1, "no duplicate sermon");
    // Tab A's edit was not dropped: it is the last write.
    assert.deepEqual(
      server.sermons.get(LOST_ID)!.content,
      makeDoc(LOST_ID, "tab A words").content,
    );
    assert.equal(tabA.ref.current!.id, LOST_ID);
    assert.deepEqual(kinds(tabA.statuses), ["saving", "restoring", "saved"]);
    assert.equal(mem.get(ACTIVE_ID_KEY), LOST_ID);
  });

  it("server without the id contract (400 unrecognized `id`) → POST without id → re-key → replay", async () => {
    server.idMode = "strict-legacy";
    const { timers, statuses, ref, edit } = setup(server, makeDoc(LOST_ID));
    edit("legacy server");
    await timers.advance(650);

    assert.deepEqual(seq(), [
      `PATCH /api/sermons/${LOST_ID}/content`,
      "POST /api/sermons",
      "POST /api/sermons",
      `PATCH /api/sermons/${NEW_1}/content`,
    ]);
    assert.equal(server.calls[1].body!.id, LOST_ID);
    assert.equal(server.calls[2].body!.id, undefined);
    assert.deepEqual(
      server.calls[2].body!.content,
      makeDoc(LOST_ID, "legacy server").content,
    );

    // Local copy re-keyed in place: same content, new id, active-id updated,
    // and nothing left under the lost id.
    assert.equal(ref.current!.id, NEW_1);
    assert.equal(cachedDoc(mem).id, NEW_1);
    assert.equal(mem.get(ACTIVE_ID_KEY), NEW_1);
    assert.deepEqual(
      cachedDoc(mem).content,
      makeDoc(LOST_ID, "legacy server").content,
    );
    assert.ok(![...mem.values()].some((v) => v.includes(LOST_ID)));
    assert.deepEqual(kinds(statuses), ["saving", "restoring", "saved"]);

    edit("after re-key");
    await timers.advance(650);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 2);
    assert.equal(server.calls.at(-1)!.path, `/api/sermons/${NEW_1}/content`);
  });

  it("server that silently ignores `id` (returns another UUID) → re-key after a single POST", async () => {
    server.idMode = "ignore-legacy";
    const { timers, statuses, ref, edit } = setup(server, makeDoc(LOST_ID));
    edit("x");
    await timers.advance(650);
    assert.deepEqual(seq(), [
      `PATCH /api/sermons/${LOST_ID}/content`,
      "POST /api/sermons",
      `PATCH /api/sermons/${NEW_1}/content`,
    ]);
    assert.equal(ref.current!.id, NEW_1);
    assert.equal(mem.get(ACTIVE_ID_KEY), NEW_1);
    assert.deepEqual(kinds(statuses), ["saving", "restoring", "saved"]);
  });

  it("a 400 that is not about `id` is not treated as legacy (backoff, no second POST)", async () => {
    server.override = (call) =>
      call.method === "POST"
        ? json(400, {
            error: "Validation failed",
            details: [{ path: ["title"], message: "String must contain at most 500 character(s)" }],
          })
        : server.route(call);
    const { timers, statuses, edit } = setup(server, makeDoc(LOST_ID));
    edit("x");
    await timers.advance(650);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);
    assert.equal(kinds(statuses).at(-1), "retrying");
  });

  it("concurrent saves during recovery trigger exactly one POST", async () => {
    let releasePost!: () => void;
    const postGate = new Promise<void>((r) => (releasePost = r));
    server.override = async (call) => {
      if (call.method === "POST") await postGate;
      return server.route(call);
    };
    const { timers, statuses, ref, controller, edit } = setup(
      server,
      makeDoc(LOST_ID),
    );

    edit("one");
    await timers.advance(650); // PATCH 404 → POST (held)
    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);

    // Burst while the POST is in flight: more edits, notes, manual flushes,
    // and direct recovery calls for the same lost id.
    edit("two");
    controller.request("notes");
    edit("three");
    const direct = [
      controller.recoverMissing(LOST_ID),
      controller.recoverMissing(LOST_ID),
    ];
    void controller.flush();
    void controller.flush();
    await timers.advance(2_000);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);

    releasePost();
    const recovered = await Promise.all(direct);
    await timers.advance(2_000);

    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);
    assert.deepEqual(
      recovered.map((d) => d.id),
      [LOST_ID, LOST_ID],
    );
    assert.equal(ref.current!.id, LOST_ID);
    const patches = server.calls.filter((c) => c.method === "PATCH");
    assert.equal(patches[0].path, `/api/sermons/${LOST_ID}/content`);
    assert.ok(patches.some((c) => c.path === `/api/sermons/${LOST_ID}`)); // notes
    // Only the very first PATCH preceded the (single) POST; every later
    // write landed after the restore, so none of them could 404.
    const postIdx = server.calls.findIndex((c) => c.method === "POST");
    const patchIdx = server.calls
      .map((c, i) => (c.method === "PATCH" ? i : -1))
      .filter((i) => i >= 0);
    assert.equal(patchIdx.filter((i) => i < postIdx).length, 1);
    assert.ok(patchIdx.length <= 4, `PATCH count ${patchIdx.length}`);
    assert.deepEqual(
      server.sermons.get(LOST_ID)!.content,
      makeDoc(LOST_ID, "three").content,
    );
    assert.equal(kinds(statuses).at(-1), "saved");
    assert.ok(!kinds(statuses).includes("offline"));
  });

  it("concurrent saves during a legacy (re-key) recovery also trigger one id-less POST", async () => {
    server.idMode = "ignore-legacy";
    let releasePost!: () => void;
    const postGate = new Promise<void>((r) => (releasePost = r));
    server.override = async (call) => {
      if (call.method === "POST") await postGate;
      return server.route(call);
    };
    const { timers, ref, controller, edit } = setup(server, makeDoc(LOST_ID));
    edit("one");
    await timers.advance(650);
    edit("two");
    controller.request("notes");
    void controller.flush();
    const direct = controller.recoverMissing(LOST_ID);
    await timers.advance(2_000);
    releasePost();
    await direct;
    await timers.advance(2_000);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);
    assert.equal(ref.current!.id, NEW_1);
    assert.equal(
      server.calls.filter((c) => c.path.includes(LOST_ID)).length,
      1,
      "only the original 404 hit the lost id",
    );
    assert.deepEqual(
      server.sermons.get(NEW_1)!.content,
      makeDoc(NEW_1, "two").content,
    );
  });

  it("re-create POST failure falls back to backoff (no tight loop), then recovers", async () => {
    let postFailures = 1;
    server.override = (call) => {
      if (call.method === "POST" && postFailures > 0) {
        postFailures--;
        return json(503, { error: "unavailable" });
      }
      return server.route(call);
    };
    const { timers, statuses, ref, edit } = setup(server, makeDoc(LOST_ID));
    edit("keep me");
    await timers.advance(650);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 1);
    assert.deepEqual(kinds(statuses), ["saving", "restoring", "retrying"]);
    assert.equal(cachedDoc(mem).id, LOST_ID);
    assert.deepEqual(
      cachedDoc(mem).content,
      makeDoc(LOST_ID, "keep me").content,
    );

    // Nothing happens until the backoff delay elapses.
    await timers.advance(999);
    assert.equal(server.calls.length, 2);
    await timers.advance(1);
    assert.equal(server.count("POST", /^\/api\/sermons$/), 2);
    assert.equal(kinds(statuses).at(-1), "saved");
    assert.equal(ref.current!.id, LOST_ID);
    assert.ok(server.sermons.has(LOST_ID));
    void NEW_2;
  });
});

describe("autosave error classification and retries", () => {
  let mem: Map<string, string>;
  let server: FakeServer;
  let originalFetch: typeof fetch;
  const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(() => {
    mem = installLocalStorage();
    server = new FakeServer();
    server.sermons.set(ID, {
      id: ID,
      meta: { title: "t", createdAt: "x", updatedAt: "x" },
      content: { type: "doc", content: [] },
    });
    originalFetch = globalThis.fetch;
    globalThis.fetch = server.handle as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as { window?: unknown }).window;
  });

  it("network error (fetch throws) → Offline, never POSTs, local copy kept", async () => {
    server.override = () => "network";
    const { timers, statuses, edit } = setup(server, makeDoc(ID));
    edit("offline words");
    await timers.advance(650);
    assert.deepEqual(statuses.at(-1), { kind: "offline", attempt: 1, delayMs: 1_000 });
    assert.equal(server.count("POST", /./), 0);
    assert.deepEqual(cachedDoc(mem).content, makeDoc(ID, "offline words").content);

    // Connectivity returns before the next backoff tick → saved.
    server.override = null;
    await timers.advance(1_000);
    assert.equal(kinds(statuses).at(-1), "saved");
  });

  it("5xx → 'retrying' (not offline) with capped exponential backoff and bounded attempts", async () => {
    server.override = () => json(500, { error: "Internal server error" });
    const { timers, statuses, controller, edit } = setup(server, makeDoc(ID), {
      maxAttempts: 5,
      baseDelayMs: 1_000,
      maxDelayMs: 4_000,
    });
    edit("x");
    await timers.advance(650);
    await timers.advance(60_000);

    const patches = server.count("PATCH", /content$/);
    assert.equal(patches, 5, "exactly maxAttempts requests");
    const retrying = statuses.filter((s) => s.kind === "retrying");
    assert.deepEqual(
      retrying.map((s) => (s.kind === "retrying" ? s.delayMs : -1)),
      [1_000, 2_000, 4_000, 4_000],
    );
    assert.deepEqual(statuses.at(-1), { kind: "failed", reason: "server" });
    assert.ok(!kinds(statuses).includes("offline"));
    assert.equal(controller.isExhausted, true);
    assert.equal(timers.size, 0, "no retry scheduled after exhaustion");

    // Stays put: no further requests however long we wait.
    await timers.advance(10 * 60_000);
    assert.equal(server.count("PATCH", /content$/), 5);

    // Manual retry resets the budget.
    server.override = null;
    await controller.retryNow();
    await settle();
    assert.equal(kinds(statuses).at(-1), "saved");
    assert.equal(controller.isExhausted, false);
  });

  it("exhausted network failures end in failed/network (Offline label + Retry)", async () => {
    server.override = () => "network";
    const { timers, statuses, edit } = setup(server, makeDoc(ID), {
      maxAttempts: 3,
    });
    edit("x");
    await timers.advance(650);
    await timers.advance(60_000);
    assert.equal(server.calls.length, 3);
    assert.deepEqual(statuses.at(-1), { kind: "failed", reason: "network" });
  });

  it("an edit after exhaustion makes exactly one more attempt", async () => {
    server.override = () => json(502, { error: "bad gateway" });
    const { timers, statuses, edit } = setup(server, makeDoc(ID), {
      maxAttempts: 2,
    });
    edit("a");
    await timers.advance(650);
    await timers.advance(60_000);
    assert.equal(server.calls.length, 2);
    edit("b");
    await timers.advance(60_000);
    assert.equal(server.calls.length, 3);
    assert.deepEqual(statuses.at(-1), { kind: "failed", reason: "server" });
  });

  it("sermonApi wraps fetch rejections as SermonNetworkError; HTTP errors are not network", async () => {
    server.override = () => "network";
    await assert.rejects(
      autosaveContent(ID, { content: { type: "doc" } }),
      (err) => err instanceof SermonNetworkError && classifySaveError(err) === "network",
    );
    server.override = () => json(503, { error: "down" });
    await assert.rejects(
      autosaveContent(ID, { content: { type: "doc" } }),
      (err) => classifySaveError(err) === "server",
    );
  });

  it("backoffDelay doubles from base and caps", () => {
    const o = { baseDelayMs: 1_000, maxDelayMs: 30_000 };
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6, 7, 50].map((a) => backoffDelay(a, o)),
      [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000],
    );
  });
});

/* ------------------------------------------------------------------ */

describe("flushPending before a sermon switch", () => {
  let server: FakeServer;
  let originalFetch: typeof fetch;
  const ID = "44444444-4444-4444-8444-444444444444";

  beforeEach(() => {
    installLocalStorage();
    server = new FakeServer();
    server.sermons.set(ID, {
      id: ID,
      meta: { title: "Fixture", createdAt: "x", updatedAt: "x" },
      content: makeDoc(ID).content,
      presentation: { ...DEFAULT_PRESENTATION_SETTINGS },
      notes: "",
    } as Sermon);
    originalFetch = globalThis.fetch;
    globalThis.fetch = server.handle as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as { window?: unknown }).window;
  });

  it("saves a debounced edit immediately and resolves true", async () => {
    const { timers, controller, edit } = setup(server, makeDoc(ID));
    edit("Typed just before switching");
    const ok = await controller.flushPending();
    assert.equal(ok, true);
    assert.equal(controller.hasPending, false);
    assert.equal(server.count("PATCH", /\/content$/), 1);
    const saved = server.sermons.get(ID)!;
    assert.deepEqual(saved.content, makeDoc(ID, "Typed just before switching").content);
    // The debounce timer was cleared: no second PATCH later.
    await timers.advance(2_000);
    assert.equal(server.count("PATCH", /\/content$/), 1);
  });

  it("waits for an in-flight save and a newer queued edit", async () => {
    const { timers, controller, edit } = setup(server, makeDoc(ID));
    edit("first");
    await timers.advance(650); // first PATCH starts
    edit("second");
    assert.equal(await controller.flushPending(), true);
    assert.deepEqual(
      server.sermons.get(ID)!.content,
      makeDoc(ID, "second").content,
    );
  });

  it("returns false and keeps the edit queued when the save fails", async () => {
    const { statuses, controller, edit } = setup(server, makeDoc(ID));
    server.override = () => "network";
    edit("offline edit");
    assert.equal(await controller.flushPending(), false);
    assert.equal(controller.hasPending, true);
    assert.equal(statuses.at(-1)!.kind, "offline");
  });

  it("resolves true with nothing queued and makes no request", async () => {
    const { controller } = setup(server, makeDoc(ID));
    assert.equal(await controller.flushPending(), true);
    assert.equal(server.calls.length, 0);
  });
});
