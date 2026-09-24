"use client";

import type { JSONContent } from "@tiptap/react";
import type { Sermon } from "@/lib/sermon/types";
import type { SermonDocument, PresentationSettings } from "@/types/document";
import {
  DEFAULT_PRESENTATION_SETTINGS,
  STORAGE_KEY,
} from "@/types/document";
import { createSeedDocument } from "@/lib/seed";
import {
  createSermon,
  getSermon,
  isLegacySeedId,
  isLocalDraftId,
  isServerSermonId,
  listSermons,
} from "@/lib/sermonApi";

/** Last-open sermon id — used so /edit and /preach stay on the same doc. */
export const ACTIVE_ID_KEY = "sermon-editor-presenter:active-id:v1";

function textOf(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map(textOf).join("");
}

/** Title from the first TipTap `title` block, if any. */
export function extractTitleFromContent(
  content: JSONContent | null | undefined,
): string | undefined {
  if (!content?.content) return undefined;
  for (const node of content.content) {
    if (node.type === "title") {
      const text = textOf(node).trim();
      return text || undefined;
    }
  }
  return undefined;
}

export function sermonToDocument(
  sermon: Sermon,
  fallback?: SermonDocument | null,
): SermonDocument {
  const sameLocal =
    fallback && fallback.id === sermon.id ? fallback : null;
  return {
    id: sermon.id,
    title: sermon.meta.title,
    updatedAt: sermon.meta.updatedAt,
    content: sermon.content,
    presentationSettings:
      sermon.presentation ??
      sameLocal?.presentationSettings ??
      { ...DEFAULT_PRESENTATION_SETTINGS },
    notes: sermon.notes ?? sameLocal?.notes ?? "",
  };
}

export function getActiveSermonId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function setActiveSermonId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_ID_KEY, id);
  } catch {
    /* ignore quota */
  }
}

function clearActiveSermonId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_ID_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Rewrite legacy seed-* (and other non-UUID / non-local) ids to local-seed
 * so returning users never keep calling GET/PATCH with seed-* against the API.
 */
function migrateClientDocumentIds(doc: SermonDocument): SermonDocument {
  if (isServerSermonId(doc.id) || isLocalDraftId(doc.id)) {
    return doc;
  }
  return { ...doc, id: "local-seed" };
}

function migrateActiveIdStorage(): void {
  const active = getActiveSermonId();
  if (!active) return;
  if (isServerSermonId(active) || isLocalDraftId(active)) return;
  // seed-* or garbage (e.g. seed-philippians-4:0) — drop so resolve can migrate.
  clearActiveSermonId();
}

/**
 * Synchronously strip seed-* / non-UUID ids from localStorage BEFORE any async
 * GET. Call at the top of resolveActiveDocument so a stale active-id can never
 * race ahead of migrate into getSermon.
 */
export function purgeLegacySeedIdsFromStorage(): void {
  if (typeof window === "undefined") return;
  migrateActiveIdStorage();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SermonDocument;
    if (!parsed || typeof parsed !== "object") return;
    const migrated = migrateClientDocumentIds(parsed);
    if (migrated.id !== parsed.id) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    }
  } catch {
    /* ignore corrupt / quota */
  }
}

export function loadDocument(): SermonDocument {
  if (typeof window === "undefined") {
    return createSeedDocument();
  }
  migrateActiveIdStorage();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedDocument();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      setActiveSermonId(seed.id);
      return seed;
    }
    const parsed = JSON.parse(raw) as SermonDocument;
    if (!parsed?.content || !parsed.presentationSettings) {
      const seed = createSeedDocument();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      setActiveSermonId(seed.id);
      return seed;
    }
    const migrated = migrateClientDocumentIds(parsed);
    if (migrated.id !== parsed.id) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    }
    const active = getActiveSermonId();
    if (!active) {
      setActiveSermonId(migrated.id);
    } else if (isLegacySeedId(active) || (!isServerSermonId(active) && !isLocalDraftId(active))) {
      setActiveSermonId(migrated.id);
    }
    return migrated;
  } catch {
    const seed = createSeedDocument();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      setActiveSermonId(seed.id);
    } catch {
      /* ignore quota */
    }
    return seed;
  }
}

export function saveDocument(doc: SermonDocument): void {
  if (typeof window === "undefined") return;
  const next: SermonDocument = {
    ...doc,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setActiveSermonId(next.id);
  } catch {
    /* ignore quota */
  }
}

export function updatePresentationSettings(
  doc: SermonDocument,
  patch: Partial<PresentationSettings>,
): SermonDocument {
  const next: SermonDocument = {
    ...doc,
    presentationSettings: { ...doc.presentationSettings, ...patch },
    updatedAt: new Date().toISOString(),
  };
  saveDocument(next);
  return next;
}

export type DocumentSource = "server" | "local";

async function persistServerDoc(
  sermon: Sermon,
  local: SermonDocument | null,
  sermons: Sermon[],
): Promise<{
  doc: SermonDocument;
  source: DocumentSource;
  sermons: Sermon[];
}> {
  const doc = sermonToDocument(sermon, local);
  saveDocument(doc);
  return { doc, source: "server", sermons };
}

async function createFromLocal(
  local: SermonDocument,
  sermons: Sermon[],
): Promise<{
  doc: SermonDocument;
  source: DocumentSource;
  sermons: Sermon[];
}> {
  const created = await createSermon({
    title: local.title || "Untitled sermon",
    content: local.content,
    presentation: local.presentationSettings,
    notes: local.notes,
  });
  const doc = sermonToDocument(created, local);
  saveDocument(doc);
  const nextList = sermons.some((s) => s.id === created.id)
    ? sermons.map((s) => (s.id === created.id ? created : s))
    : [...sermons, created];
  return { doc, source: "server", sermons: nextList };
}

/**
 * Resolve the active sermon: server is source of truth when reachable;
 * localStorage is offline fallback + cache of last-open id/doc.
 *
 * Online first-load contract (UUID-only API):
 * - GET /api/sermons
 * - last-active UUID still in list → open it
 * - else if list non-empty → open first
 * - else POST seed/local content → use returned UUID
 * - local-* drafts always POST+remap when online (never GET/PATCH local-/seed-*)
 */
export async function resolveActiveDocument(): Promise<{
  doc: SermonDocument;
  source: DocumentSource;
  sermons: Sermon[];
}> {
  // Sync purge first — never let a stale seed-* active-id survive into async work.
  purgeLegacySeedIdsFromStorage();
  const local = loadDocument();
  const activeId = getActiveSermonId() ?? local.id;
  // Belt: refuse to even consider get-by-id unless UUID (seed/local stay local).
  const openId = isServerSermonId(activeId) ? activeId : null;

  try {
    const sermons = await listSermons();

    // Prefer last-active UUID only when it appears in the list response.
    // Never speculative GET-by-id for a UUID absent from the list (orphans /
    // wiped Cloud Run store → 404 race ahead of POST and crash /edit).
    if (openId) {
      const match = sermons.find((s) => s.id === openId);
      if (match) {
        const full = await getSermon(match.id);
        return persistServerDoc(full, local, sermons);
      }
      // Stale active UUID (not on server) — clear and migrate from local content.
      clearActiveSermonId();
    }

    // Real offline drafts (local-<timestamp>) — POST to obtain a UUID and remap.
    // Bootstrap `local-seed` / legacy seed-* is NOT a user draft: only POST when
    // the server list is empty so we do not duplicate the sample sermon.
    const draftId = isLocalDraftId(activeId)
      ? activeId
      : isLocalDraftId(local.id)
        ? local.id
        : null;
    const isBootstrapSeed =
      draftId === "local-seed" ||
      isLegacySeedId(activeId) ||
      isLegacySeedId(local.id);

    if (draftId && !isBootstrapSeed) {
      return createFromLocal(local, sermons);
    }

    if (sermons.length > 0) {
      const full = await getSermon(sermons[0].id);
      return persistServerDoc(full, local, sermons);
    }

    // Empty server store — seed from local cache (seed content) so first visit
    // is never blank; returned id is always a UUID.
    return createFromLocal(local, sermons);
  } catch {
    // Stay offline; keep local-* (never invent a fake server id).
    const offlineDoc =
      isServerSermonId(local.id) || isLocalDraftId(local.id)
        ? local
        : migrateClientDocumentIds(local);
    saveDocument(offlineDoc);
    return { doc: offlineDoc, source: "local", sermons: [] };
  }
}

/**
 * When an offline local-* / legacy draft is edited while the API is reachable,
 * POST once to obtain a UUID and remap the active document.
 */
export async function promoteLocalDraftToServer(
  local: SermonDocument,
): Promise<SermonDocument> {
  if (isServerSermonId(local.id)) return local;
  const created = await createSermon({
    title: local.title || "Untitled sermon",
    content: local.content,
    presentation: local.presentationSettings,
    notes: local.notes,
  });
  const doc = sermonToDocument(created, local);
  saveDocument(doc);
  return doc;
}
