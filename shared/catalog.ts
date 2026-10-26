import type { Model, ModelField } from "./types.ts";

export function normalizeCatalog(entries: any[]): Model[] {
  return entries
    .flatMap((entry): Model[] => {
      const id = entry.model_name || entry.id;
      if (typeof id !== "string") return [];
      let schema = entry.schema;
      try {
        schema ||= JSON.parse(entry.model_extend_info || "{}");
      } catch {
        schema = {};
      }
      const tag = entry.tag || "",
        endpoints = entry.supported_endpoint_types || [];
      const kind = /3d/.test(tag)
        ? undefined
        : /image$/.test(tag) || endpoints.includes("image-generation")
          ? "image"
          : /video$/.test(tag) ||
              endpoints.some((e: string) =>
                ["video-generation", "openai-video"].includes(e),
              )
            ? "video"
            : ["chat", "multi-modal"].includes(tag) ||
                endpoints.some((e: string) =>
                  ["openai", "anthropic", "gemini", "openai-response"].includes(
                    e,
                  ),
                )
              ? "text"
              : undefined;
      if (!kind) return [];
      const duration =
        schema.properties?.duration || schema.properties?.seconds;
      const durations =
        duration?.enum?.map(Number).filter(Number.isFinite) ||
        (duration?.minimum && duration?.maximum
          ? Array.from(
              { length: Math.min(60, duration.maximum - duration.minimum + 1) },
              (_, i) => i + duration.minimum,
            )
          : undefined);
      return [
        {
          id,
          name: entry.name || id,
          kind,
          tag,
          provider: entry.creator || entry.owned_by || id.split("/")[0],
          schema,
          durations,
          active: !["retired"].includes(entry.status),
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function fieldDefault(name: string, field: ModelField): unknown {
  if (name === "aspect_ratio" && field.enum?.includes("9:16")) return "9:16";
  if (name === "size" && field.enum?.includes("720p")) return "720p";
  if (name === "size" && field.enum?.includes("1440x2560")) return "1440x2560";
  if (field.default !== undefined) return field.default;
  if (field.enum?.length) return field.enum[0];
  if (field.type === "boolean") return false;
  if (field.type === "number" || field.type === "integer")
    return field.minimum ?? 1;
  return undefined;
}

export function isAutoFrameField(name: string) {
  return [
    "image",
    "image_url",
    "first_frame",
    "first_frame_image",
    "start_image",
    "images",
    "reference_images",
  ].includes(name);
}

export function modelPayload(
  model: Model,
  prompt: string,
  seed: number,
  duration?: number,
  image?: string,
  inputs: Record<string, unknown> = {},
) {
  const properties = model.schema?.properties || {};
  const body: Record<string, unknown> = { model: model.id, prompt };
  if (!Object.keys(properties).length) return { ...inputs, ...body };
  for (const [name, field] of Object.entries(properties)) {
    if (["model", "prompt"].includes(name)) continue;
    let value = inputs[name];
    if (["n", "num_images", "num_outputs"].includes(name)) value = 1;
    if (name === "enable_sequential") value = false;
    if (name === "seed") value = seed;
    if (["duration", "seconds"].includes(name) && duration !== undefined)
      value = duration;
    if (image && isAutoFrameField(name))
      value =
        field.type === "array"
          ? [image, ...(Array.isArray(value) ? value : [])]
          : image;
    if (value === undefined || value === "") {
      if (!model.schema?.required?.includes(name)) continue;
      value = fieldDefault(name, field);
    }
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    ) {
      throw new Error(`Provide ${name.replaceAll("_", " ")} for ${model.name}`);
    }
    if (field.enum && !field.enum.includes(value as any))
      throw new Error(`Choose a supported ${name} for ${model.name}`);
    if (
      field.type === "array" &&
      (!Array.isArray(value) ||
        (field.minItems !== undefined && value.length < field.minItems) ||
        (field.maxItems !== undefined && value.length > field.maxItems))
    )
      throw new Error(`Choose a supported number of ${name} for ${model.name}`);
    if (field.type === "string" && typeof value !== "string")
      throw new Error(`Enter valid ${name} for ${model.name}`);
    if (
      ["number", "integer"].includes(field.type || "") &&
      (typeof value !== "number" ||
        !Number.isFinite(value) ||
        (field.minimum !== undefined && value < field.minimum) ||
        (field.maximum !== undefined && value > field.maximum))
    )
      throw new Error(`Choose a supported ${name} for ${model.name}`);
    body[name] = value;
  }
  return body;
}
