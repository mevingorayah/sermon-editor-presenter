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
  constructor(message: string, status: number) {
    super(message);
    this.name = "SermonApiError";
    this.status = status;
  }
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

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error ?? data.message ?? res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  assertSafeSermonRequestUrl(input);
  const res = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new SermonApiError(await readError(res), res.status);
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

export async function createSermon(
  input: CreateSermonInput = {},
): Promise<Sermon> {
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
