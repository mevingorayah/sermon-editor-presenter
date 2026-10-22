import type { ExportFormat, ReadingTheme } from "@/types/document";

/**
 * Export "Light or dark" choice → Backend export request.
 *
 * Adapter: the only place that knows how Backend names the field
 * (`exportTheme`, Backend PR #29). The legacy `theme` field is untouched. Theme changes colours only, never layout.
 */
export const EXPORT_THEME_FIELD = "exportTheme" as const;

export type ExportTheme = ReadingTheme; // "light" | "dark"

/** Formats the Light/Dark choice applies to. DOCX always prints light. */
export function exportThemeApplies(format: ExportFormat): boolean {
  return format === "pdf" || format === "png" || format === "pptx";
}

/** Default choice when the export window opens: Light (PDF defaults Light). */
export const DEFAULT_EXPORT_THEME: ExportTheme = "light";

export function exportThemeFields(
  format: ExportFormat,
  choice: ExportTheme,
): Record<typeof EXPORT_THEME_FIELD, ExportTheme> {
  return { [EXPORT_THEME_FIELD]: exportThemeApplies(format) ? choice : "light" };
}
