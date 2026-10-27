import type { Model } from "./types.ts";
export const REACTION_AUDIO_FIELDS = [
  "generate_audio",
  "enable_audio",
  "with_audio",
  "audio_enabled",
];
export function reactionConstraints(audio: "silent" | "ambient" = "silent") {
  return (
    "REACTION PERFORMANCE REQUIREMENT: This is a nonverbal reaction, not a talking-head performance. The person does not speak, whisper, mouth words, or lip-sync. Keep the lips gently together or in a small relaxed smile; no repeated jaw opening or syllabic mouth movements. Express delighted surprise through eyes, eyebrows, a smile, head movement, and natural hand gestures. No dialogue or quoted phrases. The person reacts to a discovery without telling or explaining it. " +
    (audio === "silent"
      ? "OUTPUT AUDIO: Completely silent video. No voice, breathing, vocalizations, music, sound effects, or ambient audio, even if earlier instructions request microphone sound."
      : "OUTPUT AUDIO: Environmental room tone only. No human voice, speech, whisper, laughter, or vocalizations.")
  );
}
export function reactionInputs(
  model: Model,
  inputs: Record<string, unknown>,
  audio: "silent" | "ambient" = "silent",
) {
  const result = { ...inputs };
  const fields = model.schema?.properties || {};
  if (audio === "silent")
    for (const name of REACTION_AUDIO_FIELDS) {
      if (fields[name]?.type === "boolean") result[name] = false;
    }
  if (fields.task_type?.enum?.includes("image_to_video"))
    result.task_type = "image_to_video";
  return result;
}

export function reactionInstructions(
  prompt: string,
  legacyFixed?: string,
): string {
  return legacyFixed ? legacyFixed + "\n\n" + prompt : prompt;
}
