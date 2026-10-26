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
  imageCount: number;
  imageModel: string;
  videoPrompt: string;
  videoCount: number;
  videoModel: string;
  videoDuration: number;
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
export interface PromptPreset {
  id: string;
  name: string;
  mode: "image" | "video";
  prompt: string;
}
export interface AppState {
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
}
