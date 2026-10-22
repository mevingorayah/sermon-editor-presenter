/**
 * Server persistence types for sermons.
 * Export contract lives in `@/types/document` (`CalibratedSnapshot`) — do not fork it.
 */

import type {
  CalibratedSnapshot,
  PresentationSettings,
  SermonContent,
} from "@/types/document";
import type { GlobalStyles } from "./blockStyle";

export type {
  CalibratedSnapshot,
  CalibrationTarget,
  CalibratedMargins,
  ExportFormat,
  ExportRequestOptions,
  LineHeightOption,
  PresentationSettings,
  ReadingTheme,
  SemanticBlock,
  SemanticBlockType,
  SermonContent,
  TypeScaleStep,
} from "@/types/document";

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
  /** Block builder: per-block-type default style/spacing. Missing = app defaults. */
  globalStyles?: GlobalStyles;
}

export interface CreateSermonInput {
  /** Optional client-chosen UUID for same-id restore. */
  id?: string;
  title?: string;
  content?: SermonContent;
  presentation?: PresentationSettings;
  notes?: string;
  globalStyles?: GlobalStyles;
}

export interface UpdateSermonInput {
  title?: string;
  content?: SermonContent;
  presentation?: PresentationSettings | null;
  notes?: string | null;
  /** `null` removes globalStyles. */
  globalStyles?: GlobalStyles | null;
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

export type {
  BlockAlign,
  BlockFontId,
  BlockSpacing,
  BlockStyle,
  BlockType,
  GlobalBlockStyle,
  GlobalStyles,
} from "./blockStyle";
