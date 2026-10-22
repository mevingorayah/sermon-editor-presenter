/**
 * Single source of truth for page geometry (pure, client-safe).
 * Preach's page view, the Calibrate preview, and the PNG, PPTX, DOCX and PDF
 * exports all take their page size from here.
 *
 * A page is { format, orientation, textSizePt }. Legacy target strings
 * ("screen-16-9", "paper-a4", "tablet-portrait" …) still work everywhere a
 * `PageInput` is accepted; `pageSpecFromTarget` maps them.
 */

export const PAGE_FORMATS = ["a4", "a5", "letter", "half-letter", "legal", "4:3", "16:10", "16:9", "custom", "fit-screen"] as const;
/** Formats with fixed geometry (everything except "custom"). */
export const PRESET_PAGE_FORMATS = ["a4", "a5", "letter", "half-letter", "legal", "4:3", "16:10", "16:9"] as const;
/** Print presets (the rest of PRESET_PAGE_FORMATS are screen shapes). */
export const PAPER_PAGE_FORMATS = ["a4", "a5", "letter", "half-letter", "legal"] as const;
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

/**
 * Frontend's fit-to-screen page: the last measured CSS px of the device
 * (`dpr` optional and ignored). Treated as custom px at 96 dpi, clamped to
 * the custom limits (never rejected for size). Orientation follows rotation.
 */
export interface FitPageSpec {
  kind: "fit";
  width: number;
  height: number;
  orientation?: PageOrientation;
  dpr?: number;
  textSizePt?: number;
}

/** New sermons start on A4 portrait. */
export const DEFAULT_PAGE = { format: "a4", orientation: "portrait" } as const;

/**
 * Picker label for a fit page: "Fit this screen (1320×2112, 10:16)".
 * Sides are the measured CSS px (rounded), ordered to match `orientation`
 * when given; the ratio is reduced by their greatest common divisor, with
 * 8:5 / 5:8 written the way screens are sold (16:10 / 10:16).
 */
export function fitScreenLabel(spec: { width: number; height: number; orientation?: PageOrientation }): string {
  let w = Math.max(1, Math.round(Number(spec.width) || 0));
  let h = Math.max(1, Math.round(Number(spec.height) || 0));
  if ((spec.orientation === "portrait" && w > h) || (spec.orientation === "landscape" && h > w)) [w, h] = [h, w];
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  let [rw, rh] = [w / g, h / g];
  if ((rw === 8 && rh === 5) || (rw === 5 && rh === 8)) [rw, rh] = [rw * 2, rh * 2];
  return `Fit this screen (${w}\u00d7${h}, ${rw}:${rh})`;
}

/** Fit spec → custom px at 96 dpi. */
export function fitToCustom(f: { width: number; height: number }): CustomPageSize {
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 192);
  return { width: n(f.width), height: n(f.height), unit: "px", dpi: 96 };
}

/** A normalized page: `custom` is present only for format "custom". */
export type ResolvedPage = Required<Omit<PageSpec, "custom">> & { custom?: CustomPageSize };

/** Either a full spec or a legacy target string. */
export type PageInput = PageSpec | FitPageSpec | string;

/** Natural (portrait-or-native) geometry per format: px and inches across the short/long sides. */
const FORMATS: Record<PresetPageFormat, { shortPx: number; longPx: number; shortIn: number; natural: PageOrientation }> = {
  "16:9": { shortPx: 1080, longPx: 1920, shortIn: 7.5, natural: "landscape" }, // 13.333in slide
  "16:10": { shortPx: 1000, longPx: 1600, shortIn: 6.25, natural: "landscape" }, // 10in slide
  "4:3": { shortPx: 1200, longPx: 1600, shortIn: 7.5, natural: "landscape" }, // 10in slide
  letter: { shortPx: 1275, longPx: 1650, shortIn: 8.5, natural: "portrait" },
  legal: { shortPx: 1275, longPx: 2100, shortIn: 8.5, natural: "portrait" }, // 8.5 × 14in
  a4: { shortPx: 1240, longPx: 1754, shortIn: 8.27, natural: "portrait" },
  a5: { shortPx: 874, longPx: 1240, shortIn: 5.83, natural: "portrait" }, // 148 × 210mm
  "half-letter": { shortPx: 825, longPx: 1275, shortIn: 5.5, natural: "portrait" },
};

/** Legacy target string → page spec. Unknown strings fall back to 16:9. */
export function pageSpecFromTarget(target: string): PageSpec {
  switch (target) {
    case "screen-16-10": return { format: "16:10", orientation: "landscape" };
    // Old tablet presets (any of them) migrate to 4:3 landscape.
    case "tablet":
    case "tablet-portrait":
    case "tablet-landscape":
    case "screen-4-3": return { format: "4:3", orientation: "landscape" };
    case "paper-a5": return { format: "a5", orientation: "portrait" };
    case "paper-legal": return { format: "legal", orientation: "portrait" };
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
/**
 * Largest text size a page allows (UX rule): 48 pt on the small papers
 * (A5, half-letter), 72 pt on everything else (A4, Letter, legal, screen
 * shapes, fit-screen and custom). Text sizes are clamped to it everywhere.
 */
export function maxTextSizePt(format: string | undefined): number {
  return format === "a5" || format === "half-letter" ? 48 : PAGE_LIMITS.textSizePt.max;
}

export function resolvePage(input: PageInput): ResolvedPage {
  const s0 = typeof input === "string" ? pageSpecFromTarget(input) : input;
  const s: PageSpec = "kind" in s0
    ? { format: "fit-screen", orientation: s0.orientation as PageOrientation, textSizePt: s0.textSizePt, custom: fitToCustom(s0) }
    : (s0.format as string) === "tablet"
      ? { ...s0, format: "4:3", orientation: "landscape" } // legacy tablet preset → 4:3 landscape
      : s0;
  let format: PageFormat = (PAGE_FORMATS as readonly string[]).includes(s.format) ? s.format : "16:9";
  // "custom" without a usable size falls back to 16:9.
  if (format === "fit-screen") format = s.custom ? "custom" : "16:9";
  if (format === "custom" && !(s.custom && (CUSTOM_UNITS as readonly string[]).includes(s.custom.unit))) format = "16:9";
  const natural = format === "custom" ? customGeometry(s.custom!).natural : FORMATS[format].natural;
  const orientation: PageOrientation = s.orientation === "portrait" || s.orientation === "landscape"
    ? s.orientation
    : natural;
  const textSizePt = clamp(s.textSizePt, { ...PAGE_LIMITS.textSizePt, max: maxTextSizePt(format) });
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
  const g = FORMATS[p.format as PresetPageFormat];
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
  return (PAPER_PAGE_FORMATS as readonly string[]).includes(f);
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
 * 16:9 13.333in (1pt = 2px), 16:10 10in, 4:3 10in, Letter/Legal 8.5in, A5 5.83in,
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
  pageSpec?: FitPageSpec;
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
    ...(page.pageSpec?.kind === "fit"
      ? { pageFormat: "fit-screen", pageSpec: { ...page.pageSpec }, ...(page.pageSpec.orientation ? { orientation: page.pageSpec.orientation } : {}) }
      : {}),
    textSizePt: clamp(page.textSizePt, { ...PAGE_LIMITS.textSizePt, max: maxTextSizePt(page.pageSpec?.kind === "fit" ? "fit-screen" : page.format) }),
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
