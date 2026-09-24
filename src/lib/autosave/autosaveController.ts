/**
 * Server autosave queue for the Edit shell (issue #9).
 *
 * - Serialises content/notes saves (one flight at a time) behind per-kind
 *   debounces; local cache writes stay in the shell and are never blocked.
 * - PATCH 404 = the server lost the sermon (e.g. Cloud Run revision with an
 *   empty disk store, or deleted in another tab). NOT offline: re-create it via
 *   POST /api/sermons { id: <same id>, ...full local copy } so nothing is
 *   re-keyed, then replay the pending save. Recovery is single-flight per id.
 *     · 409 (another tab already restored it) → GET it to confirm, then replay
 *       our PATCH (last writer wins; edits are never dropped).
 *     · 400 rejecting `id` / unknown keys (server predates the contract) →
 *       POST again without `id` and re-key the local copy to the returned UUID.
 *       Same if a server silently ignores `id` and returns a different UUID.
 * - Only a request that never got an HTTP response is "offline". HTTP errors
 *   (5xx, other 4xx) are "retrying". Both back off exponentially with a cap and
 *   a max attempt count; after that the state is a persistent "failed" until a
 *   manual retry (or the next edit, which makes exactly one more attempt).
 */

import {
  SermonApiError,
  SermonNetworkError,
  isServerSermonId,
  isSermonNotFoundError,
  type CreateSermonRequest,
} from "@/lib/sermonApi";
import type { CreateSermonInput, Sermon } from "@/lib/sermon/types";
import type { SermonDocument } from "@/types/document";

export type SaveKind = "content" | "notes";

export type SaveFailureKind = "network" | "server";

export type AutosaveStatus =
  | { kind: "saving" }
  | { kind: "saved" }
  /** 404 recovery in progress (POST re-create + re-key). */
  | { kind: "restoring" }
  /** Real network failure; a retry is scheduled. */
  | { kind: "offline"; attempt: number; delayMs: number }
  /** HTTP error (5xx etc.); a retry is scheduled. */
  | { kind: "retrying"; attempt: number; delayMs: number }
  /** Retries exhausted; waiting for a manual retry. */
  | { kind: "failed"; reason: SaveFailureKind };

export interface TimerApi {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface AutosaveOptions {
  /** Total attempts per failing save before entering "failed". */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  debounceMs: Record<SaveKind, number>;
}

export const DEFAULT_AUTOSAVE_OPTIONS: AutosaveOptions = {
  maxAttempts: 6,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  debounceMs: { content: 650, notes: 800 },
};

export interface AutosaveDeps {
  /** Latest local copy of the active document (synchronous, e.g. a ref). */
  getDoc: () => SermonDocument | null;
  /**
   * Re-key the local copy (state + localStorage doc + active-id) from one id to
   * another, keeping its content. Must be a no-op if the active doc is no
   * longer `fromId`. Returns the re-keyed doc, or null if it was not applied.
   */
  rekeyDoc: (
    fromId: string,
    toId: string,
    updatedAt: string,
  ) => SermonDocument | null;
  /** Server write for one kind of change. Must throw SermonApiError on HTTP errors. */
  save: Record<SaveKind, (doc: SermonDocument) => Promise<Sermon>>;
  /** POST /api/sermons (optionally with a client-supplied `id`). */
  create: (input: CreateSermonRequest) => Promise<Sermon>;
  /** GET /api/sermons/:id — only used after a 409 on a same-id restore. */
  get: (id: string) => Promise<Sermon>;
  onStatus: (status: AutosaveStatus) => void;
  /** Called after a successful server write for the (still) active doc. */
  onSaved?: (kind: SaveKind, sermon: Sermon) => void;
  /**
   * Called when a lost doc is back on the server (404 recovery).
   * mode: "same-id" restored under its id, "conflict" another tab already had
   * (409), "rekeyed" legacy server minted a new id.
   */
  onRecovered?: (
    fromId: string,
    sermon: Sermon,
    mode: RecoveryMode,
  ) => void;
  timers?: TimerApi;
  options?: Partial<AutosaveOptions>;
}

export type RecoveryMode = "same-id" | "conflict" | "rekeyed";

/**
 * 400/422 from a server that predates the client-id contract and rejects the
 * `id` field (e.g. zod strict "Unrecognized key(s) in object: 'id'").
 */
export function isUnsupportedClientIdError(err: unknown): boolean {
  if (!(err instanceof SermonApiError)) return false;
  if (err.status !== 400 && err.status !== 422) return false;
  let text = err.message;
  try {
    text += ` ${JSON.stringify(err.details ?? "")}`;
  } catch {
    /* ignore */
  }
  return /\bid\b|unrecognized|unknown (field|key|propert)/i.test(text);
}

export function classifySaveError(err: unknown): SaveFailureKind {
  if (err instanceof SermonNetworkError) return "network";
  return "server";
}

/** attempt is 1-based: 1 → base, 2 → 2×base, … capped at maxDelayMs. */
export function backoffDelay(
  attempt: number,
  opts: Pick<AutosaveOptions, "baseDelayMs" | "maxDelayMs">,
): number {
  const exp = Math.max(0, attempt - 1);
  return Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** Math.min(exp, 30));
}

export function createInputFromDoc(doc: SermonDocument): CreateSermonInput {
  return {
    title: doc.title || "Untitled sermon",
    content: doc.content,
    presentation: doc.presentationSettings,
    notes: doc.notes ?? "",
  };
}

const defaultTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class AutosaveController {
  private readonly deps: AutosaveDeps;
  private readonly opts: AutosaveOptions;
  private readonly timers: TimerApi;

  private readonly dirty = new Set<SaveKind>();
  private readonly debounce = new Map<SaveKind, unknown>();
  private retryTimer: unknown = null;
  private attempts = 0;
  private exhausted = false;
  private generation = 0;
  private disposed = false;
  private flight: Promise<void> | null = null;
  private rerun = false;
  private rekeyFlight: {
    fromId: string;
    promise: Promise<SermonDocument>;
  } | null = null;

  constructor(deps: AutosaveDeps) {
    this.deps = deps;
    this.timers = deps.timers ?? defaultTimers;
    this.opts = {
      ...DEFAULT_AUTOSAVE_OPTIONS,
      ...deps.options,
      debounceMs: {
        ...DEFAULT_AUTOSAVE_OPTIONS.debounceMs,
        ...deps.options?.debounceMs,
      },
    };
  }

  /** Mark a kind dirty and (re)start its debounce. */
  request(kind: SaveKind): void {
    if (this.disposed) return;
    this.dirty.add(kind);
    const prev = this.debounce.get(kind);
    if (prev !== undefined) this.timers.clear(prev);
    this.debounce.set(
      kind,
      this.timers.set(() => {
        this.debounce.delete(kind);
        // While a backoff timer is pending, let it drive the next attempt.
        if (this.retryTimer !== null) return;
        void this.flush();
      }, this.opts.debounceMs[kind]),
    );
  }

  /** Manual retry: reset the attempt budget and save now. */
  retryNow(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.attempts = 0;
    this.exhausted = false;
    this.clearRetry();
    return this.flush();
  }

  get hasPending(): boolean {
    return this.dirty.size > 0;
  }

  get isExhausted(): boolean {
    return this.exhausted;
  }

  /** Drop queued work (doc switch). In-flight results are ignored. */
  cancel(): void {
    this.generation++;
    for (const h of this.debounce.values()) this.timers.clear(h);
    this.debounce.clear();
    this.clearRetry();
    this.dirty.clear();
    this.attempts = 0;
    this.exhausted = false;
    this.rerun = false;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  /** Run queued saves now (serialised: callers during a flight share it). */
  flush(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.flight) {
      this.rerun = true;
      return this.flight;
    }
    const run = this.runFlush().finally(() => {
      if (this.flight === run) this.flight = null;
      if (
        this.rerun &&
        !this.disposed &&
        this.dirty.size > 0 &&
        this.retryTimer === null
      ) {
        this.rerun = false;
        void this.flush();
      }
      this.rerun = false;
    });
    this.flight = run;
    return run;
  }

  /**
   * Re-create a sermon the server lost, under the same id when supported.
   * Single-flight: concurrent callers for the same id share one POST.
   */
  recoverMissing(lostId: string): Promise<SermonDocument> {
    return this.singleFlight(lostId, () => this.restore(lostId));
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.timers.clear(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private emit(status: AutosaveStatus): void {
    if (!this.disposed) this.deps.onStatus(status);
  }

  private async runFlush(): Promise<void> {
    const gen = this.generation;
    this.clearRetry();
    while (this.dirty.size > 0) {
      if (gen !== this.generation || this.disposed) return;
      const kind: SaveKind = this.dirty.has("content")
        ? "content"
        : "notes";
      this.dirty.delete(kind);
      this.emit({ kind: "saving" });
      try {
        await this.saveOnce(kind, gen);
      } catch (err) {
        if (gen !== this.generation || this.disposed) return;
        this.dirty.add(kind);
        this.handleFailure(err);
        return;
      }
    }
    if (gen !== this.generation || this.disposed) return;
    this.attempts = 0;
    this.exhausted = false;
    this.emit({ kind: "saved" });
  }

  private async saveOnce(kind: SaveKind, gen: number): Promise<void> {
    let doc = this.deps.getDoc();
    if (!doc) return;
    // Offline local-* / legacy seed ids must never PATCH the API: POST first.
    if (!isServerSermonId(doc.id)) {
      doc = await this.promoteLocal(doc.id);
    }
    let sermon: Sermon;
    try {
      sermon = await this.deps.save[kind](doc);
    } catch (err) {
      if (!isSermonNotFoundError(err)) throw err;
      if (gen !== this.generation) return;
      doc = await this.recoverMissing(doc.id);
      if (gen !== this.generation) return;
      // Replay the pending save against the re-created sermon.
      sermon = await this.deps.save[kind](doc);
    }
    if (gen !== this.generation) return;
    if (this.deps.getDoc()?.id === sermon.id) {
      this.deps.onSaved?.(kind, sermon);
    }
  }

  private singleFlight(
    fromId: string,
    work: () => Promise<SermonDocument>,
  ): Promise<SermonDocument> {
    if (this.rekeyFlight && this.rekeyFlight.fromId === fromId) {
      return this.rekeyFlight.promise;
    }
    const current = this.deps.getDoc();
    if (!current) {
      return Promise.reject(new SermonApiError("No active sermon", 404));
    }
    // Already re-keyed by an earlier flight (or the doc switched): the save
    // simply targets the current doc — never POST a second copy.
    if (current.id !== fromId && isServerSermonId(current.id)) {
      return Promise.resolve(current);
    }
    const promise = work();
    const flight = { fromId, promise };
    this.rekeyFlight = flight;
    const clear = () => {
      if (this.rekeyFlight === flight) this.rekeyFlight = null;
    };
    promise.then(clear, clear);
    return promise;
  }

  /** Offline local-* draft → POST (server mints the UUID) → re-key. */
  private promoteLocal(fromId: string): Promise<SermonDocument> {
    return this.singleFlight(fromId, async () => {
      const snapshot = this.deps.getDoc()!;
      const created = await this.deps.create(createInputFromDoc(snapshot));
      return this.applyRekey(fromId, created, snapshot);
    });
  }

  private async restore(lostId: string): Promise<SermonDocument> {
    this.emit({ kind: "restoring" });
    const snapshot = this.deps.getDoc()!;
    const input = createInputFromDoc(snapshot);
    let created: Sermon;
    try {
      created = await this.deps.create({ ...input, id: lostId });
    } catch (err) {
      if (err instanceof SermonApiError && err.status === 409) {
        // Another tab/device restored it first. Confirm it exists, keep our
        // id and let the caller replay our PATCH (last writer wins).
        const existing = await this.deps.get(lostId);
        this.deps.onRecovered?.(lostId, existing, "conflict");
        return this.deps.getDoc() ?? snapshot;
      }
      if (!isUnsupportedClientIdError(err)) throw err;
      // Server predates the client-id contract: let it mint a new UUID.
      created = await this.deps.create(input);
    }
    if (created.id.toLowerCase() === lostId.toLowerCase()) {
      this.deps.onRecovered?.(lostId, created, "same-id");
      return this.deps.getDoc() ?? snapshot;
    }
    // 400 fallback, or a server that silently ignored `id`: adopt its UUID.
    this.deps.onRecovered?.(lostId, created, "rekeyed");
    return this.applyRekey(lostId, created, snapshot);
  }

  private applyRekey(
    fromId: string,
    created: Sermon,
    snapshot: SermonDocument,
  ): SermonDocument {
    const rekeyed = this.deps.rekeyDoc(
      fromId,
      created.id,
      created.meta.updatedAt,
    );
    // If the user switched docs mid-flight, keep saving whatever is active.
    return rekeyed ?? this.deps.getDoc() ?? { ...snapshot, id: created.id };
  }

  private handleFailure(err: unknown): void {
    const reason = classifySaveError(err);
    this.attempts++;
    if (this.attempts >= this.opts.maxAttempts) {
      this.exhausted = true;
      this.emit({ kind: "failed", reason });
      return;
    }
    const delayMs = backoffDelay(this.attempts, this.opts);
    this.emit(
      reason === "network"
        ? { kind: "offline", attempt: this.attempts, delayMs }
        : { kind: "retrying", attempt: this.attempts, delayMs },
    );
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      void this.flush();
    }, delayMs);
  }
}
