import type { CalibratedMargins, CalibrationTarget } from "@/types/document";
import { PAGE_LIMITS, clamp, isPaperPage, pngFrameWidthInches, type PageInput } from "./frames";

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

/** Page width in inches: the shared frame geometry (frames.ts). */
export function pageWidthInchesFor(target: PageInput): number {
  return pngFrameWidthInches(target);
}

/** Default margins: 0.8 in on every side, every format (no percentages). */
export const DEFAULT_MARGINS: CalibratedMargins = { top: "0.8in", right: "0.8in", bottom: "0.8in", left: "0.8in" };

export function resolveMargins(
  margins: CalibratedMargins,
  target: PageInput,
): ResolvedMarginsInches {
  const width = pageWidthInchesFor(target);
  // Every side is 0.25–2 in on every format (PM limits); legacy % values are
  // converted against the page width, then clamped.
  const side = (raw: string) => clamp(parseLengthToInches(raw, width), PAGE_LIMITS.marginIn);
  return {
    top: side(margins.top),
    right: side(margins.right),
    bottom: side(margins.bottom),
    left: side(margins.left),
    binderGutter: margins.binderGutter
      ? parseLengthToInches(margins.binderGutter, width)
      : 0,
  };
}

export function isPaperTarget(target: PageInput): boolean {
  return isPaperPage(target);
}

export type { CalibrationTarget };
