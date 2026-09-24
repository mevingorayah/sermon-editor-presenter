export type FontFamilyId = "sans" | "serif" | "mono";

/** Map TipTap fontFamily strings (Sans/Serif/Mono stacks) to a concrete id. */
export function mapFontFamily(
  family: string | undefined | null,
): FontFamilyId {
  const n = (family ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!n) return "sans";
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
  switch (id) {
    case "mono":
      return 'ui-monospace, "Liberation Mono", Menlo, monospace';
    case "serif":
      return 'Georgia, "Times New Roman", "Liberation Serif", serif';
    case "sans":
    default:
      return 'system-ui, -apple-system, "Segoe UI", "Liberation Sans", sans-serif';
  }
}

/** pdfkit built-in font names. */
export function pdfkitFont(
  id: FontFamilyId,
  style: { bold?: boolean; italic?: boolean },
): string {
  if (id === "mono") {
    if (style.bold && style.italic) return "Courier-BoldOblique";
    if (style.bold) return "Courier-Bold";
    if (style.italic) return "Courier-Oblique";
    return "Courier";
  }
  if (id === "sans") {
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
  switch (id) {
    case "mono":
      return "Courier New";
    case "sans":
      return "Calibri";
    case "serif":
    default:
      return "Times New Roman";
  }
}
