import type { Project, RenderRow, Span } from "./types.ts";
export const STEPS = [
  "Project name",
  "First frames",
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
export const IMAGE_PROMPT =
  "Invent a different believable adult and everyday setting for each output. Describe the person's specific appearance, casual clothing, ordinary personal details, and lived-in surroundings in rich detail. Choose the details yourself and make the person, environment, and lighting physically consistent. Respect the fixed image instructions.";
export const IMAGE_FIXED_INSTRUCTIONS =
  "Create a realistic casual UGC smartphone selfie frame. Use ordinary phone-video camera quality, natural skin texture, slightly imperfect framing, and physically plausible lighting. The person looks into the camera with a naturally surprised expression. No glamour retouching, cinematic grading, text, captions, watermarks, interfaces, or logos.";
export const VIDEO_PROMPT =
  "Choose realistic character actions and movements that suit the provided starting frame, background, posture, and character. The person remains silent while showing delighted surprise, curious disbelief, and an excited smile, as if they have just discovered something interesting and are eager to share it with the viewer. Use varied but subtle facial expressions, natural head movements, direct eye contact, and optional physically plausible hand gestures. Keep movements coherent throughout the clip and preserve the person, clothing, setting, and lighting from the starting frame. No speech or lip-sync.";
export const VIDEO_FIXED_INSTRUCTIONS =
  "Animate the provided starting frame into one continuous, unedited, self-recorded smartphone video, vertical 9:16, at real-time speed. Preserve the person's identity, appearance, clothing, setting, and lighting from the starting frame. The person remains silent while showing natural, happy surprise and an eager desire to share their discovery with the viewer. No spoken words, lip-sync, narration, music, or added sound effects. Use only subtle location-appropriate ambient sound, with the character of an iPhone default microphone recording in this exact location at this exact distance. No description or redesign of the person or people, no visible camera, no crew reflections, no cuts or transitions. No flicker in teeth, jewelry, clothing patterns, or hair texture; no face melting, background warping, or sudden lighting changes. Raw, unedited smartphone footage as it would look uploaded straight to TikTok.";
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
    imageVariation: 50,
    imageCount: 4,
    imageModel: "black-forest-labs/flux-1.1-pro-t2i",
    imagePromptModel: "openai/gpt-4.1-mini",
    imageAspectRatio: "9:16",
    videoPrompt: VIDEO_PROMPT,
    videoFixedInstructions: VIDEO_FIXED_INSTRUCTIONS,
    videoVariation: 50,
    videoCount: 1,
    videoModel: "bytedance/seedance-1.5-pro-i2v",
    videoPromptModel: "openai/gpt-4.1-mini",
    videoAspectRatio: "9:16",
    videoDuration: 8,
    frameIds: [],
    reactionIds: [],
    demoIds: [],
    musicIds: [],
    musicMode: "none",
    hooks: [],
    hookCount: 10,
    language: "English",
    productId: "",
    composition: {
      aspectRatio: "9:16",
      style: "Text",
      hookSpan: "reaction",
      musicSpan: "whole",
      position: "middle",
      fontSize: 48,
      textWallDuration: 7,
      fit: "cover",
      musicVolume: 0.3,
      sourceVolume: 1,
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
        p.composition.style === "IMG" ? !!h.imageId : !!h.text.trim(),
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
