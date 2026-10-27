import type { Model } from "./types.ts";
export const RATIOS = [
  "9:16",
  "16:9",
  "1:1",
  "4:5",
  "3:4",
  "4:3",
  "3:2",
  "2:3",
  "21:9",
] as const;
export function ratioValue(ratio: string) {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) throw new Error("Choose a valid aspect ratio");
  return w / h;
}
export function outputResolution(ratio = "9:16") {
  const value = ratioValue(ratio);
  return value >= 1
    ? [Math.round((1080 * value) / 2) * 2, 1080]
    : [1080, Math.round(1080 / value / 2) * 2];
}
export function ratioInputs(
  model: Model,
  ratio: string,
  inputs: Record<string, unknown>,
) {
  const p = model.schema?.properties || {},
    next = { ...inputs };
  if (
    p.aspect_ratio &&
    (!p.aspect_ratio.enum || p.aspect_ratio.enum.includes(ratio))
  )
    next.aspect_ratio = ratio;
  else if (p.aspect_ratio)
    next.aspect_ratio = p.aspect_ratio.enum?.includes("adaptive")
      ? "adaptive"
      : p.aspect_ratio.enum?.[0];
  const sizes = (p.size?.enum || []).filter(
    (s): s is string => typeof s === "string" && /^\d+x\d+$/.test(s),
  );
  if (sizes.length) {
    const requested = ratioValue(ratio);
    const sorted = sizes.toSorted((a, b) => {
      const [aw, ah] = a.split("x").map(Number),
        [bw, bh] = b.split("x").map(Number);
      return Math.abs(aw / ah - requested) - Math.abs(bw / bh - requested);
    });
    next.size = sorted[0];
  }
  return next;
}
export function nativeRatio(model: Model, ratio: string) {
  const p = model.schema?.properties || {};
  if (p.aspect_ratio?.enum?.includes(ratio)) return true;
  return (p.size?.enum || []).some((s) => {
    if (typeof s !== "string" || !/^\d+x\d+$/.test(s)) return false;
    const [w, h] = s.split("x").map(Number);
    return Math.abs(w / h - ratioValue(ratio)) < 0.01;
  });
}
export function isTextToImage(model: Model) {
  return (
    model.kind === "image" &&
    (model.tag === "text-to-image" ||
      (!model.tag && /t2i|text.to.image/i.test(model.id)))
  );
}
export function isImageToVideo(model: Model) {
  return (
    model.kind === "video" &&
    model.tag !== "video-to-video" &&
    model.tag !== "text-to-video" &&
    !/motion.control|v2v|extension/.test(model.id) &&
    (model.tag === "image-to-video" || /i2v|ref2v|se2v/.test(model.id))
  );
}
