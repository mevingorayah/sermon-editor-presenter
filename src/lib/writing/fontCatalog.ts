/**
 * Writing-tool fonts: system stacks (so existing sermons render unchanged)
 * plus up to 8 serif and 8 sans Google Fonts with latin + latin-ext coverage.
 */

export const FONT_SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_SERIF = "ui-serif, Georgia, serif";
export const FONT_MONO = "ui-monospace, monospace";

export type FontGroup = "System" | "Serif" | "Sans";

export interface WritingFont {
  id: string;
  label: string;
  group: FontGroup;
  /** Value stored on the textStyle mark. System stacks stay exact. */
  stack: string;
}

export const SYSTEM_FONTS: readonly WritingFont[] = [
  { id: "sans", label: "Sans", group: "System", stack: FONT_SANS },
  { id: "serif", label: "Serif", group: "System", stack: FONT_SERIF },
  { id: "mono", label: "Mono", group: "System", stack: FONT_MONO },
];

/** 8 serif faces, all with Latin Extended-A (French accents). */
export const SERIF_FONTS: readonly WritingFont[] = [
  { id: "lora", label: "Lora", group: "Serif", stack: '"Lora", serif' },
  { id: "merriweather", label: "Merriweather", group: "Serif", stack: '"Merriweather", serif' },
  { id: "playfair-display", label: "Playfair Display", group: "Serif", stack: '"Playfair Display", serif' },
  { id: "source-serif-4", label: "Source Serif 4", group: "Serif", stack: 'var(--font-source-serif), "Source Serif 4", serif' },
  { id: "literata", label: "Literata", group: "Serif", stack: "var(--font-literata), Literata, serif" },
  { id: "eb-garamond", label: "EB Garamond", group: "Serif", stack: '"EB Garamond", serif' },
  { id: "crimson-pro", label: "Crimson Pro", group: "Serif", stack: '"Crimson Pro", serif' },
  { id: "noto-serif", label: "Noto Serif", group: "Serif", stack: '"Noto Serif", serif' },
];

/** 8 sans faces, all with Latin Extended-A. */
export const SANS_FONTS: readonly WritingFont[] = [
  { id: "inter", label: "Inter", group: "Sans", stack: '"Inter", sans-serif' },
  { id: "open-sans", label: "Open Sans", group: "Sans", stack: '"Open Sans", sans-serif' },
  { id: "lato", label: "Lato", group: "Sans", stack: '"Lato", sans-serif' },
  { id: "montserrat", label: "Montserrat", group: "Sans", stack: '"Montserrat", sans-serif' },
  { id: "nunito-sans", label: "Nunito Sans", group: "Sans", stack: '"Nunito Sans", sans-serif' },
  { id: "source-sans-3", label: "Source Sans 3", group: "Sans", stack: '"Source Sans 3", sans-serif' },
  { id: "noto-sans", label: "Noto Sans", group: "Sans", stack: '"Noto Sans", sans-serif' },
  { id: "ibm-plex-sans", label: "IBM Plex Sans", group: "Sans", stack: '"IBM Plex Sans", sans-serif' },
];

export const WRITING_FONTS: readonly WritingFont[] = [
  ...SYSTEM_FONTS,
  ...SERIF_FONTS,
  ...SANS_FONTS,
];

/** Google Fonts css2 families (excludes Literata / Source Serif 4, already in next/font). */
export const GOOGLE_CSS2_FAMILIES = [
  "Lora:ital,wght@0,400;0,700;1,400;1,700",
  "Merriweather:ital,wght@0,400;0,700;1,400;1,700",
  "Playfair+Display:ital,wght@0,400;0,700;1,400;1,700",
  "Inter:ital,wght@0,400;0,700;1,400;1,700",
  "Open+Sans:ital,wght@0,400;0,700;1,400;1,700",
  "Lato:ital,wght@0,400;0,700;1,400;1,700",
  "Montserrat:ital,wght@0,400;0,700;1,400;1,700",
  "Nunito+Sans:ital,wght@0,400;0,700;1,400;1,700",
] as const;

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  GOOGLE_CSS2_FAMILIES.map((f) => `family=${f}`).join("&") +
  "&display=swap";

function normalize(family: string | undefined | null): string {
  return (family ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Resolve a stored stack, id, or CSS var to a catalog id (default sans). */
export function writingFontId(family: string | undefined | null): string {
  const n = normalize(family);
  if (!n) return "sans";
  const exact = WRITING_FONTS.find((f) => f.id === n || normalize(f.stack) === n);
  if (exact) return exact.id;
  const first = n.split(",")[0].replace(/["']/g, "").trim();
  for (const f of WRITING_FONTS) {
    if (f.group === "System") continue;
    if (first === f.label.toLowerCase() || n.includes(`--font-${f.id}`) || n.includes(f.label.toLowerCase())) {
      return f.id;
    }
  }
  if (n.includes("monospace") || n.includes("mono")) return "mono";
  if (n.includes("georgia") || n.includes("ui-serif") || n.includes("times") || n.endsWith("serif") || n === "serif") {
    return "serif";
  }
  return "sans";
}

export function writingFontById(id: string): WritingFont | undefined {
  return WRITING_FONTS.find((f) => f.id === id);
}
