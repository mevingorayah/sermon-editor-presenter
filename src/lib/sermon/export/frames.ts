/**
 * Single source of truth for page geometry (pure, client-safe).
 * Preach's page view, the Calibrate preview, and the PNG, PPTX, DOCX and PDF
 * exports all take their page size from here.
 *
 * A page is { format, orientation, textSizePt }. Legacy target strings
 * ("screen-16-9", "paper-a4", "tablet-portrait" …) still work everywhere a
 * `PageInput` is accepted; `pageSpecFromTarget` maps them.
 */

export const PAGE_FORMATS = ["a4", "letter", "half-letter", "tablet", "16:9", "16:10", "custom"] as const;
/** Formats with fixed geometry (everything except "custom"). */
export const PRESET_PAGE_FORMATS = ["a4", "letter", "half-letter", "tablet", "16:9", "16:10"] as const;
export type PresetPageFormat = (typeof PRESET_PAGE_FORMATS)[number];
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

export const CUSTOM_UNITS = ["in", "mm", "cm", "px"] as const;
export type CustomPageUnit = (typeof CUSTOM_UNITS)[number];

/** A user-chosen screen or paper size (`format: "custom"`). */
export interface CustomPageSize {
  /** Width in `unit` as the user typed it (before any orientation swap). */
  width: number;
  /** Height in `unit`. */
  height: number;
  unit: CustomPageUnit;
  /** Only for unit "px": pixels per inch of the target screen (72–600, default 96). */
  dpi?: number;
}

/**
 * Custom-size limits (Mevin's rule: adapt to ANY screen or paper). Each side
 * 2–60 in after unit conversion; long side at most 4× the short side.
 * The schema rejects values outside; `resolvePage` clamps defensively.
 */
export const CUSTOM_PAGE_LIMITS = {
  sideIn: { min: 2, max: 60 },
  maxAspect: 4,
  dpi: { min: 72, max: 600, default: 96 },
  /** Layout/PNG resolution: 150 px/in, lowered so the long side stays ≤ 4800 px. */
  pxPerIn: 150,
  maxLongPx: 4800,
} as const;

const UNIT_IN: Record<Exclude<CustomPageUnit, "px">, number> = { in: 1, mm: 1 / 25.4, cm: 1 / 2.54 };

/** Convert a custom size to inches (no clamping). */
export function customSizeToInches(c: CustomPageSize): { width: number; height: number } {
  const per = c.unit === "px"
    ? 1 / (Number.isFinite(c.dpi) && (c.dpi as number) > 0 ? (c.dpi as number) : CUSTOM_PAGE_LIMITS.dpi.default)
    : UNIT_IN[c.unit] ?? 1;
  return { width: Number(c.width) * per, height: Number(c.height) * per };
}

/** Why a custom size is invalid, or null when it is within limits. */
export function customPageError(c: CustomPageSize): string | null {
  if (!(CUSTOM_UNITS as readonly string[]).includes(c.unit)) return "unit must be in, mm, cm or px";
  if (c.unit === "px" && c.dpi !== undefined
    && !(c.dpi >= CUSTOM_PAGE_LIMITS.dpi.min && c.dpi <= CUSTOM_PAGE_LIMITS.dpi.max)) return "dpi must be 72–600";
  const { width, height } = customSizeToInches(c);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return "width and height must be numbers";
  const { min, max } = CUSTOM_PAGE_LIMITS.sideIn;
  if (width < min - 1e-9 || height < min - 1e-9 || width > max + 1e-9 || height > max + 1e-9)
    return `each side must be ${min}–${max} in`;
  if (Math.max(width, height) / Math.min(width, height) > CUSTOM_PAGE_LIMITS.maxAspect + 1e-9)
    return `aspect ratio must be at most 1:${CUSTOM_PAGE_LIMITS.maxAspect}`;
  return null;
}

/** Custom size → clamped short/long inches (sides 2–60, aspect ≤ 1:4) and its natural orientation. */
function customGeometry(c: CustomPageSize): { shortIn: number; longIn: number; natural: PageOrientation } {
  const { width, height } = customSizeToInches(c);
  const { min, max } = CUSTOM_PAGE_LIMITS.sideIn;
  const side = (v: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
  const w = side(width), h = side(height);
  const natural: PageOrientation = w > h ? "landscape" : "portrait";
  const longIn = Math.max(w, h);
  let shortIn = Math.min(w, h);
  if (longIn / shortIn > CUSTOM_PAGE_LIMITS.maxAspect) shortIn = longIn / CUSTOM_PAGE_LIMITS.maxAspect;
  return { shortIn, longIn, natural };
}

export interface PageSpec {
  format: PageFormat;
  orientation: PageOrientation;
  /** Body text size in points; clamped to 24–72. Default 28. */
  textSizePt?: number;
  /** Required when `format` is "custom"; ignored otherwise. */
  custom?: CustomPageSize;
}

/** A normalized page: `custom` is present only for format "custom". */
export type ResolvedPage = Required<Omit<PageSpec, "custom">> & { custom?: CustomPageSize };

/** Either a full spec or a legacy target string. */
export type PageInput = PageSpec | string;

/** Natural (portrait-or-native) geometry per format: px and inches across the short/long sides. */
const FORMATS: Record<PresetPageFormat, { shortPx: number; longPx: number; shortIn: number; natural: PageOrientation }> = {
  "16:9": { shortPx: 1080, longPx: 1920, shortIn: 7.5, natural: "landscape" }, // 13.333in slide
  "16:10": { shortPx: 1000, longPx: 1600, shortIn: 6.25, natural: "landscape" }, // 10in slide
  tablet: { shortPx: 1200, longPx: 1600, shortIn: 9.25, natural: "landscape" }, // Galaxy Tab S10 Lite, 4:3
  letter: { shortPx: 1275, longPx: 1650, shortIn: 8.5, natural: "portrait" },
  a4: { shortPx: 1240, longPx: 1754, shortIn: 8.27, natural: "portrait" },
  "half-letter": { shortPx: 825, longPx: 1275, shortIn: 5.5, natural: "portrait" },
};

/** Legacy target string → page spec. Unknown strings fall back to 16:9. */
export function pageSpecFromTarget(target: string): PageSpec {
  switch (target) {
    case "screen-16-10": return { format: "16:10", orientation: "landscape" };
    case "tablet": return { format: "tablet", orientation: "landscape" };
    case "tablet-portrait": return { format: "tablet", orientation: "portrait" };
    case "tablet-landscape": return { format: "tablet", orientation: "landscape" };
    case "paper-letter": return { format: "letter", orientation: "portrait" };
    case "paper-a4": return { format: "a4", orientation: "portrait" };
    case "paper-half-letter": return { format: "half-letter", orientation: "portrait" };
    case "screen-16-9":
    default: return { format: "16:9", orientation: "landscape" };
  }
}

/** Line spacing to lay out with: `lineSpacing` (preferred) or legacy `lineHeight`, clamped 1.2–2.0 on a 0.05 grid. */
export function snapshotLineSpacing(s: { lineSpacing?: number; lineHeight?: number | string }): number {
  const v = clamp(s.lineSpacing ?? s.lineHeight, PAGE_LIMITS.lineSpacing);
  return Math.round(v / 0.05) * 0.05 > PAGE_LIMITS.lineSpacing.max
    ? PAGE_LIMITS.lineSpacing.max
    : Number((Math.round(v / 0.05) * 0.05).toFixed(2));
}

/** Normalize any PageInput into a complete spec (text size clamped). */
export function resolvePage(input: PageInput): ResolvedPage {
  const s = typeof input === "string" ? pageSpecFromTarget(input) : input;
  let format: PageFormat = (PAGE_FORMATS as readonly string[]).includes(s.format) ? s.format : "16:9";
  // "custom" without a usable size falls back to 16:9.
  if (format === "custom" && !(s.custom && (CUSTOM_UNITS as readonly string[]).includes(s.custom.unit))) format = "16:9";
  const natural = format === "custom" ? customGeometry(s.custom!).natural : FORMATS[format].natural;
  const orientation: PageOrientation = s.orientation === "portrait" || s.orientation === "landscape"
    ? s.orientation
    : natural;
  const textSizePt = clamp(s.textSizePt, PAGE_LIMITS.textSizePt);
  return format === "custom"
    ? { format, orientation, textSizePt, custom: { ...s.custom! } }
    : { format, orientation, textSizePt };
}

/** Short/long sides in px and inches for any resolved page. */
function geometry(p: ResolvedPage): { shortPx: number; longPx: number; shortIn: number; longIn: number } {
  if (p.format === "custom") {
    const { shortIn, longIn } = customGeometry(p.custom!);
    const ppi = Math.min(CUSTOM_PAGE_LIMITS.pxPerIn, CUSTOM_PAGE_LIMITS.maxLongPx / longIn);
    const shortPx = Math.round(shortIn * ppi);
    const longPx = Math.round(longIn * ppi);
    // Inches follow the rounded pixel aspect exactly, as for presets.
    return { shortPx, longPx, shortIn: +shortIn.toFixed(3), longIn: +((shortIn * longPx) / shortPx).toFixed(3) };
  }
  const g = FORMATS[p.format];
  return { ...g, longIn: +((g.shortIn * g.longPx) / g.shortPx).toFixed(3) };
}

/**
 * Everything a renderer (Preach page view, Calibrate preview, every export)
 * needs about a page: px frame, inches, px per pt, and whether it is paper.
 */
export function pageGeometry(input: PageInput): {
  widthPx: number; heightPx: number; widthIn: number; heightIn: number; pxPerPt: number; aspect: number; paper: boolean;
} {
  const { width: widthPx, height: heightPx } = pngFrameSize(input);
  const { width: widthIn, height: heightIn } = frameSizeInches(input);
  return { widthPx, heightPx, widthIn, heightIn, pxPerPt: pxPerPt(input), aspect: widthPx / heightPx, paper: isPaperPage(input) };
}

export function isPaperPage(input: PageInput): boolean {
  const p = resolvePage(input);
  const f = p.format;
  if (f === "custom") return p.custom!.unit !== "px";
  return f === "a4" || f === "letter" || f === "half-letter";
}

/** Frame size in px (PNG pixels; also the layout coordinate space). */
export function pngFrameSize(input: PageInput): { width: number; height: number } {
  const p = resolvePage(input);
  const g = geometry(p);
  return p.orientation === "portrait"
    ? { width: g.shortPx, height: g.longPx }
    : { width: g.longPx, height: g.shortPx };
}

/** Frame size in inches; the long side follows the pixel aspect exactly. */
export function frameSizeInches(input: PageInput): { width: number; height: number } {
  const p = resolvePage(input);
  const g = geometry(p);
  return p.orientation === "portrait"
    ? { width: g.shortIn, height: g.longIn }
    : { width: g.longIn, height: g.shortIn };
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

/** Every preset format × orientation (for tests and pickers; custom sizes are open-ended). */
export function allPageSpecs(): PageSpec[] {
  return PRESET_PAGE_FORMATS.flatMap((format) => PAGE_ORIENTATIONS.map((orientation) => ({ format, orientation })));
}

/**
 * PresentationSettings.page → snapshot fields. `page.margins` (top/right/
 * bottom/left, inches, 0.25–2, default 0.8) → `snapshot.margins`;
 * `page.lineSpacing` (1.2–2.0, step 0.05, default 1.55) → `snapshot.lineSpacing`
 * (and legacy `lineHeight`). Every export reads these through pngLayout.
 */
export function pageSnapshotFields(page: {
  format?: string;
  orientation?: string;
  textSizePt?: number;
  lineSpacing?: number;
  paragraphSpacingPt?: number;
  custom?: CustomPageSize;
  margins?: { top?: string; right?: string; bottom?: string; left?: string; binderGutter?: string };
} = {}) {
  const m = (v: string | undefined) => {
    const n = v === undefined ? NaN : parseFloat(String(v));
    return `${clamp(Number.isFinite(n) ? n : undefined, PAGE_LIMITS.marginIn)}in`;
  };
  const lineSpacing = snapshotLineSpacing({ lineSpacing: page.lineSpacing });
  return {
    ...(page.format ? { pageFormat: page.format } : {}),
    ...(page.orientation ? { orientation: page.orientation } : {}),
    ...(page.format === "custom" && page.custom ? { customPage: { ...page.custom } } : {}),
    textSizePt: clamp(page.textSizePt, PAGE_LIMITS.textSizePt),
    paragraphSpacingPt: clamp(page.paragraphSpacingPt, PAGE_LIMITS.paragraphSpacingPt),
    lineSpacing,
    lineHeight: lineSpacing,
    margins: {
      top: m(page.margins?.top),
      right: m(page.margins?.right),
      bottom: m(page.margins?.bottom),
      left: m(page.margins?.left),
      ...(page.margins?.binderGutter ? { binderGutter: page.margins.binderGutter } : {}),
    },
  };
}
