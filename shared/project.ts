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
  "A candid vertical smartphone portrait of a [woman/man] in a [sunlit kitchen/cozy living room/bright home office], looking at the camera, a natural surprised expression. Authentic UGC, realistic skin, soft daylight, no text or logos.";
export const VIDEO_PROMPT =
  "The person reacts with [delighted surprise/curious disbelief/an excited smile], small natural head movements, looking at the camera. Handheld smartphone footage, authentic and candid.";
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
    imageCount: 4,
    imageModel: "black-forest-labs/flux-1.1-pro-t2i",
    videoPrompt: VIDEO_PROMPT,
    videoCount: 1,
    videoModel: "bytedance/seedance-1.5-pro-i2v",
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
