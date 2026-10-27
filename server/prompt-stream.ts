import { getSecret } from "./store.ts";
import type { Model } from "../shared/types.ts";

// Parse newline-delimited prompt objects as soon as the provider finishes each line.
export async function streamPrompts(
  system: string,
  message: string,
  model: Model,
  onPrompt: (prompt: string) => void,
  onDraft: (draft: string) => void,
  signal?: AbortSignal,
) {
  const key = getSecret("siray");
  if (!key) throw new Error("Add your Siray API key in Settings first");
  const fields = model.schema?.properties;
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
      max_tokens: Math.min(12000, fields?.max_tokens?.maximum || 12000),
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
  let pending = "";
  function content(text: string) {
    pending += text;
    let end: number;
    while ((end = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, end).trim();
      pending = pending.slice(end + 1);
      linePrompt(line);
    }
    onDraft(
      pending
        .replace(/^\s*\{\s*"prompt"\s*:\s*"?/, "")
        .replace(/"?\s*}\s*$/, "")
        .replaceAll("\\n", "\n")
        .replaceAll('\\"', '"'),
    );
  }
  function linePrompt(line: string) {
    if (!line || line.startsWith("```")) return;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(
        "The text model returned an invalid prompt line. Completed prompts have been kept; retry to continue.",
      );
    }
    if (typeof parsed.prompt !== "string" || !parsed.prompt.trim())
      throw new Error("The text model returned an empty prompt");
    onPrompt(parsed.prompt.trim());
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
  if (pending.trim()) linePrompt(pending.trim());
  onDraft("");
}
