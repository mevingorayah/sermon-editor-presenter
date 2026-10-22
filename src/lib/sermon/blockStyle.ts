/**
 * Block builder fields (slice 1): optional per-block `style` / `spacing`,
 * sermon-level `globalStyles`, and the `quote` / `illustration` / `section`
 * (+ `column`) node types.
 *
 * Everything here is OPTIONAL. A sermon with none of these fields validates
 * and round-trips byte-identically. Empty / missing values mean
 * "use the global style for this block type".
 *
 * Browser-safe: zod + plain functions only.
 */
import { z } from "zod";
import { toHexRgb } from "./export/colors";

/** The 10 approved fonts (v2 spec §4.4), stored as font ids. */
export const BLOCK_FONT_IDS = [
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
] as const;
export type BlockFontId = (typeof BLOCK_FONT_IDS)[number];

/** Keys allowed in `globalStyles` (one entry per block type). */
export const BLOCK_TYPES = [
  "title",
  "heading",
  "paragraph",
  "scripture",
  "cue",
  "quote",
  "illustration",
  "section",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Node types that may carry `attrs.style` / `attrs.spacing`. */
export const STYLABLE_NODE_TYPES = new Set<string>([
  "title",
  "heading",
  "paragraph",
  "scripture",
  "quote",
  "illustration",
  "section",
]);

export const BLOCK_ALIGNS = ["left", "center", "right", "justify"] as const;
export type BlockAlign = (typeof BLOCK_ALIGNS)[number];

export const FONT_SIZE_MIN_PT = 8;
export const FONT_SIZE_MAX_PT = 96;
export const SPACING_MIN_PX = 0;
export const SPACING_MAX_PX = 64;

const HEX_MESSAGE =
  "must be a colour like #RRGGBB, #RGB or rgb(r, g, b) (no named colours or CSS var(--…))";

/** Accepts #RGB / #RRGGBB / rgb() / rgba(); normalises to uppercase #RRGGBB. */
const hexColor = z
  .string({ invalid_type_error: `Colour ${HEX_MESSAGE}` })
  .max(64)
  .transform((v, ctx) => {
    const hex = toHexRgb(v);
    if (!hex) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Colour ${HEX_MESSAGE}` });
      return z.NEVER;
    }
    return hex;
  });

const spacingValue = z
  .number({ invalid_type_error: "Spacing must be a number of px" })
  .int({ message: "Spacing must be a whole number of px" })
  .min(SPACING_MIN_PX, { message: `Spacing must be at least ${SPACING_MIN_PX} px` })
  .max(SPACING_MAX_PX, { message: `Spacing must be at most ${SPACING_MAX_PX} px` });

export const blockStyleSchema = z
  .object({
    font: z.enum(BLOCK_FONT_IDS, {
      errorMap: () => ({
        message: `font must be one of: ${BLOCK_FONT_IDS.join(", ")}`,
      }),
    }),
    size: z
      .number({ invalid_type_error: "size must be a number (pt)" })
      .min(FONT_SIZE_MIN_PT, { message: `size must be at least ${FONT_SIZE_MIN_PT} pt` })
      .max(FONT_SIZE_MAX_PT, { message: `size must be at most ${FONT_SIZE_MAX_PT} pt` }),
    weight: z.union([z.literal(400), z.literal(700)], {
      errorMap: () => ({ message: "weight must be 400 or 700" }),
    }),
    italic: z.boolean(),
    color: hexColor,
    highlight: hexColor,
    background: hexColor,
    borderLeft: hexColor.nullable(),
    align: z.enum(BLOCK_ALIGNS, {
      errorMap: () => ({ message: `align must be one of: ${BLOCK_ALIGNS.join(", ")}` }),
    }),
  })
  .partial()
  .strict();

export const blockSpacingSchema = z
  .object({
    mt: spacingValue,
    mb: spacingValue,
    pt: spacingValue,
    pr: spacingValue,
    pb: spacingValue,
    pl: spacingValue,
  })
  .partial()
  .strict();

export const globalBlockStyleSchema = z
  .object({ style: blockStyleSchema.optional(), spacing: blockSpacingSchema.optional() })
  .strict();

export const globalStylesSchema = z
  .object(
    Object.fromEntries(
      BLOCK_TYPES.map((t) => [t, globalBlockStyleSchema.optional()]),
    ) as Record<BlockType, z.ZodOptional<typeof globalBlockStyleSchema>>,
  )
  .strict();

export const sectionColumnsSchema = z.union([z.literal(1), z.literal(2), z.literal(3)], {
  errorMap: () => ({ message: "section columns must be 1, 2 or 3" }),
});

export type BlockStyle = z.output<typeof blockStyleSchema>;
export type BlockSpacing = z.output<typeof blockSpacingSchema>;
export type GlobalBlockStyle = z.output<typeof globalBlockStyleSchema>;
export type GlobalStyles = Partial<Record<BlockType, GlobalBlockStyle>>;

type Issue = { path: string; message: string };
type Json = Record<string, unknown>;

function zodIssues(prefix: string, err: z.ZodError): Issue[] {
  return err.issues.map((i) => ({
    path: [prefix, ...i.path].join("."),
    message: i.message,
  }));
}

/**
 * Walk TipTap JSON and validate block-builder attrs + section structure.
 * Returns issues (empty = valid). Nodes without these attrs are ignored.
 */
export function findBlockLayoutIssues(node: unknown, path = "content"): Issue[] {
  const out: Issue[] = [];
  walk(node, path, null, out);
  return out;
}

function walk(node: unknown, path: string, parentType: string | null, out: Issue[]): void {
  if (out.length >= 50 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((c, i) => walk(c, `${path}[${i}]`, parentType, out));
    return;
  }
  const obj = node as Json;
  const type = typeof obj.type === "string" ? obj.type : "";
  const attrs = (obj.attrs && typeof obj.attrs === "object" ? obj.attrs : {}) as Json;

  for (const key of ["style", "spacing"] as const) {
    if (attrs[key] === undefined || attrs[key] === null) continue;
    if (!STYLABLE_NODE_TYPES.has(type)) {
      out.push({ path: `${path}.attrs.${key}`, message: `"${type || "unknown"}" nodes cannot have ${key}` });
      continue;
    }
    const r = (key === "style" ? blockStyleSchema : blockSpacingSchema).safeParse(attrs[key]);
    if (!r.success) out.push(...zodIssues(`${path}.attrs.${key}`, r.error));
  }

  if (type === "section") {
    const r = sectionColumnsSchema.safeParse(attrs.columns);
    if (!r.success) out.push(...zodIssues(`${path}.attrs.columns`, r.error));
    const kids = Array.isArray(obj.content) ? (obj.content as Json[]) : [];
    if (kids.some((k) => k?.type !== "column")) {
      out.push({ path: `${path}.content`, message: "section content must be column nodes" });
    }
    if (r.success && kids.length !== r.data) {
      out.push({
        path: `${path}.content`,
        message: `section has columns: ${r.data} but ${kids.length} column node(s)`,
      });
    }
  }
  if (type === "column" && parentType !== "section") {
    out.push({ path, message: "column nodes are only allowed inside a section" });
  }
  if (type === "section" && parentType === "column") {
    out.push({ path, message: "sections cannot be nested inside a section" });
  }

  if (Array.isArray(obj.content)) walk(obj.content, `${path}.content`, type, out);
}

/**
 * Normalise colours in block-builder attrs to uppercase #RRGGBB.
 * Returns the SAME object reference when nothing changes, so sermons without
 * these fields serialise byte-identically.
 */
export function normalizeBlockLayout<T>(node: T): T {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((c) => {
      const n = normalizeBlockLayout(c);
      if (n !== c) changed = true;
      return n;
    });
    return (changed ? next : node) as T;
  }
  const obj = node as Json;
  let next: Json | null = null;
  const attrs = obj.attrs as Json | undefined;
  if (attrs && typeof attrs === "object" && attrs.style && typeof attrs.style === "object") {
    const style = attrs.style as Json;
    let nextStyle: Json | null = null;
    for (const k of ["color", "highlight", "background", "borderLeft"]) {
      const v = style[k];
      if (typeof v !== "string") continue;
      const hex = toHexRgb(v);
      if (hex && hex !== v) {
        nextStyle = nextStyle ?? { ...style };
        nextStyle[k] = hex;
      }
    }
    if (nextStyle) next = { ...obj, attrs: { ...attrs, style: nextStyle } };
  }
  if (Array.isArray(obj.content)) {
    const c = normalizeBlockLayout(obj.content);
    if (c !== obj.content) next = { ...(next ?? obj), content: c };
  }
  return (next ?? obj) as T;
}

/** Normalise colours inside `globalStyles` (same-reference when unchanged). */
export function normalizeGlobalStyles<T>(gs: T): T {
  if (!gs || typeof gs !== "object") return gs;
  let changed = false;
  const out: Json = {};
  for (const [k, v] of Object.entries(gs as Json)) {
    const n = v && typeof v === "object" ? normalizeBlockLayout({ attrs: v } as Json).attrs : v;
    if (n !== v) changed = true;
    out[k] = n;
  }
  return (changed ? out : gs) as T;
}
