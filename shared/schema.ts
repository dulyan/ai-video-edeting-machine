import { HOOK_POSITIONS } from "./hook-layout.ts";
import { z } from "zod";
import { RATIOS } from "./ratios.ts";
import { HOOK_FONT_IDS } from "./hook-fonts.ts";
export const referencePosesSchema = z.union([
  z.string().max(20000),
  z
    .array(z.string().max(20000))
    .max(1000)
    .refine(
      (poses) => poses.reduce((sum, pose) => sum + pose.length, 0) <= 20000,
      "Reference poses must contain at most 20000 characters in total",
    ),
]);

const text = z.string().max(20000),
  id = z.string().max(200),
  ids = z.array(id).max(1000);
const span = z.enum(["whole", "reaction", "demo"]);
export const compositionSchema = z.object({
  aspectRatio: z.enum(RATIOS).optional(),
  style: z.enum(["Text", "Snapchat", "IMG", "Text Wall", "Green screen"]),
  hookSpan: span,
  musicSpan: span,
  position: z.enum(HOOK_POSITIONS),
  fontSize: z.number().min(20).max(100),
  fontId: z.enum(HOOK_FONT_IDS).optional(),
  textWallDuration: z.number().min(1).max(30),
  fit: z.enum(["cover", "contain"]),
  musicVolume: z.number().min(0).max(2),
  sourceVolume: z.number().min(0).max(2),
  reactionVolume: z.number().min(0).max(2).optional(),
  demoVolume: z.number().min(0).max(2).optional(),
  textLayoutVersion: z.literal(2).optional(),
  presenterId: id,
  backgroundId: id,
  presenterScale: z.number().min(0.15).max(1),
  keyColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  keySimilarity: z.number().min(0.01).max(1),
  keyBlend: z.number().min(0).max(1),
});
export const hookSchema = z.object({
  enabled: z.boolean().optional(),
  id,
  text,
  imageId: id.optional(),
  productId: id.optional(),
  fontId: z.enum(HOOK_FONT_IDS).optional(),
  createdAt: z.string().max(100),
});
export const productSchema = z.object({
  id,
  internalName: z.string().min(1).max(200),
  externalName: z.string().min(1).max(200),
  url: z.string().max(2000),
  painPoints: text,
  costOfInaction: text,
  solution: text,
  proof: text,
  description: text.optional(),
});
export const rowSchema = z.object({
  id,
  hookId: id.nullable(),
  reactionId: id.nullable(),
  demoId: id.nullable(),
  musicId: id.nullable(),
  excluded: z.boolean().optional(),
  hookSpan: span.optional(),
  musicSpan: span.optional(),
});
export const projectSchema = z.object({
  id,
  name: z.string().max(200),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
  step: z.number().int().min(0).max(8),
  skipped: z.array(z.number().int().min(0).max(8)).max(9),
  imagePrompt: text,
  imageFixedInstructions: text.optional(),
  imageReferencePoses: referencePosesSchema.optional(),
  imageVariation: z.number().int().min(0).max(100).optional(),
  imageCount: z.number().int().min(1).max(1000),
  imageModel: id,
  imagePromptModel: id.optional(),
  imageAspectRatio: z.enum(RATIOS).optional(),
  videoPrompt: text,
  videoPromptMode: z.literal("randomized").optional(),
  videoAudio: z.enum(["silent", "ambient", "generated"]).optional(),
  videoFreezeLips: z.boolean().optional(),
  videoMatchEndFrame: z.boolean().optional(),
  videoFixedInstructions: text.optional(),
  videoVariation: z.number().int().min(0).max(100).optional(),
  videoCount: z.number().int().min(1).max(100),
  videoModel: id,
  videoPromptModel: id.optional(),
  videoAspectRatio: z.enum(RATIOS).optional(),
  videoDuration: z.number().int().min(-1).max(600),
  hookModel: id.optional(),
  hookVirality: z.number().int().min(1).max(10).optional(),
  modelInputs: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional(),
  frameIds: ids,
  frameSelectionExplicit: z.boolean().optional(),
  reactionIds: ids,
  demoIds: ids,
  musicIds: ids,
  musicStartOffsets: z.record(id, z.number().finite().min(0).max(86400)).optional(),
  musicMode: z.enum(["selected", "random", "none"]),
  hooks: z.array(hookSchema).max(5000),
  hookCount: z.number().int().min(1).max(1000),
  language: z.string().min(1).max(100),
  productId: id,
  composition: compositionSchema,
  rowOverrides: z.record(z.string(), rowSchema.partial()),
});
