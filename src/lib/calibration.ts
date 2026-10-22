import type {
  CalibrationTarget,
  CalibratedMargins,
  CalibratedSnapshot,
  LineHeightOption,
  ReadingTheme,
  SermonContent,
  TypeScaleStep,
} from "@/types/document";
import { toSemanticBlocks } from "@/lib/semanticBlocks";

export interface TargetMeta {
  id: CalibrationTarget;
  label: string;
  kind: "screen" | "paper";
  /** CSS aspect-ratio for live preview frame */
  aspect: string;
  /** Approx preview width in px for the frame */
  previewWidth: number;
}

export const CALIBRATION_TARGETS: TargetMeta[] = [
  { id: "screen-16-9", label: "Screen 16:9", kind: "screen", aspect: "16 / 9", previewWidth: 420 },
  { id: "screen-16-10", label: "Screen 16:10", kind: "screen", aspect: "16 / 10", previewWidth: 420 },
  { id: "screen-4-3", label: "Screen 4:3", kind: "screen", aspect: "4 / 3", previewWidth: 400 },
  { id: "paper-letter", label: "Paper Letter", kind: "paper", aspect: "8.5 / 11", previewWidth: 300 },
  { id: "paper-a4", label: "Paper A4", kind: "paper", aspect: "210 / 297", previewWidth: 300 },
  { id: "paper-a5", label: "Paper A5", kind: "paper", aspect: "148 / 210", previewWidth: 260 },
  { id: "paper-legal", label: "Paper Legal", kind: "paper", aspect: "8.5 / 14", previewWidth: 260 },
  { id: "paper-half-letter", label: "Half letter", kind: "paper", aspect: "5.5 / 8.5", previewWidth: 260 },
];

/** Margins: 0.8in on every side, every format (PM limits: 0.25–2in). */
export function marginsFor(target: CalibrationTarget): CalibratedMargins {
  void target;
  return { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" };
}

export function buildCalibratedSnapshot(opts: {
  target: CalibrationTarget;
  typeScaleStep: TypeScaleStep;
  lineHeight: LineHeightOption;
  theme: ReadingTheme;
  content: SermonContent;
}): CalibratedSnapshot {
  return {
    target: opts.target,
    margins: marginsFor(opts.target),
    typeScaleStep: opts.typeScaleStep,
    lineHeight: opts.lineHeight,
    theme: opts.theme,
    flattenGradient: true,
    bionic: false,
    semanticBlocks: toSemanticBlocks(opts.content),
    content: opts.content,
  };
}

/** Multiply rem base by 0.9^n (negative) or 1.1^n (positive). */
export function typeScaleMultiplier(step: number): number {
  if (step === 0) return 1;
  if (step < 0) return Math.pow(0.9, Math.abs(step));
  return Math.pow(1.1, step);
}
