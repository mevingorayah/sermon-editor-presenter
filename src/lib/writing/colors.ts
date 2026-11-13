/**
 * Text-colour and highlight palettes for the Edit toolbar, Preach, and tests.
 * Text: the existing 6 presets (Default + 5 named hues) plus a custom hex.
 * Highlight: 8 presets plus a custom hex. Recent lists live in localStorage.
 */

/** Each is >= 4.5:1 on white, Edit #f4f1ea and every light highlight (contrast.test.ts); dark Preach lightens them as needed. */
export const TEXT_COLORS = [
  { id: "muted", label: "Muted gray", value: "#5c5c5c" },
  { id: "accent", label: "Accent", value: "#5c4a1f" },
  { id: "red", label: "Soft red", value: "#9b3e36" },
  { id: "blue", label: "Soft blue", value: "#376080" },
  { id: "green", label: "Soft green", value: "#336640" },
] as const;

export type TextColorPreset = (typeof TEXT_COLORS)[number];

/** Eight highlighter fills. Dark Preach uses `dark` when a preset id is stored. */
export const HIGHLIGHT_PRESETS = [
  { id: "yellow", label: "Yellow", value: "#FFF176", dark: "#655F33" },
  { id: "green", label: "Green", value: "#C5E1A5", dark: "#3D5A32" },
  { id: "blue", label: "Blue", value: "#90CAF9", dark: "#2A4A66" },
  { id: "pink", label: "Pink", value: "#F8BBD0", dark: "#6B3A4E" },
  { id: "orange", label: "Orange", value: "#FFCC80", dark: "#6A4A28" },
  { id: "lavender", label: "Lavender", value: "#D1C4E9", dark: "#4A3C64" },
  { id: "teal", label: "Teal", value: "#80CBC4", dark: "#2A5450" },
  { id: "coral", label: "Coral", value: "#FFAB91", dark: "#6A3C32" },
] as const;

export type HighlightPreset = (typeof HIGHLIGHT_PRESETS)[number];

const TEXT_KEY = "sermon-editor-presenter:recent-text-colors:v1";
const HIGHLIGHT_KEY = "sermon-editor-presenter:recent-highlight-colors:v1";
export const RECENT_COLORS_MAX = 6;

/** Accept #RGB or #RRGGBB (with or without #). Returns uppercase #RRGGBB, or null. */
export function normalizeHex(raw: string): string | null {
  const s = raw.trim();
  const m3 = s.match(/^#?([0-9a-fA-F]{3})$/);
  if (m3) {
    return `#${m3[1]
      .split("")
      .map((c) => c + c)
      .join("")}`.toUpperCase();
  }
  const m6 = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (m6) return `#${m6[1]}`.toUpperCase();
  return null;
}

export function recentStorageKey(kind: "text" | "highlight"): string {
  return kind === "text" ? TEXT_KEY : HIGHLIGHT_KEY;
}

/** Pure: newest first, unique, capped. */
export function pushRecent(list: string[], hex: string, max = RECENT_COLORS_MAX): string[] {
  const n = normalizeHex(hex);
  if (!n) return list.slice(0, max);
  return [n, ...list.filter((c) => normalizeHex(c) !== n)].slice(0, max);
}

export function readRecentColors(kind: "text" | "highlight"): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(recentStorageKey(kind));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    const out: string[] = [];
    for (const x of arr) {
      if (typeof x !== "string") continue;
      const n = normalizeHex(x);
      if (n && !out.includes(n)) out.push(n);
    }
    return out.slice(0, RECENT_COLORS_MAX);
  } catch {
    return [];
  }
}

export function rememberColor(kind: "text" | "highlight", hex: string): string[] {
  const next = pushRecent(readRecentColors(kind), hex);
  try {
    localStorage.setItem(recentStorageKey(kind), JSON.stringify(next));
  } catch {
    /* quota */
  }
  return next;
}

export function textPresetByValue(value: string | null | undefined): TextColorPreset | undefined {
  if (!value) return undefined;
  const n = normalizeHex(value) ?? value.trim().toLowerCase();
  return TEXT_COLORS.find(
    (c) => c.value.toLowerCase() === n.toLowerCase() || normalizeHex(c.value) === normalizeHex(value),
  );
}

export function highlightPresetByIdOrColor(
  color?: string | null,
  preset?: string | null,
): HighlightPreset | undefined {
  if (preset) {
    const byId = HIGHLIGHT_PRESETS.find((p) => p.id === preset);
    if (byId) return byId;
  }
  if (!color) return undefined;
  const n = normalizeHex(color) ?? color.trim();
  return HIGHLIGHT_PRESETS.find(
    (p) => p.value.toLowerCase() === n.toLowerCase() || normalizeHex(p.value) === normalizeHex(color),
  );
}
