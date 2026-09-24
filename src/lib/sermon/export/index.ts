import type { CalibratedSnapshot } from "@/types/document";
import type { ExportFormat } from "../types";
import { buildDocx } from "./docx";
import { buildPdf } from "./pdf";

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function titleFromSnapshot(snapshot: CalibratedSnapshot): string {
  const titleBlock = snapshot.semanticBlocks.find((b) => b.type === "Title");
  return titleBlock?.text?.trim() || "sermon";
}

function safeFilename(title: string, ext: string): string {
  const stem =
    title
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "sermon";
  return `${stem}.${ext}`;
}

export async function exportSnapshot(
  snapshot: CalibratedSnapshot,
  format: ExportFormat,
): Promise<ExportResult> {
  const title = titleFromSnapshot(snapshot);
  if (format === "docx") {
    const buffer = await buildDocx(snapshot);
    return {
      buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: safeFilename(title, "docx"),
    };
  }

  const buffer = await buildPdf(snapshot);
  return {
    buffer,
    contentType: "application/pdf",
    filename: safeFilename(title, "pdf"),
  };
}

export { buildDocx, buildPdf };
