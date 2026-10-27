export type ReferencePoses = string | string[];
export function poseEntries(value?: ReferencePoses): string[] {
  if (Array.isArray(value)) return value;
  return value
    ? value.split(/\r?\n/).filter((pose) => pose.trim().length > 0)
    : [];
}
export function generationPoses(value?: ReferencePoses): ReferencePoses {
  return Array.isArray(value)
    ? value.filter((pose) => pose.trim().length > 0)
    : (value ?? "");
}
export function formatPoses(value?: ReferencePoses): string {
  return Array.isArray(value)
    ? value
        .filter((pose) => pose.trim().length > 0)
        .map((pose, i) => "Pose " + (i + 1) + ":\n" + pose)
        .join("\n\n")
    : (value ?? "");
}
