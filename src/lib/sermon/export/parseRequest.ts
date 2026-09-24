import type { CalibratedSnapshot } from "@/types/document";
import type { ExportFormat } from "../types";
import { exportRequestSchema } from "../schema";

export interface ParsedExportRequest {
  snapshot: CalibratedSnapshot;
  format: ExportFormat;
}

/**
 * Normalize Frontend POST bodies into snapshot + format.
 * Default format is docx (CalibrationPanel does not yet send format).
 * Query `?format=pdf|docx` wins over body.format when provided.
 */
export function parseExportRequest(
  body: unknown,
  searchParams?: URLSearchParams,
): ParsedExportRequest {
  const parsed = exportRequestSchema.parse(body);
  const queryFormat = searchParams?.get("format");
  const formatFromQuery =
    queryFormat === "docx" || queryFormat === "pdf" ? queryFormat : undefined;

  if ("snapshot" in parsed) {
    return {
      snapshot: parsed.snapshot as CalibratedSnapshot,
      format: formatFromQuery ?? parsed.format ?? "docx",
    };
  }

  const { format, ...rest } = parsed;
  return {
    snapshot: rest as CalibratedSnapshot,
    format: formatFromQuery ?? format ?? "docx",
  };
}
