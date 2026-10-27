import { getSecret } from "./store.ts";
import type { Model } from "../shared/types.ts";
import { PromptParser } from "./prompt-parser.ts";

// Stream prompt text without assuming that JSON or prompt content fits on one line.
export async function streamPrompts(
  system: string,
  message: string,
  model: Model,
  onPrompt: (prompt: string) => void,
  onDraft: (draft: string) => void,
  signal?: AbortSignal,
  onTiming?: (timing: {
    firstTextMs?: number;
    durationMs: number;
    outputChars: number;
    reasoningTokens?: number;
    outputTokens?: number;
  }) => void,
) {
  const key = getSecret("siray");
  if (!key) throw new Error("Add your Siray API key in Settings first");
  const fields = model.schema?.properties;
  const started = Date.now();
  let firstTextMs: number | undefined,
    outputChars = 0,
    usage: any;
  const response = await fetch("https://api.siray.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      stream: true,
      max_tokens: Math.min(
        Math.max(2000, Math.ceil(message.length / 2) + 1500),
        fields?.max_tokens?.maximum || 12000,
        12000,
      ),
      ...(/^openai\/gpt-5(?:-(?:nano|mini))?$/.test(model.id)
        ? { reasoning_effort: "minimal" }
        : {}),
      ...(/^openai\/gpt-(?:4o|4\.1|5(?:-(?:nano|mini))?$)/.test(model.id)
        ? { response_format: { type: "json_object" } }
        : {}),
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.any([
      ...(signal ? [signal] : []),
      AbortSignal.timeout(180000),
    ]),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error?.message ||
        error.message ||
        `Siray returned ${response.status}`,
    );
  }
  const parser = new PromptParser(onPrompt, onDraft);
  function content(text: string) {
    firstTextMs ??= Date.now() - started;
    outputChars += text.length;
    parser.push(text);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json();
    if (
      data.success === false ||
      data.error?.message ||
      (data.code && !["success", 200, "200"].includes(data.code))
    )
      throw new Error(
        data.error?.message || data.message || "Siray prompt generation failed",
      );
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim())
      throw new Error("The text model returned no prompt content");
    usage = data.usage;
    content(text);
  } else {
    if (!response.body) throw new Error("Siray returned an empty stream");
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    let complete = false;
    try {
      while (!complete) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, boundary).trim();
          buffer = buffer.slice(boundary + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            complete = true;
            break;
          }
          const event = JSON.parse(data);
          if (event.error)
            throw new Error(event.error.message || "Siray streaming failed");
          if (event.usage) usage = event.usage;
          const text = event.choices?.[0]?.delta?.content;
          if (typeof text === "string") content(text);
        }
        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  parser.finish();
  onTiming?.({
    firstTextMs,
    durationMs: Date.now() - started,
    outputChars,
    reasoningTokens:
      usage?.completion_tokens_details?.reasoning_tokens ??
      usage?.reasoning_tokens,
    outputTokens: usage?.completion_tokens,
  });
}
