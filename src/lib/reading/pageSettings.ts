/**
 * Preach ⚙ "Page" + "Spacing" controls ⇄ the sermon's saved page settings.
 *
 * ONE-FILE ADAPTER over Backend #29: PresentationSettings.page
 * { format, orientation, textSizePt, lineSpacing, paragraphSpacingPt, margins }.
 * The UI and page view only talk to this file; if field names change, edit here.
 */
import type { CalibratedMargins, CalibratedSnapshot, PresentationSettings, SermonContent, SermonPageSettings } from "@/types/document";
import { buildCalibratedSnapshot } from "@/lib/calibration";
import { PAGE_LIMITS, clamp, pageSpecFromTarget, type PageFormat, type PageOrientation } from "@/lib/sermon/export/frames";

export type { PageFormat, PageOrientation };

export interface PageChoice {
  format: PageFormat;
  orientation: PageOrientation;
  textSizePt: number;
  lineSpacing: number;
  paragraphSpacingPt: number;
  /** Inches per side. */
  margins: { top: number; right: number; bottom: number; left: number };
}

export const LIMITS = PAGE_LIMITS;

/** Format buttons (UI UX): the Galaxy Tab appears as upright and sideways. */
export const FORMAT_BUTTONS: Array<{ key: string; label: string; format: PageFormat; orientation?: PageOrientation }> = [
  { key: "a4", label: "A4", format: "a4" },
  { key: "letter", label: "Letter", format: "letter" },
  { key: "half-letter", label: "½ Letter", format: "half-letter" },
  { key: "tab-upright", label: "Galaxy Tab, upright", format: "tablet", orientation: "portrait" },
  { key: "tab-sideways", label: "Galaxy Tab, sideways", format: "tablet", orientation: "landscape" },
  { key: "16-9", label: "16:9", format: "16:9" },
  { key: "16-10", label: "16:10", format: "16:10" },
];

const NATURAL: Record<PageFormat, PageOrientation> = {
  a4: "portrait", letter: "portrait", "half-letter": "portrait", tablet: "landscape", "16:9": "landscape", "16:10": "landscape",
};
export const naturalOrientation = (f: PageFormat) => NATURAL[f];

/** "0.8in" / "20mm" / 0.8 → inches. */
export function toInches(v: unknown, fallback = PAGE_LIMITS.marginIn.default): number {
  if (typeof v === "number") return v;
  const m = /^\s*([\d.]+)\s*(in|mm|cm|pt)?\s*$/.exec(String(v ?? ""));
  if (!m) return fallback;
  const n = Number(m[1]);
  return m[2] === "mm" ? n / 25.4 : m[2] === "cm" ? n / 2.54 : m[2] === "pt" ? n / 72 : n;
}
const clampMargin = (n: number) => clamp(n, PAGE_LIMITS.marginIn);

export function fromSettings(ps: Pick<PresentationSettings, "calibrationTarget"> & { page?: SermonPageSettings }): PageChoice {
  const p = ps.page ?? {};
  const legacy = pageSpecFromTarget(String(ps.calibrationTarget));
  const m = p.margins;
  return {
    format: p.format ?? legacy.format,
    orientation: p.orientation ?? legacy.orientation,
    textSizePt: clamp(p.textSizePt, PAGE_LIMITS.textSizePt),
    lineSpacing: clamp(p.lineSpacing, PAGE_LIMITS.lineSpacing),
    paragraphSpacingPt: clamp(p.paragraphSpacingPt, PAGE_LIMITS.paragraphSpacingPt),
    margins: {
      top: clampMargin(toInches(m?.top)),
      right: clampMargin(toInches(m?.right)),
      bottom: clampMargin(toInches(m?.bottom)),
      left: clampMargin(toInches(m?.left)),
    },
  };
}

export function marginsCss(m: PageChoice["margins"]): CalibratedMargins {
  const f = (n: number) => `${+n.toFixed(3)}in`;
  return { top: f(m.top), right: f(m.right), bottom: f(m.bottom), left: f(m.left) };
}

/** The patch to save on the sermon (Edit, Document setup and exports read the same field). */
export function toPatch(c: PageChoice): Partial<PresentationSettings> {
  const page: SermonPageSettings = {
    format: c.format,
    orientation: c.orientation,
    textSizePt: clamp(c.textSizePt, PAGE_LIMITS.textSizePt),
    lineSpacing: clamp(c.lineSpacing, PAGE_LIMITS.lineSpacing),
    paragraphSpacingPt: clamp(c.paragraphSpacingPt, PAGE_LIMITS.paragraphSpacingPt),
    margins: marginsCss(c.margins),
  };
  return { page };
}

/** "Reset to default": Spacing only (keeps format and orientation). */
export function resetSpacing(c: PageChoice): PageChoice {
  const d = PAGE_LIMITS.marginIn.default;
  return {
    ...c,
    textSizePt: PAGE_LIMITS.textSizePt.default,
    lineSpacing: PAGE_LIMITS.lineSpacing.default,
    paragraphSpacingPt: PAGE_LIMITS.paragraphSpacingPt.default,
    margins: { top: d, right: d, bottom: d, left: d },
  };
}

export function stepTextSize(c: PageChoice, dir: 1 | -1): PageChoice {
  const L = PAGE_LIMITS.textSizePt;
  return { ...c, textSizePt: clamp(c.textSizePt + dir * L.step, L) };
}

/** Snapshot for page view: the same one Export lays out. */
export function snapshotFor(content: SermonContent, ps: PresentationSettings): CalibratedSnapshot {
  const base = buildCalibratedSnapshot({
    target: ps.calibrationTarget,
    typeScaleStep: ps.typeScaleStep,
    lineHeight: ps.lineHeight,
    theme: ps.theme,
    content,
  });
  return withPage(base, ps);
}

/**
 * Overlay the sermon's page settings on a snapshot, in #29's export-request shape:
 * margins as CSS strings ("0.8in"), line spacing carried as `lineHeight`.
 */
export function withPage(
  base: CalibratedSnapshot,
  ps: Pick<PresentationSettings, "calibrationTarget"> & { page?: SermonPageSettings },
): CalibratedSnapshot {
  const c = fromSettings(ps);
  return {
    ...base,
    margins: marginsCss(c.margins),
    lineHeight: c.lineSpacing,
    pageFormat: c.format,
    orientation: c.orientation,
    textSizePt: c.textSizePt,
    paragraphSpacingPt: c.paragraphSpacingPt,
  };
}

/** Device default: Galaxy Tab sideways on a tablet-sized touch screen. */
export function deviceDefaultFormat(vw: number, vh: number, touch: boolean): PageFormat | null {
  return touch && Math.min(vw, vh) >= 600 ? "tablet" : null;
}

export function deviceOrientation(vw: number, vh: number): PageOrientation {
  return vh > vw ? "portrait" : "landscape";
}
