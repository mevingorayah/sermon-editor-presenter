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

export function loadDocument(): SermonDocument {
  if (typeof window === "undefined") {
    return createSeedDocument();
  }
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
    if (!getActiveSermonId()) {
      setActiveSermonId(parsed.id);
    }
    return parsed;
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

/**
 * Resolve the active sermon: server is source of truth when reachable;
 * localStorage is offline fallback + cache of last-open id/doc.
 */
export async function resolveActiveDocument(): Promise<{
  doc: SermonDocument;
  source: DocumentSource;
  sermons: Sermon[];
}> {
  const local = loadDocument();
  const activeId = getActiveSermonId() ?? local.id;

  try {
    const sermons = await listSermons();

    if (activeId) {
      const match = sermons.find((s) => s.id === activeId);
      if (match) {
        const full = await getSermon(match.id);
        const doc = sermonToDocument(full, local);
        saveDocument(doc);
        return { doc, source: "server", sermons };
      }
      // Active id missing on server — try fetching directly (list race).
      try {
        const full = await getSermon(activeId);
        const doc = sermonToDocument(full, local);
        saveDocument(doc);
        return { doc, source: "server", sermons };
      } catch {
        /* fall through */
      }
    }

    if (sermons.length > 0) {
      const full = await getSermon(sermons[0].id);
      const doc = sermonToDocument(full, local);
      saveDocument(doc);
      return { doc, source: "server", sermons };
    }

    // Empty server store — seed from local cache so first visit is never blank.
    const created = await createSermon({
      title: local.title || "Untitled sermon",
      content: local.content,
      presentation: local.presentationSettings,
      notes: local.notes,
    });
    const doc = sermonToDocument(created, local);
    saveDocument(doc);
    return {
      doc,
      source: "server",
      sermons: [created],
    };
  } catch {
    saveDocument(local);
    return { doc: local, source: "local", sermons: [] };
  }
}
