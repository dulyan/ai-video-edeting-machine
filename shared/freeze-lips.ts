import type { Model } from "./types.ts";
export const GOOGLE_I2V = "google/google-omni-1.1-flash-i2v";
export const WAN_I2V = "alibaba/wan-3.0-i2v";
export const END_FRAME_FIELDS = [
  "end_image",
  "last_frame",
  "last_frame_image",
  "end_frame",
  "end_frame_image",
];
export const CFG_FIELDS = ["guidance_scale", "cfg_scale", "cfg"];
export function supportsFreeze(model?: Model | string) {
  const id = typeof model === "string" ? model : model?.id;
  return id === GOOGLE_I2V || id === WAN_I2V;
}
export function endFrameField(model?: Model) {
  return END_FRAME_FIELDS.find(
    (name) => model?.schema?.properties?.[name]?.type === "string",
  );
}
export function cfgField(model?: Model) {
  return CFG_FIELDS.find((name) =>
    ["number", "integer"].includes(
      model?.schema?.properties?.[name]?.type || "",
    ),
  );
}
export function cfgBaseline(model: Model): number | undefined {
  const name = cfgField(model);
  if (!name) return undefined;
  const field = model.schema!.properties![name];
  const target = Math.min(field.maximum ?? 4, Math.max(field.minimum ?? 0, 4));
  if (field.enum)
    return field.enum
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  return target;
}
export function freezeNegative(model: Model) {
  return model.id === GOOGLE_I2V
    ? "talking, speaking, lip-sync, open mouth, whispering, jaw movement, chewing, singing, mouth distortion"
    : "talking, speaking, open mouth, speech, animation of lips, jaw motion, facial distortion";
}
export function freezePrompt(model?: Model, enabled = false) {
  if (!enabled || !supportsFreeze(model)) return "";
  const positive =
    model!.id === GOOGLE_I2V
      ? ", The character's mouth remains completely closed and perfectly still throughout the entire video. Lips are pressed together, jaw is locked, no speaking or talking animation, neutral facial expression, natural blinking only."
      : ", (mouth closed:1.3), tight lips, completely frozen lower face, neutral expression, no mouth movement, silent character, motionless jaw, natural blinking.";
  return (
    positive +
    (model!.schema?.properties?.negative_prompt?.type === "string"
      ? ""
      : "\nAvoid: " + freezeNegative(model!))
  );
}
export function freezeInputs(
  model: Model,
  inputs: Record<string, unknown>,
  enabled = false,
  matchEnd = false,
  image?: string,
) {
  const result = { ...inputs };
  if (!supportsFreeze(model)) return result;
  const properties = model.schema?.properties || {};
  if (enabled) {
    if (properties.negative_prompt?.type === "string") {
      const negative = freezeNegative(model);
      const previous =
        typeof result.negative_prompt === "string"
          ? result.negative_prompt
          : "";
      result.negative_prompt = previous.includes(negative)
        ? previous
        : [previous, negative].filter(Boolean).join(", ");
    }
    if (model.id === WAN_I2V) {
      const cfg = cfgField(model),
        baseline = cfgBaseline(model);
      if (cfg && baseline !== undefined) result[cfg] = baseline;
      if (properties.prompt_expansion_enable?.type === "boolean")
        result.prompt_expansion_enable = false;
    }
  }
  const end = endFrameField(model);
  if (matchEnd && end) {
    if (image) result[end] = image;
    else delete result[end];
  }
  return result;
}
