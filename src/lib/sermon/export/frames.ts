/**
 * Single source of truth for page geometry (pure, client-safe).
 * Preach's page view, the Calibrate preview, and the PNG, PPTX, DOCX and PDF
 * exports all take their page size from here.
 *
 * A page is { format, orientation, textSizePt }. Legacy target strings
 * ("screen-16-9", "paper-a4", "tablet-portrait" …) still work everywhere a
 * `PageInput` is accepted; `pageSpecFromTarget` maps them.
 */

export const PAGE_FORMATS = ["a4", "letter", "half-letter", "tablet", "16:9", "16:10"] as const;
export type PageFormat = (typeof PAGE_FORMATS)[number];
export const PAGE_ORIENTATIONS = ["portrait", "landscape"] as const;
export type PageOrientation = (typeof PAGE_ORIENTATIONS)[number];

/** UI UX (#23): text is never smaller than 24 pt on a page. */
export const MIN_TEXT_PT = 24;

/** Page-setting limits (PM, final). Values outside are clamped, never rejected. */
export const PAGE_LIMITS = {
  textSizePt: { min: 24, max: 72, step: 2, default: 28 },
  lineSpacing: { min: 1.2, max: 2.0, step: 0.05, default: 1.55 },
  paragraphSpacingPt: { min: 0, max: 48, step: 2, default: 20 },
  marginIn: { min: 0.25, max: 2, default: 0.8 },
} as const;

export const clamp = (v: unknown, lim: { min: number; max: number; default: number }): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(lim.max, Math.max(lim.min, n)) : lim.default;
};

export interface PageSpec {
  format: PageFormat;
  orientation: PageOrientation;
  /** Body text size in points; clamped to 24–72. Default 28. */
  textSizePt?: number;
}

/** Either a full spec or a legacy target string. */
export type PageInput = PageSpec | string;

/** Natural (portrait-or-native) geometry per format: px and inches across the short/long sides. */
const FORMATS: Record<PageFormat, { shortPx: number; longPx: number; shortIn: number; natural: PageOrientation }> = {
  "16:9": { shortPx: 1080, longPx: 1920, shortIn: 7.5, natural: "landscape" }, // 13.333in slide
  "16:10": { shortPx: 1000, longPx: 1600, shortIn: 6.25, natural: "landscape" }, // 10in slide
  tablet: { shortPx: 900, longPx: 1200, shortIn: 9.25, natural: "portrait" }, // Galaxy Tab S10 Lite
  letter: { shortPx: 1275, longPx: 1650, shortIn: 8.5, natural: "portrait" },
  a4: { shortPx: 1240, longPx: 1754, shortIn: 8.27, natural: "portrait" },
  "half-letter": { shortPx: 825, longPx: 1275, shortIn: 5.5, natural: "portrait" },
};

/** Legacy target string → page spec. Unknown strings fall back to 16:9. */
export function pageSpecFromTarget(target: string): PageSpec {
  switch (target) {
    case "screen-16-10": return { format: "16:10", orientation: "landscape" };
    case "tablet-portrait": return { format: "tablet", orientation: "portrait" };
    case "tablet-landscape": return { format: "tablet", orientation: "landscape" };
    case "paper-letter": return { format: "letter", orientation: "portrait" };
    case "paper-a4": return { format: "a4", orientation: "portrait" };
    case "paper-half-letter": return { format: "half-letter", orientation: "portrait" };
    case "screen-16-9":
    default: return { format: "16:9", orientation: "landscape" };
  }
}

/** Normalize any PageInput into a complete spec (text size clamped). */
export function resolvePage(input: PageInput): Required<PageSpec> {
  const s = typeof input === "string" ? pageSpecFromTarget(input) : input;
  const format: PageFormat = (PAGE_FORMATS as readonly string[]).includes(s.format) ? s.format : "16:9";
  const orientation: PageOrientation = s.orientation === "portrait" || s.orientation === "landscape"
    ? s.orientation
    : FORMATS[format].natural;
  return { format, orientation, textSizePt: clamp(s.textSizePt, PAGE_LIMITS.textSizePt) };
}

export function isPaperPage(input: PageInput): boolean {
  const f = resolvePage(input).format;
  return f === "a4" || f === "letter" || f === "half-letter";
}

/** Frame size in px (PNG pixels; also the layout coordinate space). */
export function pngFrameSize(input: PageInput): { width: number; height: number } {
  const { format, orientation } = resolvePage(input);
  const g = FORMATS[format];
  return orientation === "portrait"
    ? { width: g.shortPx, height: g.longPx }
    : { width: g.longPx, height: g.shortPx };
}

/** Frame size in inches; the long side follows the pixel aspect exactly. */
export function frameSizeInches(input: PageInput): { width: number; height: number } {
  const { format, orientation } = resolvePage(input);
  const g = FORMATS[format];
  const longIn = +((g.shortIn * g.longPx) / g.shortPx).toFixed(3);
  return orientation === "portrait"
    ? { width: g.shortIn, height: longIn }
    : { width: longIn, height: g.shortIn };
}

/**
 * Frame width in inches (slide/paper geometry) used for pt → px:
 * 16:9 13.333in (1pt = 2px), 16:10 10in, tablet 9.25in upright, Letter 8.5in,
 * A4 8.27in, half-Letter 5.5in; landscape uses the long side.
 */
export function pngFrameWidthInches(input: PageInput): number {
  return frameSizeInches(input).width;
}

/** Frame px per inch (same in both orientations). */
export function pxPerInch(input: PageInput): number {
  return pngFrameSize(input).width / pngFrameWidthInches(input);
}

/** Frame px per typographic point (1/72 in). */
export function pxPerPt(input: PageInput): number {
  return pxPerInch(input) / 72;
}

/** Every format × orientation (for tests and pickers). */
export function allPageSpecs(): PageSpec[] {
  return PAGE_FORMATS.flatMap((format) => PAGE_ORIENTATIONS.map((orientation) => ({ format, orientation })));
}
