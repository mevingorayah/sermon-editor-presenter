import type {
  CalibratedSnapshot,
  ExportFormat,
} from "@/types/document";
import { exportFormatSchema, exportRequestSchema } from "../schema";

export interface ParsedExportRequest {
  snapshot: CalibratedSnapshot;
  format: ExportFormat;
  filenameStem?: string;
  includeNotes: boolean;
  notes?: string;
  resolvedColors?: { accent: string };
  exportTheme?: "light" | "dark";
}

/**
 * Normalize Frontend POST bodies into snapshot + format + slice-2 options.
 * Default format is docx when the request does not specify one.
 * Query `?format=` wins over body.format when provided and valid.
 */
export function parseExportRequest(
  body: unknown,
  searchParams?: URLSearchParams,
): ParsedExportRequest {
  const parsed = exportRequestSchema.parse(body);

  const queryRaw = searchParams?.get("format");
  let formatFromQuery: ExportFormat | undefined;
  if (queryRaw != null && queryRaw !== "") {
    const q = exportFormatSchema.safeParse(queryRaw);
    if (!q.success) {
      throw Object.assign(
        new Error(
          `Invalid format "${queryRaw}". Expected one of: docx, pdf, png, pptx.`,
        ),
        { status: 400, code: "INVALID_FORMAT" },
      );
    }
    formatFromQuery = q.data;
  }

  if ("snapshot" in parsed) {
    return {
      snapshot: parsed.snapshot as CalibratedSnapshot,
      format: formatFromQuery ?? parsed.format ?? "docx",
      filenameStem: parsed.filenameStem,
      includeNotes: parsed.includeNotes === true,
      notes: parsed.notes,
      resolvedColors: parsed.resolvedColors,
      exportTheme: parsed.exportTheme,
    };
  }

  const {
    format,
    filenameStem,
    includeNotes,
    notes,
    resolvedColors,
    exportTheme,
    ...rest
  } = parsed;

  return {
    snapshot: rest as CalibratedSnapshot,
    format: formatFromQuery ?? format ?? "docx",
    filenameStem,
    includeNotes: includeNotes === true,
    notes,
    resolvedColors,
    exportTheme,
  };
}
