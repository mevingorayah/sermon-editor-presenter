import type { CalibratedSnapshot, ExportFormat } from "@/types/document";
import { buildDocx } from "./docx";
import { buildPdf } from "./pdf";
import { buildPng } from "./png";
import { buildPptx } from "./pptx";
import { filenameWithExt, sanitizeFilenameStem } from "./filename";
import { titleTextFromSnapshot } from "./contentWalk";

export interface ExportOptions {
  filenameStem?: string;
  includeNotes?: boolean;
  notes?: string;
  resolvedColors?: { accent: string };
}

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function resolveStem(
  snapshot: CalibratedSnapshot,
  filenameStem?: string,
): string {
  if (filenameStem !== undefined) {
    return sanitizeFilenameStem(filenameStem);
  }
  // Derive from title when Frontend omits stem (legacy callers).
  return sanitizeFilenameStem(titleTextFromSnapshot(snapshot));
}

export async function exportSnapshot(
  snapshot: CalibratedSnapshot,
  format: ExportFormat,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const stem = resolveStem(snapshot, options.filenameStem);
  const workerOpts = {
    includeNotes: options.includeNotes === true,
    notes: options.notes,
    resolvedColors: options.resolvedColors,
  };

  if (format === "docx") {
    const buffer = await buildDocx(snapshot, workerOpts);
    return {
      buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: filenameWithExt(stem, "docx"),
    };
  }

  if (format === "pdf") {
    const buffer = await buildPdf(snapshot, workerOpts);
    return {
      buffer,
      contentType: "application/pdf",
      filename: filenameWithExt(stem, "pdf"),
    };
  }

  if (format === "png") {
    // includeNotes ignored for PNG (slice 2).
    const buffer = await buildPng(snapshot, {
      resolvedColors: options.resolvedColors,
    });
    return {
      buffer,
      contentType: "image/png",
      filename: filenameWithExt(stem, "png"),
    };
  }

  if (format === "pptx") {
    const buffer = await buildPptx(snapshot, {
      resolvedColors: options.resolvedColors,
    });
    return {
      buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      filename: filenameWithExt(stem, "pptx"),
    };
  }

  const _exhaustive: never = format;
  void _exhaustive;
  throw Object.assign(new Error(`Unsupported format: ${format}`), {
    status: 400,
    code: "INVALID_FORMAT",
  });
}

export { buildDocx, buildPdf, buildPng, buildPptx };
export { sanitizeFilenameStem, filenameWithExt } from "./filename";
