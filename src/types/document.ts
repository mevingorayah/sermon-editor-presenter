import type { JSONContent } from "@tiptap/react";

/** TipTap document JSON — content only, no presentation chrome. */
export type SermonContent = JSONContent;

export type ReadingTheme = "light" | "dark";
export type LineHeightOption = 1.55 | 1.7 | 1.85;
export type TypeScaleStep = -2 | -1 | 0 | 1 | 2;

export type CalibrationTarget =
  | "screen-16-9"
  | "screen-16-10"
  | "tablet-portrait"
  | "paper-letter"
  | "paper-a4"
  | "paper-half-letter";

export interface PresentationSettings {
  theme: ReadingTheme;
  typeScaleStep: TypeScaleStep;
  lineHeight: LineHeightOption;
  bionic: boolean;
  /** Calibration / export preview target */
  calibrationTarget: CalibrationTarget;
}

export interface SermonDocument {
  id: string;
  title: string;
  updatedAt: string;
  content: SermonContent;
  presentationSettings: PresentationSettings;
  /** Free-form study notes (edit chrome only) */
  notes: string;
  /**
   * Block builder: per-block-type default style/spacing
   * (see `src/lib/sermon/blockStyle.ts`). Missing = app defaults.
   */
  globalStyles?: import("@/lib/sermon/blockStyle").GlobalStyles;
}

export type SemanticBlockType =
  | "Title"
  | "H1"
  | "H2"
  | "Body"
  | "Scripture"
  | "Caption";

export interface SemanticBlock {
  type: SemanticBlockType;
  text: string;
  citation?: string;
}

export interface CalibratedMargins {
  top: string;
  right: string;
  bottom: string;
  left: string;
  binderGutter?: string;
}

/**
 * Backend export contract — Frontend POSTs this shape to /api/export
 * (plus optional ExportRequestOptions for slice 2).
 * DOCX/PDF/PNG/PPTX generation is owned by Backend.
 */
export interface CalibratedSnapshot {
  target: CalibrationTarget | string;
  margins: CalibratedMargins;
  typeScaleStep: number; // -2..2
  lineHeight: LineHeightOption;
  theme: ReadingTheme; // print default light
  flattenGradient: true;
  bionic: false; // never in export
  semanticBlocks: SemanticBlock[];
  content: SermonContent;
}

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  theme: "dark",
  typeScaleStep: 0,
  lineHeight: 1.7,
  bionic: false,
  calibrationTarget: "screen-16-9",
};

export const STORAGE_KEY = "sermon-editor-presenter:document:v1";

/** Slice 2 export formats (query ?format= still wins over body). */
export type ExportFormat = "docx" | "pdf" | "png" | "pptx";

/**
 * Optional fields accepted on POST /api/export alongside CalibratedSnapshot.
 * Not persisted on the sermon document.
 */
export interface ExportRequestOptions {
  format?: ExportFormat;
  /** Sanitized for Content-Disposition; empty → sermon-export */
  filenameStem?: string;
  /** Default false. When true, append study notes in DOCX/PDF only. */
  includeNotes?: boolean;
  /** Study notes text used when includeNotes is true. */
  notes?: string;
  /** Concrete accent for workers (e.g. PPTX/PNG chrome). */
  resolvedColors?: { accent: string };
}
