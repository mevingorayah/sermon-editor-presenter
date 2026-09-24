"use client";

import type {
  CreateSermonInput,
  Sermon,
  UpdateContentInput,
  UpdateSermonInput,
} from "@/lib/sermon/types";

export class SermonApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SermonApiError";
    this.status = status;
  }
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
  await request<{ ok: true }>(`/api/sermons/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function autosaveContent(
  id: string,
  input: UpdateContentInput,
): Promise<Sermon> {
  const data = await request<{ sermon: Sermon }>(
    `/api/sermons/${encodeURIComponent(id)}/content`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return data.sermon;
}
