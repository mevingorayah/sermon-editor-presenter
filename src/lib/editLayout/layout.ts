/**
 * Edit layout (UI UX spec "Edit layout PR"): page size for the Edit canvas,
 * fit-to-space scale, and the persisted panel states. Layout only: nothing
 * here reads or writes sermon content.
 */
import type { PresentationSettings, SermonPageSettings } from "@/types/document";
import { fromSettings } from "@/lib/reading/pageSettings";
import { frameSizeInches, type PageInput } from "@/lib/sermon/export/frames";

/** CSS px per inch (96 dpi, same as the Preach page view). */
export const CSS_PX_PER_IN = 96;

export interface EditPageBox {
  widthPx: number;
  heightPx: number;
  /** Page margins in CSS px (from the sermon's page settings). */
  margins: { top: number; right: number; bottom: number; left: number };
}

/** The sermon's chosen page (size + orientation) as a CSS-px box. */
export function editPageBox(
  ps: Pick<PresentationSettings, "calibrationTarget"> & { page?: SermonPageSettings },
): EditPageBox {
  const c = fromSettings(ps);
  const input: PageInput =
    c.format === "fit-screen" && c.fit
      ? { kind: "fit", width: c.fit.width, height: c.fit.height, orientation: c.orientation }
      : ({ format: c.format, orientation: c.orientation, ...(c.custom ? { custom: c.custom } : {}) } as PageInput);
  const { width, height } = frameSizeInches(input);
  const px = (n: number) => Math.round(n * CSS_PX_PER_IN);
  return {
    widthPx: px(width),
    heightPx: px(height),
    margins: { top: px(c.margins.top), right: px(c.margins.right), bottom: px(c.margins.bottom), left: px(c.margins.left) },
  };
}

/** Floating chrome sizes (px), from the spec. */
export const LAYOUT = {
  inset: 12,
  palette: 56,
  paletteCollapsed: 44,
  formatting: 280,
  /** Block tools column beside the page (drag handle, move, delete…). */
  blockGutter: 56,
} as const;

/**
 * Scale that fits the page into the band left between the floating panels.
 * Never above 1 (the page is never drawn bigger than its real size).
 */
export function fitScale(pageWidthPx: number, availablePx: number): number {
  if (!(pageWidthPx > 0) || !(availablePx > 0)) return 1;
  return Math.max(0.1, Math.min(1, availablePx / pageWidthPx));
}

export const PANEL_KEYS = {
  left: "sermon-editor-presenter:edit-left-panel:v1",
  leftTab: "sermon-editor-presenter:edit-left-tab:v1",
  blocks: "sermon-editor-presenter:edit-blocks-palette:v1",
  formatting: "sermon-editor-presenter:edit-formatting-panel:v1",
} as const;

export type LeftTab = "sermons" | "outline" | "find";
export const LEFT_TABS: LeftTab[] = ["sermons", "outline", "find"];

/** Left panel: saved state wins; otherwise expanded at ≥1280 px, collapsed below. */
export function initialLeftOpen(saved: string | null, viewportWidth: number): boolean {
  if (saved === "expanded") return true;
  if (saved === "collapsed") return false;
  return viewportWidth >= 1280;
}

export function readFlag(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Formatting becomes a bottom sheet below 1024 px or on a portrait tablet. */
export const SHEET_MQ = "(max-width: 1023.98px), (orientation: portrait) and (pointer: coarse)";
