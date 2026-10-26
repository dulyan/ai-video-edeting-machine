import type { Model } from "./types.ts";
export const MODELS: Model[] = [
  {
    id: "black-forest-labs/flux-1.1-pro-t2i",
    name: "Flux 1.1 Pro",
    kind: "image",
  },
  {
    id: "bytedance/seedream-4.5-t2i",
    name: "Seedream 4.5",
    kind: "image",
    imageSize: "1440x2560",
  },
  {
    id: "google/gemini-2.5-flash-image-t2i",
    name: "Nano Banana",
    kind: "image",
  },
  {
    id: "bytedance/seedance-1.5-pro-i2v",
    name: "Seedance 1.5 Pro",
    kind: "video",
    durations: [4, 8, 12],
    size: "720p",
  },
  { id: "google/veo-3.1-i2v", name: "Veo 3.1", kind: "video", durations: [8] },
  {
    id: "kuaishou/kling-2.6-pro-i2v",
    name: "Kling 2.6 Pro",
    kind: "video",
    durations: [5, 10],
  },
  { id: "openai/gpt-4.1-mini", name: "GPT 4.1 Mini", kind: "text" },
];
