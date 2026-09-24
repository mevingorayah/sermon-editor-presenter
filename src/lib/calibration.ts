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
  { id: "tablet-portrait", label: "Tablet portrait", kind: "screen", aspect: "3 / 4", previewWidth: 280 },
  { id: "paper-letter", label: "Paper Letter", kind: "paper", aspect: "8.5 / 11", previewWidth: 300 },
  { id: "paper-a4", label: "Paper A4", kind: "paper", aspect: "210 / 297", previewWidth: 300 },
  { id: "paper-half-letter", label: "Half letter", kind: "paper", aspect: "5.5 / 8.5", previewWidth: 260 },
];

/** Margins: screen 5%; paper 0.75in; binder gutter +0.25in on paper. */
export function marginsFor(target: CalibrationTarget): CalibratedMargins {
  const meta = CALIBRATION_TARGETS.find((t) => t.id === target);
  if (!meta || meta.kind === "screen") {
    return { top: "5%", right: "5%", bottom: "5%", left: "5%" };
  }
  return {
    top: "0.75in",
    right: "0.75in",
    bottom: "0.75in",
    left: "0.75in",
    binderGutter: "0.25in",
  };
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
