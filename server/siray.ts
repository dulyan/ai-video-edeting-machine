import { getSecret } from "./store.ts";
import { MODELS } from "../shared/models.ts";
export async function siray(
  path: string,
  body?: unknown,
  key = getSecret("siray"),
) {
  if (!key) throw new Error("Add your Siray API key in Settings first.");
  const response = await fetch(`https://api.siray.ai${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const data = (await response.json()) as any;
  if (
    !response.ok ||
    data.success === false ||
    data.error?.message ||
    (data.code && !["success", 200, "200"].includes(data.code))
  )
    throw new Error(
      data.error?.message ||
        data.message ||
        `Siray returned ${response.status}`,
    );
  return data;
}
export async function chatJSON(system: string, message: string): Promise<any> {
  const response = await siray("/v1/chat/completions", {
    model: getSecret("textModel") || "openai/gpt-4.1-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: message },
    ],
    temperature: 0.95,
    max_tokens: 8000,
  });
  const text = response.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(
      text.replace(/^\s*```(?:json)?\s*/, "").replace(/\s*```\s*$/, ""),
    );
  } catch {
    throw new Error(
      "Siray returned an invalid structured text response. Retry this batch.",
    );
  }
}
export function generationPayload(
  modelId: string,
  prompt: string,
  seed: number,
  duration?: number,
  image?: string,
) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error("Unsupported model");
  const body: any = { model: modelId, prompt };
  if (modelId.includes("flux"))
    Object.assign(body, { aspect_ratio: "9:16", output_format: "png", seed });
  if (modelId.includes("seedream"))
    Object.assign(body, {
      size: model.imageSize,
      n: 1,
      enable_sequential: false,
    });
  if (modelId.includes("gemini"))
    body.prompt = `${prompt}\nPortrait 9:16 composition.`;
  if (model.kind === "video") {
    if (!model.durations?.includes(duration!))
      throw new Error("Choose a supported duration for this model");
    Object.assign(body, { image, duration });
    if (modelId.includes("seedance"))
      Object.assign(body, { size: model.size, aspect_ratio: "9:16" });
  }
  return body;
}
