import { z } from "zod";
import type { SermonContent } from "@/types/document";

const calibrationTargetSchema = z.enum([
  "screen-16-9",
  "screen-16-10",
  "tablet-portrait",
  "paper-letter",
  "paper-a4",
  "paper-half-letter",
]);

const lineHeightSchema = z.union([
  z.literal(1.55),
  z.literal(1.7),
  z.literal(1.85),
]);

const typeScaleStepSchema = z.union([
  z.literal(-2),
  z.literal(-1),
  z.literal(0),
  z.literal(1),
  z.literal(2),
]);

const presentationSettingsSchema = z.object({
  theme: z.enum(["light", "dark"]),
  typeScaleStep: typeScaleStepSchema,
  lineHeight: lineHeightSchema,
  bionic: z.boolean(),
  calibrationTarget: calibrationTargetSchema,
  page: z.lazy(() => sermonPageSettingsSchema).optional(),
});

/** TipTap JSON — opaque; validated as non-null object then cast. */
const sermonContentSchema: z.ZodType<SermonContent> = z.custom<SermonContent>(
  (val) => typeof val === "object" && val !== null,
  { message: "Invalid TipTap document JSON" },
);

const semanticBlockSchema = z.object({
  type: z.enum(["Title", "H1", "H2", "Body", "Scripture", "Caption"]),
  text: z.string().max(100_000),
  citation: z.string().max(500).optional(),
});

const calibratedMarginsSchema = z.object({
  top: z.string().min(1).max(32),
  right: z.string().min(1).max(32),
  bottom: z.string().min(1).max(32),
  left: z.string().min(1).max(32),
  binderGutter: z.string().min(1).max(32).optional(),
});

const pageFormatSchema = z.enum(["a4", "letter", "half-letter", "tablet", "16:9", "16:10"]);
const orientationSchema = z.enum(["portrait", "landscape"]);
const textSizePtSchema = z.number().min(24).max(72);
const lineSpacingSchema = z.number().min(1.2).max(2.0);
const paragraphSpacingPtSchema = z.number().min(0).max(48);

/** Per-sermon page settings: all optional, so older sermons still load. */
const sermonPageSettingsSchema = z.object({
  format: pageFormatSchema.optional(),
  orientation: orientationSchema.optional(),
  textSizePt: textSizePtSchema.optional(),
  lineSpacing: lineSpacingSchema.optional(),
  paragraphSpacingPt: paragraphSpacingPtSchema.optional(),
  margins: calibratedMarginsSchema.optional(),
});

/** Sermon ids are UUID-only (matches store `assertSafeId`). */
export const SERMON_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contract colors: `#RRGGBB` or `rgb(r, g, b)` with 0–255 integers.
 * Named colors, `#RGB`, `rgba()`, `hsl()` and CSS `var(--…)` are rejected.
 */
export function isContractColor(v: string): boolean {
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return true;
  const m = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  return !!m && [m[1], m[2], m[3]].every((n) => Number(n) <= 255);
}

export const CONTRACT_COLOR_MESSAGE =
  "Color must be #RRGGBB or rgb(r, g, b). Named colors, #RGB, rgba(), hsl() and CSS var(--…) are not allowed.";

const resolvedColorSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isContractColor, { message: CONTRACT_COLOR_MESSAGE });

/**
 * Walk TipTap JSON for color marks / attrs whose value fails `predicate`.
 * Returns JSON-ish paths (e.g. `content.content[2].marks[0].color`).
 */
function findColorHits(
  node: unknown,
  isBad: (color: string) => boolean,
  path: string,
): string[] {
  const hits: string[] = [];
  if (!node || typeof node !== "object") return hits;

  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      hits.push(...findColorHits(child, isBad, `${path}[${i}]`));
    });
    return hits;
  }

  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj.marks)) {
    for (let i = 0; i < obj.marks.length; i++) {
      const mark = obj.marks[i] as Record<string, unknown> | null;
      if (!mark || typeof mark !== "object") continue;
      const attrs = mark.attrs as Record<string, unknown> | undefined;
      const color =
        typeof attrs?.color === "string"
          ? attrs.color
          : typeof mark.color === "string"
            ? mark.color
            : undefined;
      if (color && isBad(color)) hits.push(`${path}.marks[${i}].color`);
    }
  }

  if (obj.attrs && typeof obj.attrs === "object") {
    const attrs = obj.attrs as Record<string, unknown>;
    if (typeof attrs.color === "string" && isBad(attrs.color)) {
      hits.push(`${path}.attrs.color`);
    }
  }

  if (Array.isArray(obj.content)) {
    hits.push(...findColorHits(obj.content, isBad, `${path}.content`));
  }

  return hits;
}

/** Color marks that are not `#RRGGBB` / `rgb()` (includes CSS vars). */
export function findInvalidColorMarks(
  node: unknown,
  path: string = "content",
): string[] {
  return findColorHits(node, (c) => c.trim() !== "" && !isContractColor(c), path);
}

/**
 * Walk TipTap JSON for textStyle / color marks containing CSS var(--…).
 * Frontend must flatten accent colors to hex/RGB before POST.
 */
export function findCssVarColorMarks(
  node: unknown,
  path: string = "content",
): string[] {
  const hits: string[] = [];
  if (!node || typeof node !== "object") return hits;

  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      hits.push(...findCssVarColorMarks(child, `${path}[${i}]`));
    });
    return hits;
  }

  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj.marks)) {
    for (let i = 0; i < obj.marks.length; i++) {
      const mark = obj.marks[i] as Record<string, unknown> | null;
      if (!mark || typeof mark !== "object") continue;
      const attrs = mark.attrs as Record<string, unknown> | undefined;
      const color =
        typeof attrs?.color === "string"
          ? attrs.color
          : typeof mark.color === "string"
            ? mark.color
            : undefined;
      if (color && /var\s*\(\s*--/i.test(color)) {
        hits.push(`${path}.marks[${i}].color`);
      }
    }
  }

  if (obj.attrs && typeof obj.attrs === "object") {
    const attrs = obj.attrs as Record<string, unknown>;
    if (typeof attrs.color === "string" && /var\s*\(\s*--/i.test(attrs.color)) {
      hits.push(`${path}.attrs.color`);
    }
  }

  if (Array.isArray(obj.content)) {
    hits.push(...findCssVarColorMarks(obj.content, `${path}.content`));
  }

  return hits;
}

function refineNoCssVarColors(
  val: { content: unknown },
  ctx: z.RefinementCtx,
): void {
  const varHits = new Set(findCssVarColorMarks(val.content));
  const hits = findInvalidColorMarks(val.content);
  // Cap issues so a pasted document can't produce a giant 400 body.
  for (const hit of hits.slice(0, 20)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: varHits.has(hit)
        ? `${hit}: CSS var(--…) is not allowed in export color marks. Flatten colors to #RRGGBB on the Frontend before POST.`
        : `${hit}: ${CONTRACT_COLOR_MESSAGE}`,
    });
  }
}

const calibratedSnapshotFields = {
  target: z.union([calibrationTargetSchema, z.string().min(1).max(64)]),
  margins: calibratedMarginsSchema,
  typeScaleStep: z.number().int().min(-2).max(2),
  lineHeight: z.union([lineHeightSchema, lineSpacingSchema]),
  theme: z.enum(["light", "dark"]),
  pageFormat: pageFormatSchema.optional(),
  orientation: orientationSchema.optional(),
  textSizePt: textSizePtSchema.optional(),
  paragraphSpacingPt: paragraphSpacingPtSchema.optional(),
  flattenGradient: z.literal(true),
  bionic: z.literal(false),
  semanticBlocks: z.array(semanticBlockSchema).max(2000),
  content: sermonContentSchema,
};

/**
 * Validates Frontend `CalibratedSnapshot` (`src/types/document.ts`).
 * - `bionic` must be literal `false` (never true in export)
 * - `flattenGradient` must be literal `true`
 * - TipTap color marks must not contain CSS `var(--…)`
 */
export const calibratedSnapshotSchema = z
  .object(calibratedSnapshotFields)
  .strict()
  .superRefine(refineNoCssVarColors);

export const exportFormatSchema = z.enum(["docx", "pdf", "png", "pptx"]);

const exportExtrasFields = {
  format: exportFormatSchema.optional(),
  filenameStem: z.string().max(200).optional(),
  includeNotes: z.boolean().optional(),
  notes: z.string().max(100_000).optional(),
  /** PDF/PNG/PPTX colours only; never changes layout. */
  exportTheme: z.enum(["light", "dark"]).optional(),
  resolvedColors: z
    .object({
      accent: resolvedColorSchema,
    })
    .strict()
    .optional(),
};

/**
 * Accept either:
 * 1. Raw CalibratedSnapshot (what CalibrationPanel POSTs today)
 * 2. `{ format, filenameStem?, includeNotes?, notes?, resolvedColors?, ...CalibratedSnapshot }`
 * 3. `{ format, snapshot: CalibratedSnapshot, filenameStem?, includeNotes?, notes?, resolvedColors? }`
 */
export const exportRequestSchema = z.union([
  z
    .object({
      ...calibratedSnapshotFields,
      ...exportExtrasFields,
    })
    .strict()
    .superRefine(refineNoCssVarColors),
  z
    .object({
      ...exportExtrasFields,
      snapshot: calibratedSnapshotSchema,
    })
    .strict(),
]);

export const createSermonSchema = z.object({
  /** Optional client-chosen UUID (same-id restore). Existing id returns 409. */
  id: z
    .string()
    .regex(SERMON_ID_RE, { message: "id must be a UUID" })
    .optional(),
  title: z.string().max(500).optional(),
  content: sermonContentSchema.optional(),
  presentation: presentationSettingsSchema.optional(),
  notes: z.string().max(100_000).optional(),
});

export const updateSermonSchema = z.object({
  title: z.string().max(500).optional(),
  content: sermonContentSchema.optional(),
  presentation: presentationSettingsSchema.nullable().optional(),
  notes: z.string().max(100_000).nullable().optional(),
});

export const updateContentSchema = z
  .object({
    content: sermonContentSchema.optional(),
    document: sermonContentSchema.optional(),
    title: z.string().max(500).optional(),
  })
  .refine((v) => v.content !== undefined || v.document !== undefined, {
    message: "Provide content and/or document",
  });

export type CalibratedSnapshotParsed = z.infer<typeof calibratedSnapshotSchema>;
export type ExportRequestParsed = z.infer<typeof exportRequestSchema>;
