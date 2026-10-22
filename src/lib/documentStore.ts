"use client";

import type { JSONContent } from "@tiptap/react";
import type { SermonDocument, PresentationSettings } from "@/types/document";
import { createSeedDocument } from "@/lib/seed";
import {
  ACTIVE_ID_KEY,
  getActiveId,
  readLibrary,
  writeLibrary,
  setActiveDoc,
} from "@/lib/localStore/browserCache";

export { ACTIVE_ID_KEY };

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

export function getActiveSermonId(): string | null {
  return getActiveId();
}

/**
 * The active sermon from the browser copy (sync). Edit refreshes it from the
 * Sermons folder after mount; Preach shows exactly this, as before.
 */
export function loadDocument(): SermonDocument {
  if (typeof window === "undefined") return createSeedDocument();
  const lib = readLibrary();
  const active = getActiveId();
  const docs = Object.values(lib).map((e) => e.doc);
  const doc =
    (active && lib[active]?.doc) ||
    docs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ||
    null;
  if (doc) return doc;
  const seed = createSeedDocument();
  saveDocument(seed);
  return seed;
}

/**
 * Write the browser copy of a sermon and mark it for the folder.
 * Throws on quota so callers can say so; never pretends.
 */
export function saveDocument(doc: SermonDocument): void {
  if (typeof window === "undefined") return;
  const lib = readLibrary();
  const prev = lib[doc.id];
  lib[doc.id] = { doc, savedAt: prev?.savedAt ?? null, fileName: prev?.fileName, dirty: true };
  writeLibrary(lib);
  setActiveDoc(doc);
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
  try {
    saveDocument(next);
  } catch {
    /* storage full: the change still applies on screen */
  }
  return next;
}

/** Preach entry point: active sermon from local storage only. */
export async function resolveActiveDocument(): Promise<{ doc: SermonDocument }> {
  return { doc: loadDocument() };
}
