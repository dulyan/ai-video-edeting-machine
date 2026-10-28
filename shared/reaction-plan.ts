import type { Model } from "./types.ts";
export function outputDuration(value: number) {
  return value > 0 ? Math.min(5, value) : 5;
}
export function providerDuration(model: Model, limit: number) {
  const durations = (model.durations || [])
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (durations.length)
    return durations.find((n) => n >= limit) ?? durations[durations.length - 1];
  if (model.durations?.includes(-1)) return -1;
  const field =
    model.schema?.properties?.duration || model.schema?.properties?.seconds;
  return Math.min(
    field?.maximum ?? limit,
    Math.max(field?.minimum ?? limit, limit),
  );
}
export function validReactionSpeech(description: string) {
  const spoken = [
    ...description.matchAll(
      /Speech:\s*(?:\u00ab([^\u00bb]*)\u00bb|(none)\.)/gi,
    ),
  ];
  if (spoken.length !== 1) return false;
  const match = spoken[0];
  const prefix = description.slice(0, match.index);
  if (
    /["\u00ab\u00bb\u0410-\u044f\u0401\u0451]/.test(prefix) ||
    !/^[.\s]*$/.test(description.slice(match.index! + match[0].length))
  )
    return false;
  if (spoken[0][2]) return true;
  const phrase = spoken[0][1].trim();
  const words =
    phrase.match(
      /[\u0410-\u044f\u0401\u0451]+(?:-[\u0410-\u044f\u0401\u0451]+)*/g,
    ) || [];
  return (
    words.length >= 1 &&
    words.length <= 3 &&
    /^[\u0410-\u044f\u0401\u0451\s!?.,\u2026-]+$/.test(phrase)
  );
}

export function assignReactionFrames(
  ids: string[],
  count: number,
  random = Math.random,
) {
  const assigned = ids.flatMap((id) => Array(count).fill(id) as string[]);
  for (let i = assigned.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [assigned[i], assigned[j]] = [assigned[j], assigned[i]];
  }
  return assigned;
}
