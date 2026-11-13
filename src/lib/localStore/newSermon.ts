import { DEFAULT_PRESENTATION_SETTINGS, type PresentationSettings, type SermonDocument } from "@/types/document";
import { newSermonId } from "./browserCache";

/**
 * Page a new sermon starts on: A4 Portrait (UI UX spec; was the old server
 * store default before #16 moved storage to this browser/folder).
 * "paper-a4" is the A4 portrait (210 × 297) target in this data model.
 */
export const NEW_SERMON_PAGE: PresentationSettings["calibrationTarget"] = "paper-a4";

/**
 * A new, empty sermon. Reading preferences (theme, size, Bionic…) may be
 * carried over from the open sermon; the page always starts as A4 Portrait.
 * Existing sermons are never touched by this.
 */
export function blankSermon(
  carry?: PresentationSettings,
  now: Date = new Date(),
  id: string = newSermonId(),
): SermonDocument {
  return {
    id,
    title: "Untitled sermon",
    updatedAt: now.toISOString(),
    content: { type: "doc", content: [{ type: "title", content: [] }] },
    presentationSettings: {
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...(carry ?? {}),
      calibrationTarget: NEW_SERMON_PAGE,
      // Always A4 portrait for a new sermon; reading prefs (theme, size…) may still carry.
      page: { format: "a4", orientation: "portrait" },
    },
    notes: "",
  };
}
