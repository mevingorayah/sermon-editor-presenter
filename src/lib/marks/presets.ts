/**
 * Writing-tool presets shared by Edit (toolbar + schema renderHTML) and
 * Preach (renderSermon). Spec v2 §4.2, §4.4, §4.16a, AC PG2.
 */

export type FontGroup = "serif" | "sans" | "mono";

export interface FontDef {
  id: string;
  label: string;
  group: FontGroup;
  /** CSS custom property set by next/font in app/layout.tsx. */
  cssVar: string;
  fallback: string;
}

/** 5 serif + 5 sans (main picker) + JetBrains Mono (code only). */
export const FONTS: readonly FontDef[] = [
  { id: "lora", label: "Lora", group: "serif", cssVar: "--font-lora", fallback: "Georgia, serif" },
  { id: "merriweather", label: "Merriweather", group: "serif", cssVar: "--font-merriweather", fallback: "Georgia, serif" },
  { id: "playfair-display", label: "Playfair Display", group: "serif", cssVar: "--font-playfair", fallback: "Georgia, serif" },
  { id: "source-serif-4", label: "Source Serif 4", group: "serif", cssVar: "--font-source-serif", fallback: "Georgia, serif" },
  { id: "literata", label: "Literata", group: "serif", cssVar: "--font-literata", fallback: "Georgia, serif" },
  { id: "inter", label: "Inter", group: "sans", cssVar: "--font-inter", fallback: "Arial, sans-serif" },
  { id: "open-sans", label: "Open Sans", group: "sans", cssVar: "--font-open-sans", fallback: "Arial, sans-serif" },
  { id: "lato", label: "Lato", group: "sans", cssVar: "--font-lato", fallback: "Arial, sans-serif" },
  { id: "montserrat", label: "Montserrat", group: "sans", cssVar: "--font-montserrat", fallback: "Arial, sans-serif" },
  { id: "nunito-sans", label: "Nunito Sans", group: "sans", cssVar: "--font-nunito-sans", fallback: "Arial, sans-serif" },
  { id: "jetbrains-mono", label: "JetBrains Mono", group: "mono", cssVar: "--font-jetbrains-mono", fallback: "ui-monospace, monospace" },
];

const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]));

/**
 * Resolve a stored fontFamily value to a FontId. New files store the id;
 * old files stored CSS stacks (F3: serif/sans/mono → source-serif-4/inter/
 * jetbrains-mono). Returns null when the value is not one of ours.
 */
export function fontIdOf(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim().toLowerCase();
  if (FONT_BY_ID.has(v)) return v;
  for (const f of FONTS) if (v.includes(f.label.toLowerCase())) return f.id;
  if (v === "mono" || v.includes("monospace")) return "jetbrains-mono";
  if (v === "sans" || v.includes("system-ui") || v.includes("sans-serif")) return "inter";
  if (v === "serif" || v.includes("serif") || v.includes("georgia")) return "source-serif-4";
  return null;
}

/** CSS font-family for a stored value (unknown values pass through). */
export function fontFamilyCss(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const id = fontIdOf(value);
  const f = id ? FONT_BY_ID.get(id) : undefined;
  return f ? `var(${f.cssVar}), "${f.label}", ${f.fallback}` : value;
}

export interface ColorPreset {
  id: string;
  label: string;
  light: string;
  dark: string;
}

/** §4.2: all ≥4.5:1 on cream #f4f1ea (light) and on the dark stage (dark). */
export const TEXT_PRESETS: readonly ColorPreset[] = [
  { id: "ink", label: "Ink", light: "#1A1814", dark: "#F2EEE6" },
  { id: "crimson", label: "Crimson", light: "#A8201A", dark: "#FF8A80" },
  { id: "royal-blue", label: "Royal blue", light: "#1D4E89", dark: "#8AB4F8" },
  { id: "forest", label: "Forest", light: "#2E6B3A", dark: "#81C995" },
  { id: "gold", label: "Gold", light: "#8A5A00", dark: "#F6C453" },
  { id: "purple", label: "Purple", light: "#5B2A86", dark: "#C58AF9" },
];

/**
 * §4.2: 6 highlight colours. Dark variants are the light hue at ~35% over the
 * dark stage, pre-mixed to opaque hex so text contrast is measurable.
 */
export const HIGHLIGHT_PRESETS: readonly ColorPreset[] = [
  { id: "yellow", label: "Yellow", light: "#FFF176", dark: "#655F33" },
  { id: "green", label: "Green", light: "#C5E8B7", dark: "#515C4A" },
  { id: "blue", label: "Blue", light: "#BFDCF5", dark: "#4F5860" },
  { id: "pink", label: "Pink", light: "#F8C8DC", dark: "#635157" },
  { id: "orange", label: "Orange", light: "#FFD6A5", dark: "#655644" },
  { id: "lavender", label: "Lavender", light: "#DDD0F5", dark: "#595460" },
];

export function findPreset(
  list: readonly ColorPreset[],
  preset: unknown,
  color: unknown,
): ColorPreset | undefined {
  if (typeof preset === "string") {
    const p = list.find((x) => x.id === preset);
    if (p) return p;
  }
  if (typeof color === "string") {
    const c = color.toUpperCase();
    return list.find((x) => x.light === c);
  }
  return undefined;
}

/** §4.2 font sizes (pt). Body default is 18 pt. */
export const FONT_SIZES_PT = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48] as const;
export const BODY_PT = 18;
export const MIN_PT = 8;
export const MAX_PT = 96;

/** Parse a stored fontSize ("24pt", "24") to pt, or null. Legacy px kept as px. */
export function fontSizePt(value: unknown): number | null {
  if (typeof value === "number") return value >= MIN_PT && value <= MAX_PT ? value : null;
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(pt)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= MIN_PT && n <= MAX_PT ? n : null;
}

/**
 * CSS font-size for a stored pt value, relative to the body size via
 * `--doc-pt` (= body size / 18). Edit and Preach each set --doc-pt from their
 * own body size, so proportions match and Preach calibration scales all.
 */
export function fontSizeCss(value: unknown): string | null {
  const pt = fontSizePt(value);
  return pt === null ? null : `calc(var(--doc-pt, 1.3333px) * ${pt})`;
}

/** Normalise #RGB / #RRGGBB to #RRGGBB uppercase; null when invalid. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) return "#" + v.split("").map((c) => c + c).join("").toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(v)) return "#" + v.toUpperCase();
  return null;
}

/** MK4: sup/sub runs this short are never split by Bionic. */
export const SCRIPT_NO_BIONIC_MAX = 3;
