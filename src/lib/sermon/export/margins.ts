import type { CalibratedMargins, CalibrationTarget } from "@/types/document";
import { PAGE_LIMITS, clamp, frameSizeInches, isPaperPage, pngFrameWidthInches, type PageInput } from "./frames";

/** Smallest text box (inches, each way) margins may leave on a page. */
export const MIN_CONTENT_IN = 1.5;

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

/**
 * UX ruling: a margin is at most min(2 in, 20 % of the page's shorter side),
 * in 0.05 in steps (half-Letter: 1.1 in). Preach clamps saved margins to it (pageSettings.fromSettings).
 */
export function marginMaxIn(target: PageInput): number {
  const { width, height } = frameSizeInches(target);
  const cap = Math.floor((0.2 * Math.min(width, height) + 1e-9) * 20) / 20;
  return Math.max(PAGE_LIMITS.marginIn.min, Math.min(PAGE_LIMITS.marginIn.max, cap));
}

export function resolveMargins(
  margins: CalibratedMargins,
  target: PageInput,
): ResolvedMarginsInches {
  const width = pageWidthInchesFor(target);
  // Every side is 0.25–2 in on every format (PM limits); legacy % values are
  // converted against the page width, then clamped.
  const side = (raw: string) => clamp(parseLengthToInches(raw, width), PAGE_LIMITS.marginIn);
  const out = {
    top: side(margins.top),
    right: side(margins.right),
    bottom: side(margins.bottom),
    left: side(margins.left),
    binderGutter: margins.binderGutter
      ? parseLengthToInches(margins.binderGutter, width)
      : 0,
  };
  // Small custom pages: shrink margins (never under 0.25 in) so the text box
  // keeps at least MIN_CONTENT_IN each way. Presets are never affected.
  const fit = (a: number, b: number, extra: number, total: number): [number, number] => {
    const room = total - MIN_CONTENT_IN - extra;
    if (a + b <= room) return [a, b];
    const lo = PAGE_LIMITS.marginIn.min;
    const k = Math.max(0, room - 2 * lo) / Math.max(1e-9, a + b - 2 * lo);
    return [lo + (a - lo) * k, lo + (b - lo) * k];
  };
  const height = frameSizeInches(target).height;
  [out.left, out.right] = fit(out.left, out.right, out.binderGutter, width);
  [out.top, out.bottom] = fit(out.top, out.bottom, 0, height);
  return out;
}

export function isPaperTarget(target: PageInput): boolean {
  return isPaperPage(target);
}

export type { CalibrationTarget };
