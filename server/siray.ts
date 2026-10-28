import { freezeInputs } from "../shared/freeze-lips.ts";
import { getSecret } from "./store.ts";
import { MODELS } from "../shared/models.ts";
import { modelPayload } from "../shared/catalog.ts";
import type { Model } from "../shared/types.ts";
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
export async function chatJSON(
  system: string,
  message: string,
  model?: string,
  definition?: Model,
): Promise<any> {
  const modelId = model || getSecret("textModel") || "openai/gpt-4.1-mini";
  const fields = (definition || MODELS.find((m) => m.id === modelId))?.schema
    ?.properties;
  const response = await siray("/v1/chat/completions", {
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: message },
    ],
    ...(!fields || fields.temperature ? { temperature: 0.95 } : {}),
    max_tokens: Math.min(8000, fields?.max_tokens?.maximum || 8000),
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
  inputs: Record<string, unknown> = {},
  catalog: Model[] = MODELS,
  controls: { freezeLips?: boolean; matchEndFrame?: boolean } = {},
) {
  const model = catalog.find((m) => m.id === modelId);
  if (!model) throw new Error("Unsupported model");
  return modelPayload(
    model,
    prompt,
    seed,
    duration,
    image,
    freezeInputs(
      model,
      inputs,
      controls.freezeLips,
      controls.matchEndFrame,
      image,
    ),
  );
}
