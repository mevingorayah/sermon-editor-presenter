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

/**
 * Validates Frontend `CalibratedSnapshot` (`src/types/document.ts`).
 * - `bionic` must be literal `false` (never true in export)
 * - `flattenGradient` must be literal `true`
 */
export const calibratedSnapshotSchema = z
  .object({
    target: z.union([calibrationTargetSchema, z.string().min(1).max(64)]),
    margins: calibratedMarginsSchema,
    typeScaleStep: z.number().int().min(-2).max(2),
    lineHeight: lineHeightSchema,
    theme: z.enum(["light", "dark"]),
    flattenGradient: z.literal(true),
    bionic: z.literal(false),
    semanticBlocks: z.array(semanticBlockSchema).max(2000),
    content: sermonContentSchema,
  })
  .strict();

export const exportFormatSchema = z.enum(["docx", "pdf"]);

/**
 * Accept either:
 * 1. Raw CalibratedSnapshot (what CalibrationPanel POSTs today)
 * 2. `{ format, ...CalibratedSnapshot }`
 * 3. `{ format, snapshot: CalibratedSnapshot }`
 */
export const exportRequestSchema = z.union([
  calibratedSnapshotSchema.extend({
    format: exportFormatSchema.optional(),
  }),
  z.object({
    format: exportFormatSchema.optional(),
    snapshot: calibratedSnapshotSchema,
  }),
]);

export const createSermonSchema = z.object({
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
