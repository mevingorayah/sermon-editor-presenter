/** Letter spacing (−0.05…+0.30 em) and line spacing (1.0…2.5) for marks and blocks. */

export const LETTER_SPACING = { min: -0.05, max: 0.3, step: 0.01, default: 0 } as const;
export const LINE_SPACING = { min: 1, max: 2.5, step: 0.05, default: 1.5 } as const;

export function clampLetterSpacing(n: number): number {
  const x = Math.round(n / LETTER_SPACING.step) * LETTER_SPACING.step;
  return Math.min(LETTER_SPACING.max, Math.max(LETTER_SPACING.min, Number(x.toFixed(2))));
}

export function clampLineSpacing(n: number): number {
  const x = Math.round(n / LINE_SPACING.step) * LINE_SPACING.step;
  return Math.min(LINE_SPACING.max, Math.max(LINE_SPACING.min, Number(x.toFixed(2))));
}

/** Store as "0.05em" / "-0.02em". */
export function letterSpacingCss(n: number | string | null | undefined): string | null {
  if (n == null || n === "") return null;
  const v = typeof n === "number" ? n : parseFloat(String(n).replace(/em$/i, ""));
  if (!Number.isFinite(v) || v === 0) return v === 0 ? "0em" : null;
  return `${clampLetterSpacing(v)}em`;
}

export function lineSpacingCss(n: number | string | null | undefined): string | null {
  if (n == null || n === "") return null;
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (!Number.isFinite(v)) return null;
  return String(clampLineSpacing(v));
}

export function parseSpacingNumber(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const v = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/em$/i, ""));
  return Number.isFinite(v) ? v : null;
}

/** Block types that can carry paragraph-level spacing (and alignment). */
export const SPACING_BLOCK_TYPES = ["heading", "paragraph", "title", "scripture"] as const;
