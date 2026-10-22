/**
 * Preach ⚙ "Page" controls ⇄ the sermon's saved page settings.
 *
 * ONE-FILE ADAPTER: the UI speaks {format, orientation, textStep}; this file
 * maps that onto today's saved fields (presentation.calibrationTarget +
 * typeScaleStep). When backend lands separate format/orientation/text-size
 * fields, only `toPatch` / `fromSettings` / `bodyPt` change here.
 */
import type { CalibrationTarget, PresentationSettings, TypeScaleStep } from "@/types/document";
import { typeScaleMultiplier } from "@/lib/calibration";

export type PageFormat = "a4" | "letter" | "half-letter" | "tablet" | "16-9" | "16-10";
export type PageOrientation = "portrait" | "landscape";

export const PAGE_FORMATS: Array<{ id: PageFormat; label: string }> = [
  { id: "a4", label: "A4" },
  { id: "letter", label: "Letter" },
  { id: "half-letter", label: "½ Letter" },
  { id: "tablet", label: "Galaxy Tab" },
  { id: "16-9", label: "16:9" },
  { id: "16-10", label: "16:10" },
];

export interface PageChoice {
  format: PageFormat;
  orientation: PageOrientation;
  textStep: TypeScaleStep;
}

/** Orientations today's targets can express (others need backend's orientation field). */
export function orientationsFor(format: PageFormat): PageOrientation[] {
  switch (format) {
    case "tablet":
      return ["portrait", "landscape"];
    case "16-9":
    case "16-10":
      return ["landscape"];
    default:
      return ["portrait"];
  }
}

export function fromSettings(ps: Pick<PresentationSettings, "calibrationTarget" | "typeScaleStep">): PageChoice {
  const t = String(ps.calibrationTarget);
  const textStep = ps.typeScaleStep as TypeScaleStep;
  switch (t) {
    case "paper-a4": return { format: "a4", orientation: "portrait", textStep };
    case "paper-letter": return { format: "letter", orientation: "portrait", textStep };
    case "paper-half-letter": return { format: "half-letter", orientation: "portrait", textStep };
    case "tablet-portrait": return { format: "tablet", orientation: "portrait", textStep };
    case "screen-16-10":
      // Interim: Tab sideways shares the 16:10 frame; a local hint tells them apart.
      return { format: tabHint() ? "tablet" : "16-10", orientation: "landscape", textStep };
    default: return { format: "16-9", orientation: "landscape", textStep };
  }
}

/** Interim: Tablet landscape = the 16:10 frame (Galaxy Tab S10 Lite is 1920×1200). */
export function targetFor(format: PageFormat, orientation: PageOrientation): CalibrationTarget {
  switch (format) {
    case "a4": return "paper-a4" as CalibrationTarget;
    case "letter": return "paper-letter" as CalibrationTarget;
    case "half-letter": return "paper-half-letter" as CalibrationTarget;
    case "tablet": return (orientation === "portrait" ? "tablet-portrait" : "screen-16-10") as CalibrationTarget;
    case "16-10": return "screen-16-10" as CalibrationTarget;
    default: return "screen-16-9" as CalibrationTarget;
  }
}

const TAB_HINT_KEY = "sermon-editor-presenter:preach-tab-sideways:v1";
function tabHint(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(TAB_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function toPatch(c: PageChoice): Partial<PresentationSettings> {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(TAB_HINT_KEY, c.format === "tablet" ? "1" : "0");
  } catch {
    /* ignore */
  }
  const o = orientationsFor(c.format).includes(c.orientation) ? c.orientation : orientationsFor(c.format)[0];
  return { calibrationTarget: targetFor(c.format, o), typeScaleStep: c.textStep };
}

export const TEXT_STEPS: TypeScaleStep[] = [-2, -1, 0, 1, 2] as TypeScaleStep[];
export const MIN_BODY_PT = 24;
const BASE_BODY_PT = 24; // body text at step 0 (#23's minimum)

export function bodyPt(step: TypeScaleStep): number {
  return Math.round(BASE_BODY_PT * typeScaleMultiplier(step));
}

/** Steps a reader may pick: never below the 24 pt minimum. */
export function allowedSteps(): TypeScaleStep[] {
  return TEXT_STEPS.filter((s) => bodyPt(s) >= MIN_BODY_PT);
}

/** Format buttons as shown: the Tab appears twice (upright / sideways). */
export const FORMAT_BUTTONS: Array<{ key: string; label: string; format: PageFormat; orientation?: PageOrientation }> = [
  { key: "a4", label: "A4", format: "a4" },
  { key: "letter", label: "Letter", format: "letter" },
  { key: "half-letter", label: "½ Letter", format: "half-letter" },
  { key: "tab-upright", label: "Galaxy Tab, upright", format: "tablet", orientation: "portrait" },
  { key: "tab-sideways", label: "Galaxy Tab, sideways", format: "tablet", orientation: "landscape" },
  { key: "16-9", label: "16:9", format: "16-9" },
  { key: "16-10", label: "16:10", format: "16-10" },
];

/** Device default: Tablet on a tablet-sized touch screen. */
export function deviceDefaultFormat(vw: number, vh: number, touch: boolean): PageFormat | null {
  const short = Math.min(vw, vh);
  return touch && short >= 600 ? "tablet" : null;
}

export function deviceOrientation(vw: number, vh: number): PageOrientation {
  return vh > vw ? "portrait" : "landscape";
}
