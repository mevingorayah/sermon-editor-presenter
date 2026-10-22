/** The 10 approved fonts (v2 spec §4.4, same ids as PR #30 BLOCK_FONT_IDS) + mono. */
export const APPROVED_FONT_IDS = [
  "lora",
  "merriweather",
  "playfair-display",
  "source-serif-4",
  "literata",
  "inter",
  "open-sans",
  "lato",
  "montserrat",
  "nunito-sans",
  "jetbrains-mono",
] as const;
export type ApprovedFontId = (typeof APPROVED_FONT_IDS)[number];

/** A run's font: an approved id, or a legacy v1 value (sans/serif/mono). */
export type FontFamilyId = "sans" | "serif" | "mono" | ApprovedFontId;

/** Legacy v1 values → the export font used for them (matches PR #30 LEGACY_FONT_MAP). */
export const LEGACY_EXPORT_FONT: Record<"sans" | "serif" | "mono", ApprovedFontId> = {
  serif: "literata",
  sans: "inter",
  mono: "jetbrains-mono",
};

/**
 * Fonts with bundled export files + width tables (assets/fonts/export).
 * Any font not listed is laid out in Literata (its stored font is untouched).
 * All 10 approved fonts plus JetBrains Mono are covered today.
 */
export const EXPORT_COVERED_FONTS: ReadonlySet<ApprovedFontId> = new Set(APPROVED_FONT_IDS);

/** The bundled font that measures and renders `id`. */
export function exportFontId(id: FontFamilyId | string | undefined): ApprovedFontId {
  if (id === "sans" || id === "serif" || id === "mono") return LEGACY_EXPORT_FONT[id];
  return EXPORT_COVERED_FONTS.has(id as ApprovedFontId) ? (id as ApprovedFontId) : "literata";
}

const SANS_IDS = new Set<string>(["sans", "inter", "open-sans", "lato", "montserrat", "nunito-sans"]);
/** Broad class, for fallbacks (Office, built-in PDF fonts). */
export function fontCategory(id: FontFamilyId | string | undefined): "sans" | "serif" | "mono" {
  if (id === "mono" || id === "jetbrains-mono") return "mono";
  return id && SANS_IDS.has(id) ? "sans" : "serif";
}

/** Display names, for matching stored CSS stacks like `"Open Sans", sans-serif`. */
const FONT_NAMES: Record<ApprovedFontId, string> = {
  lora: "lora",
  merriweather: "merriweather",
  "playfair-display": "playfair display",
  "source-serif-4": "source serif 4",
  literata: "literata",
  inter: "inter",
  "open-sans": "open sans",
  lato: "lato",
  montserrat: "montserrat",
  "nunito-sans": "nunito sans",
  "jetbrains-mono": "jetbrains mono",
};

/** Map a stored font value (font id, CSS var or stack, or v1 Sans/Serif/Mono) to an id. */
export function mapFontFamily(
  family: string | undefined | null,
): FontFamilyId {
  const n = (family ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!n) return "sans";
  if ((APPROVED_FONT_IDS as readonly string[]).includes(n)) return n as ApprovedFontId;
  const first = n.split(",")[0].replace(/["']/g, "").trim();
  for (const id of APPROVED_FONT_IDS) {
    if (first === FONT_NAMES[id] || n.includes(`--font-${id}`)) return id;
  }
  if (n.includes("monospace") || n.includes("mono") || n === "mono") {
    return "mono";
  }
  if (
    n.includes("georgia") ||
    n.includes("ui-serif") ||
    n.includes("times") ||
    n.includes("serif") ||
    n === "serif"
  ) {
    return "serif";
  }
  return "sans";
}

/** Concrete CSS font stacks for SVG / HTML-ish renderers. */
export function cssFontStack(id: FontFamilyId): string {
  const c = fontCategory(id);
  const own = id === "sans" || id === "serif" || id === "mono" ? "" : `"${FONT_NAMES[id].replace(/\b\w/g, (m) => m.toUpperCase())}", `;
  switch (c) {
    case "mono":
      return '"JetBrains Mono", ui-monospace, "Liberation Mono", Menlo, "DejaVu Sans Mono", monospace';
    case "serif":
      return own + 'Literata, "Source Serif 4", Lora, Georgia, "Liberation Serif", "DejaVu Serif", serif';
    case "sans":
    default:
      return own + 'system-ui, "Segoe UI", "Liberation Sans", "DejaVu Sans", "Noto Sans", sans-serif';
  }
}

/** pdfkit built-in font names. */
export function pdfkitFont(
  id: FontFamilyId,
  style: { bold?: boolean; italic?: boolean },
): string {
  const cat = fontCategory(id);
  if (cat === "mono") {
    if (style.bold && style.italic) return "Courier-BoldOblique";
    if (style.bold) return "Courier-Bold";
    if (style.italic) return "Courier-Oblique";
    return "Courier";
  }
  if (cat === "sans") {
    if (style.bold && style.italic) return "Helvetica-BoldOblique";
    if (style.bold) return "Helvetica-Bold";
    if (style.italic) return "Helvetica-Oblique";
    return "Helvetica";
  }
  // serif (default)
  if (style.bold && style.italic) return "Times-BoldItalic";
  if (style.bold) return "Times-Bold";
  if (style.italic) return "Times-Italic";
  return "Times-Roman";
}

/** docx library font names. */
export function docxFontName(id: FontFamilyId): string {
  switch (fontCategory(id)) {
    case "mono":
      return "Courier New";
    case "sans":
      return "Calibri";
    case "serif":
    default:
      return "Times New Roman";
  }
}
