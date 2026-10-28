import type { ReferencePoses } from "./reference-poses.ts";
export type Span = "whole" | "reaction" | "demo";
export type HookStyle =
  "Text" | "Snapchat" | "IMG" | "Text Wall" | "Green screen";
export type AssetKind =
  | "image"
  | "reaction"
  | "demo"
  | "music"
  | "presenter"
  | "hook-image"
  | "output";
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  projectId: string;
  createdAt: string;
  mime: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  prompt?: string;
  promptParts?: PromptParts;
  model?: string;
  sourceId?: string;
  jobId?: string;
  key: string;
}
export interface Hook {
  id: string;
  text: string;
  imageId?: string;
  productId?: string;
  createdAt: string;
}
export interface Product {
  id: string;
  internalName: string;
  externalName: string;
  url: string;
  painPoints: string;
  costOfInaction: string;
  solution: string;
  proof: string;
}
export interface Composition {
  aspectRatio?: string;
  style: HookStyle;
  hookSpan: Span;
  musicSpan: Span;
  position: "top" | "middle" | "bottom";
  fontSize: number;
  textWallDuration: number;
  fit: "cover" | "contain";
  musicVolume: number;
  sourceVolume: number;
  presenterId: string;
  backgroundId: string;
  presenterScale: number;
  keyColor: string;
  keySimilarity: number;
  keyBlend: number;
}
export interface RenderRow {
  id: string;
  hookId: string | null;
  reactionId: string | null;
  demoId: string | null;
  musicId: string | null;
  excluded?: boolean;
  hookSpan?: Span;
  musicSpan?: Span;
}
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  step: number;
  skipped: number[];
  imagePrompt: string;
  imageFixedInstructions?: string;
  imageReferencePoses?: ReferencePoses;
  imageVariation?: number;
  imageCount: number;
  imageModel: string;
  imagePromptModel?: string;
  imageAspectRatio?: string;
  videoPrompt: string;
  videoPromptMode?: "randomized";
  videoAudio?: "silent" | "ambient" | "generated";
  videoFreezeLips?: boolean;
  videoMatchEndFrame?: boolean;
  videoFixedInstructions?: string;
  videoVariation?: number;
  videoCount: number;
  videoModel: string;
  videoPromptModel?: string;
  videoAspectRatio?: string;
  videoDuration: number;
  hookModel?: string;
  modelInputs?: Record<string, Record<string, unknown>>;
  frameIds: string[];
  frameSelectionExplicit?: boolean;
  reactionIds: string[];
  demoIds: string[];
  musicIds: string[];
  musicMode: "selected" | "random" | "none";
  hooks: Hook[];
  hookCount: number;
  language: string;
  productId: string;
  composition: Composition;
  rowOverrides: Record<string, Partial<RenderRow>>;
}
export interface Job {
  referencePoses?: ReferencePoses;
  promptStartedAt?: string;
  promptFinishedAt?: string;
  promptRequests?: PromptRequest[];
  mode?: "image" | "video";
  prompt?: string;
  promptModel?: string;
  generationModel?: string;
  targetCount?: number;
  prompts?: string[];
  generatedDescriptions?: string[];
  fixedInstructions?: string;
  promptParts?: PromptParts;
  draftText?: string;
  sequence?: number;
  aspectRatio?: string;
  id: string;
  projectId: string;
  batchId: string;
  kind: "prepare" | "image" | "video" | "hooks" | "render";
  status:
    "queued" | "running" | "completed" | "failed" | "canceled" | "uncertain";
  progress: number;
  label: string;
  input: any;
  taskId?: string;
  outputId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
export interface PromptRequest {
  id: number;
  status: "waiting" | "streaming" | "completed" | "failed" | "duplicate";
  startedAt: string;
  draftText?: string;
  firstTextMs?: number;
  durationMs?: number;
  outputChars?: number;
  reasoningTokens?: number;
  outputTokens?: number;
}
export interface PromptPreset {
  referencePoses?: ReferencePoses;
  id: string;
  name: string;
  mode: "image" | "video";
  prompt: string;
  fixedInstructions?: string;
  variation?: number;
}
export interface PromptParts {
  referencePoses?: ReferencePoses;
  enforcedInstructions?: string;
  fixedInstructions: string;
  generatedDescription: string;
}
export interface AppState {
  /** Monotonic, durable server snapshot version. Local drafts omit it. */
  revision?: number;
  projects: Project[];
  products: Product[];
  assets: Asset[];
  jobs: Job[];
  presets?: PromptPreset[];
}
export interface Model {
  id: string;
  name: string;
  kind: "image" | "video" | "text";
  durations?: number[];
  size?: string;
  imageSize?: string;
  active?: boolean;
  tag?: string;
  provider?: string;
  schema?: ModelSchema;
}
export interface ModelSchema {
  required?: string[];
  properties?: Record<string, ModelField>;
}
export interface ModelField {
  type?: string;
  description?: string;
  enum?: (string | number | boolean)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  items?: ModelField;
  [key: string]: unknown;
}
