/**
 * Preach dark-theme colour policy (UI UX acceptance rule 2):
 * a user text colour whose contrast against the dark stage background is
 * below 4.5:1 is lightened in HSL, keeping its hue (and saturation). Every
 * other colour, and every colour in the light theme, is returned unchanged.
 */

export const DARK_STAGE_BG = "#12110f"; // --rm-bg (dark), reading-mode.css
export const MIN_CONTRAST = 4.5;
/** Default dark-Preach highlight (mark.sermon-highlight, sermon-marks.css). */
export const DARK_HIGHLIGHT_BG = "#3d2e0e";

type RGB = [number, number, number];

export function parseColor(input: string): RGB | null {
  const v = input.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = v.match(/^#([0-9a-f]{3})$/);
  if (m) {
    return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as RGB;
  }
  m = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/);
  if (m) {
    const rgb = [m[1], m[2], m[3]].map(Number) as RGB;
    return rgb.every((c) => c <= 255) ? rgb : null;
  }
  return null;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)) as RGB;
}

function toHex([r, g, b]: RGB): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** Lighten `color` (same hue/saturation) until it reaches `min` against `bg`. */
export function ensureContrast(
  color: string,
  bg: string = DARK_STAGE_BG,
  min: number = MIN_CONTRAST,
): string {
  const rgb = parseColor(color);
  const bgRgb = parseColor(bg);
  if (!rgb || !bgRgb) return color;
  if (contrastRatio(rgb, bgRgb) >= min) return color;
  const [h, s, l0] = rgbToHsl(rgb);
  // Binary search the smallest lightness that passes (white always passes on dark).
  let lo = l0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastRatio(hslToRgb(h, s, mid), bgRgb) >= min) hi = mid;
    else lo = mid;
  }
  let out = hslToRgb(h, s, hi);
  // Rounding guard.
  while (contrastRatio(out, bgRgb) < min && hi < 1) {
    hi = Math.min(1, hi + 0.005);
    out = hslToRgb(h, s, hi);
  }
  return toHex(out);
}

/** Text colour as shown in Preach for the given theme. */
export function readingTextColor(
  color: string,
  theme: "light" | "dark",
  /** Effective background: the highlight's dark colour when one is present. */
  background: string = DARK_STAGE_BG,
): string {
  return theme === "dark" ? ensureContrast(color, background) : color;
}

/** Dark-Preach background behind text: the highlight if present, else the page. */
export function effectiveDarkBackground(highlightColor: string | null | undefined, highlighted: boolean): string {
  if (!highlighted) return DARK_STAGE_BG;
  return highlightColor ? readingHighlightColor(highlightColor, "dark") : DARK_HIGHLIGHT_BG;
}

/** Highlight background as shown in Preach: a dark variant in the dark theme. */
export function readingHighlightColor(color: string, theme: "light" | "dark"): string {
  if (theme !== "dark") return color;
  const rgb = parseColor(color);
  if (!rgb) return color;
  const [h, s, l] = rgbToHsl(rgb);
  return toHex(hslToRgb(h, s, Math.min(l, 0.3)));
}
