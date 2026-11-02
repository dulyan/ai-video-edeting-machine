import type {Model, ModelField} from "./types.ts";

export interface VidGenDraft { modelId: string; inputsByModel: Record<string, Record<string, unknown>> }
export function vidGenMediaType(name:string,field:ModelField): "image"|"video"|"audio"|undefined {
  const format=String(field["x-format"] || field.items?.["x-format"] || "");
  if (["image","video","audio"].includes(format)) return format as "image"|"video"|"audio";
  const leaf=name.replace(/\[\d+\]$/,"").split(".").at(-1) || name;
  if (/^(images?|image_url|reference_images|first_frame|last_frame|first_frame_image|end_image|frontal_image)$/.test(leaf)) return "image";
  if (/^(videos?|video_url)$/.test(leaf)) return "video";
  if (/^(audios?|audio_url)$/.test(leaf)) return "audio";
}
export function vidGenDefault(field: ModelField): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  if (field.enum?.length) return field.enum[0];
  if (field.type === "boolean") return false;
  if (field.type === "integer" || field.type === "number") return field.minimum ?? 0;
  if (field.type === "array") return [];
  if (field.type === "object") return {};
  return "";
}
export function vidGenInitialInputs(model: Model) {
  return Object.fromEntries(Object.entries(model.schema?.properties || {}).filter(([name]) => name !== "model" && model.schema?.required?.includes(name)).map(([name,field])=>[name,vidGenDefault(field)]));
}
function validate(value: unknown, field: ModelField, name: string): void {
  if (field.enum && !field.enum.some(v=>Object.is(v,value))) throw new Error(`Choose a supported ${name}.`);
  const type=field.type;
  if (type === "string") {
    if (typeof value !== "string") throw new Error(`${name} must be text.`);
    if (typeof field.minLength === "number" && value.length < field.minLength || typeof field.maxLength === "number" && value.length > field.maxLength) throw new Error(`${name} has an unsupported text length.`);
  } else if(type === "number" || type === "integer") {
    if(typeof value !== "number" || !Number.isFinite(value) || type === "integer" && !Number.isInteger(value)) throw new Error(`${name} must be ${type === "integer" ? "an integer" : "a number"}.`);
    if(field.minimum !== undefined && value < field.minimum || field.maximum !== undefined && value > field.maximum) throw new Error(`${name} is outside the supported range.`);
  } else if(type === "boolean") {
    if(typeof value !== "boolean") throw new Error(`${name} must be true or false.`);
  } else if(type === "array") {
    if(!Array.isArray(value)) throw new Error(`${name} must be an array.`);
    if(field.minItems !== undefined && value.length < field.minItems || field.maxItems !== undefined && value.length > field.maxItems) throw new Error(`${name} has an unsupported number of items.`);
    value.forEach((v,i)=>validate(v,field.items || {},`${name}[${i}]`));
  } else if(type === "object") {
    if(!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`);
    const properties=(field.properties || {}) as Record<string,ModelField>;
    for(const required of (field.required || []) as string[]) if((value as any)[required] === undefined || (value as any)[required] === "") throw new Error(`Provide ${name}.${required}.`);
    for(const [key,v] of Object.entries(value)) {
      if(properties[key])validate(v,properties[key],`${name}.${key}`);
      else if(field.additionalProperties === false)throw new Error(`Unsupported field ${name}.${key}.`);
    }
  }
}
// This tool deliberately does not use Studio's payload builder: it must retain
// operator-selected seeds, output counts, audio flags and native durations.
export function vidGenPayload(model: Model, inputs: Record<string,unknown>) {
  if(model.kind !== "video")throw new Error("Choose a video model.");
  const properties=model.schema?.properties || {};
  const body:Record<string,unknown>={model:model.id};
  for(const [name,value] of Object.entries(inputs)) {
    if(name === "model" || value === undefined)continue;
    if(Object.keys(properties).length && !properties[name])throw new Error(`Unsupported model setting: ${name}.`);
    validate(value,properties[name] || {},name);
    Object.defineProperty(body,name,{value,enumerable:true,configurable:true,writable:true});
  }
  for(const name of model.schema?.required || []) {
    if(name === "model")continue;
    if(body[name] === undefined || typeof body[name] === "string" && !(body[name] as string).trim() || Array.isArray(body[name]) && !(body[name] as unknown[]).length)throw new Error(`Provide ${name}.`);
  }
  return body;
}
