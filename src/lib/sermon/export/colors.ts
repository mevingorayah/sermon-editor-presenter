/** Soft amber highlight used in Edit chrome — shared across workers. */
export const HIGHLIGHT_AMBER = "#F5D98A";

/** Canonical Edit accent (FormatToolbar "Accent"); used when no accent is sent. */
export const DEFAULT_ACCENT_LIGHT = "#5C4A1F";
/** Dark-theme counterpart for screen targets. */
export const DEFAULT_ACCENT_DARK = "#C4A35A";

/**
 * Normalize #RGB / #RRGGBB / rgb() / rgba() to #RRGGBB (uppercase hex, no alpha).
 * Returns undefined when the value cannot be parsed.
 */
export function toHexRgb(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/var\s*\(/i.test(s)) return undefined;

  const hex6 = s.match(/^#([0-9a-fA-F]{6})$/);
  if (hex6) return `#${hex6[1].toUpperCase()}`;

  const hex3 = s.match(/^#([0-9a-fA-F]{3})$/);
  if (hex3) {
    const [r, g, b] = hex3[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
  );
  if (rgb) {
    const clamp = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${clamp(+rgb[1])}${clamp(+rgb[2])}${clamp(+rgb[3])}`.toUpperCase();
  }

  return undefined;
}

/** Strip leading # for libraries that want bare hex. */
export function hexWithoutHash(hex: string): string {
  return hex.replace(/^#/, "");
}
