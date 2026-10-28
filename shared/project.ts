import type { Project, RenderRow, Span } from "./types.ts";
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
export const IMAGE_PROMPT =
  "Invent one highly specific fictional adult Russian national of Slavic heritage, aged 23-32, preparing to leave their own home for the gym. Make the person handsome or beautiful, athletic, visibly fit, well groomed, stylish, and affluent. Vary gender and individual appearance naturally without ethnic stereotypes or caricatures.\n\nDescribe exact age, facial features, skin texture, hairstyle, grooming, a coordinated gym outfit, and tasteful accessories. Give the person two or three distinct character traits expressed through visible posture, styling, and personal details. Convey wealth through quality, fit, materials, and a well-appointed lived-in home rather than prominent branding.\n\nDescribe a specific area of the home, two to four meaningful background elements, and plausible gym-preparation details. Vary seasons, interiors, clothing, and personal style while keeping weather, outerwear, time of day, and lighting physically consistent.\n\nConsult the separate Reference poses field for every output. Choose one suitable reference or a coherent adaptation, and translate it into a concrete still-frame description of facial expression, emotional intent, eye direction, head angle, upper-body posture, and any visible hand gesture or gym-preparation action. Use different suitable references across outputs where possible. Treat the references as inspiration, not wording to copy or a checklist of poses to combine. If the field is empty, invent an appropriate pose.\n\nThe person should look happily surprised, curious, and excited by a discovery, eager to share it without appearing to speak. Keep the mouth completely closed, with upper and lower lips touching throughout. A smile must remain closed-lipped; no teeth, parted lips, or speaking mouth shape. Make every pose compatible with the fixed framing, selfie camera, gym-preparation setting, and realistic anatomy. Express emotional intent through visible cues rather than abstract labels.\n\nFollow the Fixed image instructions as mandatory constraints. Never repeat or rewrite them. Variation controls breadth of invention, never specificity or realism.\n\nReturn only one cohesive, richly detailed description of one person in one scene at one instant. No alternatives, unresolved placeholders, pose names without descriptions, commentary, or motion sequences.";
export const IMAGE_FIXED_INSTRUCTIONS =
  "Create one realistic starting frame for a casual UGC smartphone selfie video. Use the accompanying generated description for the individual person, outfit, setting, season, expression, pose, and visible action.\n\nShow one fictional young adult aged 23-32: a Russian national of Slavic heritage who is handsome or beautiful, athletic, fit, stylish, well groomed, and affluent. They are inside their own stylish, lived-in home, preparing to leave for the gym. Represent the person naturally without stereotypes, exaggerated anatomy, or plastic skin.\n\nThe expression must convey happy surprise, curious delight, and eager positive energy. Keep the mouth completely closed, with upper and lower lips firmly together. No gap between the lips, visible teeth, open-mouth surprise, or speaking mouth shape. Express emotion through the eyes and eyebrows and a closed-lip smile. The generated description determines the specific eyebrow position, head angle, posture, gesture, and action inspired by the reference poses. Show only one coherent pose at one instant, never a collage or sequence.\n\nUse a front-facing smartphone selfie viewpoint near eye level, at normal conversational distance. Frame the head to upper chest with casual headroom, leaving room for plausible upper-body gestures. Keep hands anatomically natural; gestures must be compatible with holding the phone outside the frame. No visible phone or camera, extra hands, or impossible poses.\n\nMaintain believable home-before-the-gym context, tasteful coordinated clothing, and seasonal consistency. Lighting must come from plausible windows or household fixtures and fall consistently across the face and background.\n\nUse ordinary phone-video quality: mild compression, subtle noise, softened fine detail, natural skin texture, slightly imperfect exposure, and recognizable background detail. No studio lighting, glamour retouching, cinematic grading, dramatic bokeh, artificial HDR, or excessive sharpening.\n\nNo captions, text, watermarks, social-media interfaces, borders, readable labels, or prominent logos. Follow the app's selected aspect ratio.";
export const VIDEO_PROMPT =
  "Animate the supplied starting frame into one continuous, unedited, self-recorded smartphone video at real-time speed.\n\nChoose one specific, realistic sequence of character actions that suits the existing setting, posture, and character. Show delighted surprise, curious disbelief, and a warm excited smile, as if the person has just discovered something interesting. Convey eagerness entirely through nonverbal reactions.\n\nUse a natural progression of subtle facial expressions, eyebrow movements, head movements, eye contact, and optional hand gestures within the selected clip duration. Keep gestures physically plausible and compatible with holding a phone for a selfie recording.\n\nThe person must not speak, whisper, narrate, mouth words, or lip-sync. Do not simulate a conversation or form syllables. Keep the lips gently together or in a small relaxed smile. Avoid repeated jaw opening, talking-like mouth movements, laughter, gasps, and other vocalizations. Express surprise through the eyes, eyebrows, smile, head, and hands instead of speech.\n\nPreserve the starting frame's identity, appearance, clothing, environment, and lighting. Do not redesign the person or scene. No exaggerated acting, repetitive movements, or abrupt gestures.\n\nKeep a believable handheld selfie perspective. No visible camera, crew reflections, cuts, transitions, face melting, background warping, sudden lighting changes, or flickering teeth, jewelry, clothing patterns, or hair texture. Raw, natural smartphone footage with no captions, watermarks, or cinematic effects.\n\nApply these instructions directly to the animation. Do not return a written description or generate a separate prompt. Use this same guidance for every selected starting frame.";
export const VIDEO_FIXED_INSTRUCTIONS =
  "Animate the provided starting frame into one continuous, unedited, self-recorded smartphone video, vertical 9:16, at real-time speed. Preserve the person's identity, appearance, clothing, setting, and lighting from the starting frame. The person remains silent while showing natural, happy surprise without speaking or mouthing words. Keep the mouth relaxed; no syllabic lip or jaw movements. No spoken words, lip-sync, narration, music, or added sound effects. Use only subtle location-appropriate ambient sound, with the character of an iPhone default microphone recording in this exact location at this exact distance. No description or redesign of the person or people, no visible camera, no crew reflections, no cuts or transitions. No flicker in teeth, jewelry, clothing patterns, or hair texture; no face melting, background warping, or sudden lighting changes. Raw, unedited smartphone footage as it would look uploaded straight to TikTok.";
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
    imageReferencePoses: [],
    imageVariation: 50,
    imageCount: 4,
    imageModel: "black-forest-labs/flux-1.1-pro-t2i",
    imagePromptModel: "openai/gpt-4.1-mini",
    imageAspectRatio: "9:16",
    videoPrompt: VIDEO_PROMPT,
    videoAudio: "silent",
    videoFreezeLips: true,
    videoMatchEndFrame: true,
    videoFixedInstructions: "",
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
