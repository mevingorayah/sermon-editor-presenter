"use client";

import type { SermonDocument, PresentationSettings } from "@/types/document";
import { STORAGE_KEY } from "@/types/document";
import { createSeedDocument } from "@/lib/seed";

export function loadDocument(): SermonDocument {
  if (typeof window === "undefined") {
    return createSeedDocument();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedDocument();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as SermonDocument;
    if (!parsed?.content || !parsed.presentationSettings) {
      const seed = createSeedDocument();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    const seed = createSeedDocument();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
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
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
