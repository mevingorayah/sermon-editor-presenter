"use client";

import type {
  CreateSermonInput,
  Sermon,
  UpdateContentInput,
  UpdateSermonInput,
} from "@/lib/sermon/types";

/** Backend contract: sermon path ids are UUID-only (no seed-* / local-*). */
const SERVER_SERMON_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches /api/sermons/:id or /api/sermons/:id/content (id must be UUID). */
const SERMON_BY_ID_PATH_RE =
  /^\/api\/sermons\/([^/?#]+)(?:\/content)?\/?$/;

export function isServerSermonId(id: string | null | undefined): boolean {
  return typeof id === "string" && SERVER_SERMON_ID_RE.test(id);
}

export function isLocalDraftId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("local-");
}

export function isLegacySeedId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("seed-");
}

export class SermonApiError extends Error {
  status: number;
  /** Optional structured error details (e.g. zod issues on 400). */
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SermonApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * The request never produced an HTTP response (fetch threw: DNS, offline,
 * connection reset, CORS/abort). This is the only error the Edit shell should
 * surface as "Offline"; any HTTP status (404, 5xx) means the server is reachable.
 */
export class SermonNetworkError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SermonNetworkError";
    this.cause = cause;
  }
}

export function isSermonNotFoundError(err: unknown): boolean {
  return err instanceof SermonApiError && err.status === 404;
}

function assertServerSermonId(id: string): void {
  if (!isServerSermonId(id)) {
    throw new SermonApiError(
      `Refusing API call with non-UUID sermon id (${id || "empty"})`,
      400,
    );
  }
}

/**
 * Last-line defense: never let fetch hit /api/sermons/<non-UUID>, even if a
 * caller forgets assertServerSermonId. Collection GET/POST /api/sermons is OK.
 */
function assertSafeSermonRequestUrl(input: string): void {
  let pathname = input;
  try {
    if (/^https?:\/\//i.test(input)) {
      pathname = new URL(input).pathname;
    }
  } catch {
    /* keep raw */
  }
  const match = SERMON_BY_ID_PATH_RE.exec(pathname);
  if (!match) return;
  let id = match[1];
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  assertServerSermonId(id);
}

async function readError(
  res: Response,
): Promise<{ message: string; details?: unknown }> {
  try {
    const data = (await res.json()) as {
      error?: string;
      message?: string;
      details?: unknown;
    };
    return {
      message: data.error ?? data.message ?? res.statusText,
      details: data.details,
    };
  } catch {
    return { message: res.statusText || `HTTP ${res.status}` };
  }
}

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  assertSafeSermonRequestUrl(input);
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new SermonNetworkError(
      err instanceof Error ? err.message : "Network request failed",
      err,
    );
  }
  if (!res.ok) {
    const { message, details } = await readError(res);
    throw new SermonApiError(message, res.status, details);
  }
  return (await res.json()) as T;
}

export async function listSermons(): Promise<Sermon[]> {
  const data = await request<{ sermons: Sermon[] }>("/api/sermons");
  return data.sermons ?? [];
}

export async function getSermon(id: string): Promise<Sermon> {
  assertServerSermonId(id);
  const data = await request<{ sermon: Sermon }>(
    `/api/sermons/${encodeURIComponent(id)}`,
  );
  return data.sermon;
}

/**
 * POST body. `id` (UUID) is the restore-under-same-id contract: a new id
 * creates the sermon under that id; an existing id → 409 (stored copy kept).
 * Servers that predate it may reject the field (400) or ignore it and mint a
 * fresh UUID, so callers must always read the id from the response.
 */
export type CreateSermonRequest = CreateSermonInput & { id?: string };

export async function createSermon(
  input: CreateSermonRequest = {},
): Promise<Sermon> {
  if (input.id !== undefined) assertServerSermonId(input.id);
  const data = await request<{ sermon: Sermon }>("/api/sermons", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.sermon;
}

export async function updateSermon(
  id: string,
  patch: UpdateSermonInput,
): Promise<Sermon> {
  assertServerSermonId(id);
  const data = await request<{ sermon: Sermon }>(
    `/api/sermons/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return data.sermon;
}

export async function deleteSermon(id: string): Promise<void> {
  assertServerSermonId(id);
  await request<{ ok: true }>(`/api/sermons/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function autosaveContent(
  id: string,
  input: UpdateContentInput,
): Promise<Sermon> {
  assertServerSermonId(id);
  const data = await request<{ sermon: Sermon }>(
    `/api/sermons/${encodeURIComponent(id)}/content`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return data.sermon;
}
