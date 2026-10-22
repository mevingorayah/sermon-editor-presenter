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
  /**
   * Per-sermon page settings (optional; older sermons omit them and get the
   * defaults from `PAGE_LIMITS` in export/frames.ts).
   */
  page?: SermonPageSettings;
}

/** The sermon's own page: Preach and every export use it. */
export interface SermonPageSettings {
  format?: "a4" | "letter" | "half-letter" | "tablet" | "16:9" | "16:10";
  orientation?: "portrait" | "landscape";
  /** 24–72 pt, step 2, default 28. */
  textSizePt?: number;
  /** 1.2–2.0, step 0.05, default 1.55. */
  lineSpacing?: number;
  /** 0–48 pt, step 2, default 20. */
  paragraphSpacingPt?: number;
  /** Each side 0.25–2 in (e.g. "0.8in" or "20mm"); default 0.8in. */
  margins?: CalibratedMargins;
}

export interface SermonDocument {
  id: string;
  title: string;
  updatedAt: string;
  content: SermonContent;
  presentationSettings: PresentationSettings;
  /** Free-form study notes (edit chrome only) */
  notes: string;
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
  /** Legacy presets 1.55/1.7/1.85, or any 1.2–2.0 line spacing. */
  lineHeight: LineHeightOption | number;
  /** Page line spacing 1.2–2.0 (step 0.05, default 1.55); wins over `lineHeight`. */
  lineSpacing?: number;
  theme: ReadingTheme; // print default light
  /** Optional page overrides (win over `target`). */
  pageFormat?: SermonPageSettings["format"];
  orientation?: SermonPageSettings["orientation"];
  textSizePt?: number;
  paragraphSpacingPt?: number;
  flattenGradient: true;
  bionic: false; // never in export
  semanticBlocks: SemanticBlock[];
  content: SermonContent;
}

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  theme: "dark",
  typeScaleStep: 0,
  lineHeight: 1.55,
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
  /**
   * Colours for PDF/PNG/PPTX. Default: PDF light; PNG/PPTX follow the
   * snapshot theme. Never changes layout.
   */
  exportTheme?: "light" | "dark";
}
