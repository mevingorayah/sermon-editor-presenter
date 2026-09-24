import type { CalibratedMargins, CalibrationTarget } from "@/types/document";

export interface ResolvedMarginsInches {
  top: number;
  right: number;
  bottom: number;
  left: number;
  binderGutter: number;
}

/** Parse CSS-like margin tokens ("0.75in", "5%", "12mm", bare number → inches). */
export function parseLengthToInches(
  raw: string,
  pageWidthInches: number,
): number {
  const s = raw.trim().toLowerCase();
  const pct = s.match(/^([\d.]+)\s*%$/);
  if (pct) {
    return (parseFloat(pct[1]) / 100) * pageWidthInches;
  }
  const inch = s.match(/^([\d.]+)\s*in$/);
  if (inch) return parseFloat(inch[1]);
  const mm = s.match(/^([\d.]+)\s*mm$/);
  if (mm) return parseFloat(mm[1]) / 25.4;
  const cm = s.match(/^([\d.]+)\s*cm$/);
  if (cm) return parseFloat(cm[1]) / 2.54;
  const pt = s.match(/^([\d.]+)\s*pt$/);
  if (pt) return parseFloat(pt[1]) / 72;
  const bare = s.match(/^([\d.]+)$/);
  if (bare) return parseFloat(bare[1]);
  return 0.75;
}

export function pageWidthInchesFor(target: string): number {
  switch (target) {
    case "paper-a4":
      return 8.27;
    case "paper-letter":
      return 8.5;
    case "paper-half-letter":
      return 5.5;
    case "tablet-portrait":
      return 8;
    case "screen-16-10":
      return 13.3;
    case "screen-16-9":
    default:
      return 13.3;
  }
}

export function resolveMargins(
  margins: CalibratedMargins,
  target: string,
): ResolvedMarginsInches {
  const width = pageWidthInchesFor(target);
  return {
    top: parseLengthToInches(margins.top, width),
    right: parseLengthToInches(margins.right, width),
    bottom: parseLengthToInches(margins.bottom, width),
    left: parseLengthToInches(margins.left, width),
    binderGutter: margins.binderGutter
      ? parseLengthToInches(margins.binderGutter, width)
      : 0,
  };
}

export function isPaperTarget(target: string): boolean {
  return target.startsWith("paper-");
}

export type { CalibrationTarget };
