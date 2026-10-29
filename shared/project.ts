import type { Project, RenderRow, Span } from "./types.ts";
import { IMAGE_PROMPT, IMAGE_FIXED_INSTRUCTIONS } from "./starting-frame-defaults.ts";
import { DEFAULT_HOOK_FONT } from "./hook-fonts.ts";
import { DEFAULT_HOOK_VIRALITY } from "./hook-virality.ts";
export const STEPS = [
  "Project name",
  "Starting frames",
  "Reaction videos",
  "Viral hooks",
  "Choose clips",
  "Product demos",
  "Music",
  "Task outline",
  "Project status",
];
export const SPANS: { value: Span; label: string }[] = [
  { value: "whole", label: "Whole video" },
  { value: "reaction", label: "Reaction only" },
  { value: "demo", label: "Demo only" },
];
export { IMAGE_PROMPT, IMAGE_FIXED_INSTRUCTIONS };
export const VIDEO_PROMPT =
  "Invent one fresh, specific reaction lasting no more than five seconds. Describe only character actions, facial expression, emotional intent, timing, and optional spoken words. Preserve the supplied starting frame identity, clothing, environment, and camera viewpoint without redescribing them.\n\nThe person reacts with excitement and surprise as if they have just read an interesting caption at the center of the screen. They must use their FREE HAND for one clear gesture: point their index finger toward the center of the video, reach to the back of their head, sweep an open hand across the center of the frame, bring a hand to their face in shock, or another realistic gesture that unmistakably signals excitement and surprise. Invent variations in gesture direction, timing, head movement, gaze, and facial expression. Keep the other hand consistent with holding the phone outside the frame. Do not generate captions or text; these will be added later.\n\nRandomly choose either a short spoken Russian reaction or an expressive reaction without speech. Spoken reactions must be ONLY in Russian and contain ONE TO THREE WORDS TOTAL for the entire video. Examples: «Вот это да», «Ух ты», «Ничего себе». Invent other natural one-to-three-word Russian expressions of excitement or surprise. No extra dialogue, narration, second utterance, or non-Russian speech. Allow natural synchronized lip movements when speaking. For a reaction without speech, the person may open their mouth and raise their eyebrows in excitement.\n\nKeep one coherent, plausible gesture and optional brief utterance within the clip duration. Avoid complicated action sequences, impossible hand positions, obstructing the face for the whole clip, or changing the scene. Make each generated reaction different.\n\nFollow the Fixed video instructions without repeating or rewriting them. Return only the unique motion and speech instructions. End with exactly one speech declaration: Speech: «the Russian phrase» or Speech: none. Do not leave choices, alternatives, or placeholders in the result.";
export const VIDEO_FIXED_INSTRUCTIONS =
  "Animate the provided starting frame into one continuous, unedited, self recorded smartphone video, vertical 9:16, real time speed, of the person in the frame naturally acting surprised. No description of the person or people, no visible camera, no crew reflections. No flicker in teeth, jewelry, clothing patterns, or hair texture. No face melting, no background warping, no sudden lighting changes. Make the sound as if it was recorded on iPhone default microphone in this exact location at this exact distance to the phone. Raw unedited smartphone footage as it would look uploaded straight to TikTok.";
export function reactionPromptSettings(p: Project) {
  return {
    videoPromptMode: "randomized" as const,
    videoPrompt:
      p.videoPromptMode === "randomized" ? p.videoPrompt : VIDEO_PROMPT,
    videoFixedInstructions:
      p.videoPromptMode === "randomized"
        ? (p.videoFixedInstructions ?? "")
        : VIDEO_FIXED_INSTRUCTIONS,
  };
}
export function newProject(): Project {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    createdAt: now,
    updatedAt: now,
    step: 0,
    skipped: [],
    imagePrompt: IMAGE_PROMPT,
    imageFixedInstructions: IMAGE_FIXED_INSTRUCTIONS,
    imageVariation: 100,
    imageCount: 4,
    imageModel: "black-forest-labs/flux-1.1-pro-t2i",
    imagePromptModel: "openai/gpt-4.1-mini",
    imageAspectRatio: "9:16",
    videoPrompt: VIDEO_PROMPT,
    videoPromptMode: "randomized",
    videoAudio: "generated",
    videoFreezeLips: false,
    videoMatchEndFrame: false,
    videoFixedInstructions: VIDEO_FIXED_INSTRUCTIONS,
    videoCount: 1,
    videoModel: "bytedance/seedance-1.5-pro-i2v",
    videoPromptModel: "openai/gpt-4.1-mini",
    videoAspectRatio: "9:16",
    videoDuration: 5,
    frameIds: [],
    reactionIds: [],
    demoIds: [],
    musicIds: [],
    musicMode: "none",
    hooks: [],
    hookCount: 10,
    hookVirality: DEFAULT_HOOK_VIRALITY,
    language: "English",
    productId: "",
    composition: {
      aspectRatio: "9:16",
      style: "Text",
      hookSpan: "reaction",
      musicSpan: "whole",
      position: "middle",
      fontSize: 48,
      fontId: DEFAULT_HOOK_FONT,
      textWallDuration: 7,
      fit: "cover",
      musicVolume: 0.3,
      sourceVolume: 1,
      textLayoutVersion: 2,
      presenterId: "",
      backgroundId: "",
      presenterScale: 0.65,
      keyColor: "#00ff00",
      keySimilarity: 0.18,
      keyBlend: 0.08,
    },
    rowOverrides: {},
  };
}
export function spanWindow(
  span: Span,
  reactionDuration: number,
  demoDuration: number,
): [number, number] {
  if (span === "reaction") return [0, reactionDuration];
  if (span === "demo")
    return [reactionDuration, reactionDuration + demoDuration];
  return [0, reactionDuration + demoDuration];
}
function choices(values: string[]): (string | null)[] {
  return values.length ? values : [null];
}
export function activeHooks(p: Project) {
  return p.skipped.includes(3)
    ? []
    : p.hooks.filter((h) =>
        h.enabled !== false && (p.composition.style === "IMG" ? !!h.imageId : !!h.text.trim()),
      );
}
export function effectiveProject(p: Project): Project {
  return {
    ...p,
    hooks: activeHooks(p),
    reactionIds: p.skipped.includes(4) ? [] : p.reactionIds,
    demoIds: p.skipped.includes(5) ? [] : p.demoIds,
    musicMode: p.skipped.includes(6) ? "none" : p.musicMode,
  };
}
export function combinationCount(p: Project): number {
  p = effectiveProject(p);
  return (
    Math.max(1, p.hooks.length) *
    Math.max(1, p.reactionIds.length) *
    Math.max(1, p.demoIds.length) *
    (p.musicMode === "selected" ? Math.max(1, p.musicIds.length) : 1)
  );
}
// Indexed access keeps outlines and large Cartesian products out of browser memory.
export function combinationAt(p: Project, index: number): RenderRow {
  p = effectiveProject(p);
  const hooks = p.hooks.length ? p.hooks.map((h) => h.id) : [null];
  const reactions = choices(p.reactionIds),
    demos = choices(p.demoIds);
  const music = p.musicMode === "selected" ? choices(p.musicIds) : [null];
  let n = index;
  const m = music[n % music.length];
  n = Math.floor(n / music.length);
  const d = demos[n % demos.length];
  n = Math.floor(n / demos.length);
  const r = reactions[n % reactions.length];
  n = Math.floor(n / reactions.length);
  const h = hooks[n % hooks.length];
  const id = [h, r, d, m].map((x) => x || "-").join(":");
  return {
    id,
    hookId: h,
    reactionId: r,
    demoId: d,
    musicId: m,
    ...p.rowOverrides[id],
  };
}
export function excludedCount(p: Project): number {
  const q = effectiveProject(p),
    dimensions = [
      choices(q.hooks.map((h) => h.id)),
      choices(q.reactionIds),
      choices(q.demoIds),
      q.musicMode === "selected" ? choices(q.musicIds) : [null],
    ];
  return Object.entries(p.rowOverrides).filter(
    ([id, row]) =>
      row.excluded &&
      id.split(":").length === 4 &&
      id
        .split(":")
        .every((part, i) => dimensions[i].includes(part === "-" ? null : part)),
  ).length;
}
export function resolveChoices(prompt: string, index: number): string {
  let n = index;
  return prompt.replace(/\[([^\[\]]+)\]/g, (full, content: string) => {
    const values = content
      .split("/")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length < 2) return full;
    const value = values[n % values.length];
    n = Math.floor(n / values.length);
    return value;
  });
}
