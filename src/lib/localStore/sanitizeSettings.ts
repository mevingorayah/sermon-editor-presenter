import { PAGE_FORMATS, PAGE_ORIENTATIONS } from "@/lib/sermon/export/frames";
import type { PresentationSettings, SermonPageSettings } from "@/types/document";
import { clampBionicStrength, DEFAULT_BIONIC_STRENGTH } from "@/lib/bionic";

/**
 * Load-time sanitizer + migration for presentation.page.
 *
 * - Missing `page` stays missing (old files keep using calibrationTarget).
 * - format "tablet" → 4:3 landscape (same as the schema / frames).
 * - Unknown format or orientation fields are dropped, not replaced with A4
 *   (so an old file is not silently restyled).
 * - New sermons get A4 portrait from blankSermon / DEFAULT_PRESENTATION_SETTINGS,
 *   not from this function.
 * - Non-object values are returned as-is so file-schema validation can still
 *   reject a damaged backup.
 */
export function sanitizePageSettings(raw: unknown): SermonPageSettings | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const p: SermonPageSettings = { ...(raw as SermonPageSettings) };
  const format = (p as { format?: unknown }).format;
  if (format === "tablet") {
    p.format = "4:3";
    p.orientation = "landscape";
  } else if (format !== undefined && !(PAGE_FORMATS as readonly string[]).includes(String(format))) {
    delete p.format;
  }
  if (p.orientation !== undefined && !(PAGE_ORIENTATIONS as readonly string[]).includes(p.orientation)) {
    delete p.orientation;
  }
  return p;
}

export function sanitizePresentationSettings(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const s = { ...(raw as PresentationSettings) };
  if ("page" in s) {
    const page = sanitizePageSettings((s as { page?: unknown }).page);
    if (page === undefined) delete (s as { page?: unknown }).page;
    else s.page = page;
  }
  s.bionicStrength = clampBionicStrength(
    (s as { bionicStrength?: unknown }).bionicStrength,
    DEFAULT_BIONIC_STRENGTH,
  );
  return s;
}
