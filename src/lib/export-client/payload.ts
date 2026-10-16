import type {
  CalibratedSnapshot,
  ExportFormat,
  ExportRequestOptions,
} from "@/types/document";
import { sanitizeFilenameStem } from "@/lib/sermon/export/filename";
import {
  flattenContentColors,
  resolveEditAccentHex,
  toHex,
  type CssVarResolver,
} from "./flattenColors";

export { sanitizeFilenameStem };

export const EXPORT_FORMATS: ReadonlyArray<{
  id: ExportFormat;
  label: string;
  ext: string;
  /** Study notes are appended only for DOCX/PDF (contract). */
  notes: boolean;
  /** Print formats always use light ink. */
  print: boolean;
}> = [
  { id: "docx", label: "Export DOCX", ext: "docx", notes: true, print: true },
  { id: "pdf", label: "Export PDF", ext: "pdf", notes: true, print: true },
  { id: "png", label: "Export image (PNG)", ext: "png", notes: false, print: false },
  { id: "pptx", label: "Export PowerPoint (PPTX)", ext: "pptx", notes: false, print: false },
];

export function formatMeta(format: ExportFormat) {
  return EXPORT_FORMATS.find((f) => f.id === format)!;
}

/** Default Save-as stem: sermon title sanitized (`Joy Without Ceasing` → `Joy-Without-Ceasing`). */
export function defaultFilenameStem(title: string | null | undefined): string {
  return sanitizeFilenameStem(title);
}

/** Client-side filename when the server omits Content-Disposition. */
export function fallbackFilename(stem: string, format: ExportFormat): string {
  return `${sanitizeFilenameStem(stem)}.${formatMeta(format).ext}`;
}

export type ExportPayload = CalibratedSnapshot & ExportRequestOptions;

export interface BuildExportPayloadInput {
  snapshot: CalibratedSnapshot;
  format: ExportFormat;
  filenameStem: string;
  includeNotes: boolean;
  notes: string;
  resolveVar?: CssVarResolver;
  /** Explicit accent override (normalized to hex; ignored if not a color). */
  accentHex?: string;
}

/**
 * Build the POST /api/export body: calibrated snapshot + slice 2 extras.
 * - content color marks flattened to hex (copy only)
 * - bionic false / flattenGradient true (enforced again here)
 * - DOCX/PDF: light ink; notes only when opted in
 */
export function buildExportPayload(input: BuildExportPayloadInput): ExportPayload {
  const meta = formatMeta(input.format);
  const withNotes = meta.notes && input.includeNotes;
  const payload: ExportPayload = {
    ...input.snapshot,
    theme: meta.print ? "light" : input.snapshot.theme,
    flattenGradient: true,
    bionic: false,
    content: flattenContentColors(input.snapshot.content, {
      resolveVar: input.resolveVar,
    }),
    format: input.format,
    filenameStem: input.filenameStem,
    includeNotes: withNotes,
    // Read --edit-accent at export time; always hex (fallback #5c4a1f).
    resolvedColors: {
      accent: toHex(input.accentHex) ?? resolveEditAccentHex(input.resolveVar),
    },
  };
  if (withNotes) payload.notes = input.notes;
  return payload;
}

/** Parse `Content-Disposition` (RFC 5987 `filename*` wins over `filename`). */
export function filenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) return null;

  const encoded = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fall through to the regular filename parameter when decoding fails.
    }
  }

  const plain = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  return (plain?.[1] ?? plain?.[2])?.trim() || null;
}
