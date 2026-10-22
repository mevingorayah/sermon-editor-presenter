/**
 * Preach ⚙ "Page" + "Spacing" controls ⇄ the sermon's saved page settings.
 *
 * ONE-FILE ADAPTER over Backend #29: PresentationSettings.page
 * { format, orientation, textSizePt, lineSpacing, paragraphSpacingPt, margins }.
 * The UI and page view only talk to this file; if field names change, edit here.
 */
import type { FitPageSpecSettings, CustomPageSettings, CalibratedMargins, CalibratedSnapshot, PresentationSettings, SermonContent, SermonPageSettings } from "@/types/document";
import { buildCalibratedSnapshot } from "@/lib/calibration";
import { marginMaxIn } from "@/lib/sermon/export/margins";
import { pageSpecFromSnapshot } from "@/lib/sermon/export/pngLayout";
import { PAGE_LIMITS, clamp, customPageError, fitScreenLabel, pageSnapshotFields, pageSpecFromTarget, type PageFormat, type PageOrientation } from "@/lib/sermon/export/frames";

export type { PageFormat, PageOrientation };

export interface PageChoice {
  format: PageFormat;
  orientation: PageOrientation;
  textSizePt: number;
  lineSpacing: number;
  paragraphSpacingPt: number;
  /** Inches per side. */
  margins: { top: number; right: number; bottom: number; left: number };
  /** format "custom": the saved size (kept, not editable in Preach). */
  custom?: CustomPageSettings;
  /** format "fit-screen": the last measured usable viewport, CSS px. */
  fit?: FitPageSpecSettings;
}

export const LIMITS = PAGE_LIMITS;

/**
 * Page picker (UX spec, 22 Oct): "Fit this screen", then Print and Screen groups,
 * each with a Portrait/Landscape toggle. No device presets.
 * "Fit this screen" saves format "fit-screen" + pageSpec {kind:"fit"} (CSS px).
 * Legal and custom are not offered, but stay shown/selected when already set.
 */
export interface FormatButton { key: string; label: string; format?: PageFormat; pending?: boolean }
export const FIT_BUTTON: FormatButton = { key: "fit", label: "Fit this screen", format: "fit-screen" };
export const FORMAT_GROUPS: Array<{ label: string; items: FormatButton[] }> = [
  { label: "Print", items: [
    { key: "a4", label: "A4", format: "a4" },
    { key: "a5", label: "A5", format: "a5" },
    { key: "letter", label: "Letter", format: "letter" },
    { key: "half-letter", label: "½ Letter", format: "half-letter" },
  ] },
  { label: "Screen", items: [
    { key: "4-3", label: "4:3", format: "4:3" },
    { key: "16-10", label: "16:10", format: "16:10" },
    { key: "16-9", label: "16:9", format: "16:9" },
  ] },
];
export const FORMAT_BUTTONS = [FIT_BUTTON, ...FORMAT_GROUPS.flatMap((g) => g.items)].filter(
  (b): b is FormatButton & { format: PageFormat } => Boolean(b.format),
);

const NATURAL: Record<PageFormat, PageOrientation> = {
  a4: "portrait", a5: "portrait", letter: "portrait", "half-letter": "portrait", legal: "portrait",
  "4:3": "landscape", "16:9": "landscape", "16:10": "landscape", custom: "portrait", "fit-screen": "portrait",
};
/** Extra button shown only when the sermon already uses it (legal / custom). */
export function extraButton(c: PageChoice): FormatButton | null {
  if (c.format === "legal") return { key: "legal", label: "Legal", format: "legal" };
  if (c.format === "custom") return { key: "custom", label: "Custom size", format: "custom" };
  return null;
}
/** Message for an invalid saved custom size (Backend rejects these). */
export function customError(c: PageChoice): string | null {
  return c.format === "custom" && c.custom ? customPageError(c.custom) : null;
}
export const naturalOrientation = (f: PageFormat) => NATURAL[f];

/** "0.8in" / "20mm" / 0.8 → inches. */
export function toInches(v: unknown, fallback = PAGE_LIMITS.marginIn.default): number {
  if (typeof v === "number") return v;
  const m = /^\s*([\d.]+)\s*(in|mm|cm|pt)?\s*$/.exec(String(v ?? ""));
  if (!m) return fallback;
  const n = Number(m[1]);
  return m[2] === "mm" ? n / 25.4 : m[2] === "cm" ? n / 2.54 : m[2] === "pt" ? n / 72 : n;
}

export function fromSettings(ps: Pick<PresentationSettings, "calibrationTarget"> & { page?: SermonPageSettings }): PageChoice {
  const p = ps.page ?? {};
  const legacy = pageSpecFromTarget(String(ps.calibrationTarget));
  const m = p.margins;
  const fmt = formatOf(p, legacy);
  const max = marginMax({ ...fmt, target: String(ps.calibrationTarget) });
  const clampMargin = (n: number) => Math.min(max, clamp(n, PAGE_LIMITS.marginIn));
  return {
    ...fmt,
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

/** Margin slider max for this page: min(2 in, 20 % of the shorter side). */
export function marginMax(c: Pick<PageChoice, "format" | "orientation" | "custom" | "fit"> & { target?: string }): number {
  const page: SermonPageSettings = {
    format: c.format,
    orientation: c.orientation,
    ...(c.format === "custom" && c.custom ? { custom: c.custom } : {}),
    ...(c.format === "fit-screen" && c.fit ? { pageSpec: { ...c.fit, orientation: c.orientation } } : {}),
  } as SermonPageSettings;
  try {
    const f = pageSnapshotFields(page as Parameters<typeof pageSnapshotFields>[0]);
    return marginMaxIn(pageSpecFromSnapshot({ target: (c.target ?? "screen-16-9") as never, ...(f as object) }) as never);
  } catch {
    return PAGE_LIMITS.marginIn.max;
  }
}

function formatOf(p: SermonPageSettings, legacy: { format: PageFormat; orientation: PageOrientation }) {
  const f = p.format as string | undefined;
  if (f === "tablet") return { format: "4:3" as PageFormat, orientation: "landscape" as PageOrientation };
  if (p.pageSpec?.kind === "fit")
    return { format: "fit-screen" as PageFormat, fit: p.pageSpec, orientation: p.pageSpec.orientation ?? p.orientation ?? deviceOrientation(p.pageSpec.width, p.pageSpec.height) };
  if (f === "custom" && p.custom) return { format: "custom" as PageFormat, custom: p.custom, orientation: p.orientation ?? legacy.orientation };
  if (!f || f === "custom" || f === "fit-screen") return { format: legacy.format, orientation: p.orientation ?? legacy.orientation };
  return { format: f as PageFormat, orientation: p.orientation ?? legacy.orientation };
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
    ...(c.format === "custom" && c.custom ? { custom: c.custom } : {}),
    ...(c.format === "fit-screen" && c.fit ? { pageSpec: { ...c.fit, orientation: c.orientation } } : {}),
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
  // #29's own mapper: page settings → export snapshot fields.
  const page = toPatch(fromSettings(ps)).page!;
  const f = pageSnapshotFields(page as Parameters<typeof pageSnapshotFields>[0]);
  return { ...base, ...(f as Partial<CalibratedSnapshot>) };
}


export function deviceOrientation(vw: number, vh: number): PageOrientation {
  return vh > vw ? "portrait" : "landscape";
}

/** "Fit this screen": the usable viewport in CSS px (Backend clamps to its limits). */
export function fitChoice(c: PageChoice, vw: number, vh: number, dpr?: number): PageChoice {
  const width = Math.round(vw);
  const height = Math.round(vh);
  const orientation = deviceOrientation(width, height);
  return { ...c, format: "fit-screen", orientation, custom: undefined, fit: { kind: "fit", width, height, orientation, ...(dpr ? { dpr } : {}) } };
}

/** Export dialog label, e.g. "Fit this screen (1320×2112, 10:16)" (#29's fitScreenLabel). */
export function fitLabel(c: PageChoice): string | null {
  return c.format === "fit-screen" && c.fit ? fitScreenLabel({ ...c.fit, orientation: c.orientation }) : null;
}
