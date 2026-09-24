/**
 * Server persistence types for sermons.
 * Export contract lives in `@/types/document` (`CalibratedSnapshot`) — do not fork it.
 */

import type {
  CalibratedSnapshot,
  PresentationSettings,
  SermonContent,
} from "@/types/document";

export type {
  CalibratedSnapshot,
  CalibrationTarget,
  CalibratedMargins,
  LineHeightOption,
  PresentationSettings,
  ReadingTheme,
  SemanticBlock,
  SemanticBlockType,
  SermonContent,
  TypeScaleStep,
} from "@/types/document";

export type ExportFormat = "docx" | "pdf";

export interface SermonMeta {
  title: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Persisted sermon on the server.
 * Content stays separate from presentation settings (presentation optional).
 */
export interface Sermon {
  id: string;
  meta: SermonMeta;
  /** TipTap document JSON (content only). */
  content: SermonContent;
  /** Optional client presentation prefs (may include bionic for editor). */
  presentation?: PresentationSettings;
  notes?: string;
}

export interface CreateSermonInput {
  title?: string;
  content?: SermonContent;
  presentation?: PresentationSettings;
  notes?: string;
}

export interface UpdateSermonInput {
  title?: string;
  content?: SermonContent;
  presentation?: PresentationSettings | null;
  notes?: string | null;
}

export interface UpdateContentInput {
  /** TipTap document JSON (preferred autosave payload). */
  content?: SermonContent;
  /** Alias accepted for TipTap document JSON. */
  document?: SermonContent;
  title?: string;
}

/** Re-export for callers that already imported from this module. */
export type ExportSnapshot = CalibratedSnapshot;
