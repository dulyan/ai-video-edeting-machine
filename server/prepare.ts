import type { Job, Model, PromptRequest } from "../shared/types.ts";
import { textSlot } from "./text-slots.ts";
import { addJob, all, get, patchJob } from "./store.ts";
import { MODELS } from "../shared/models.ts";
import { streamPrompts } from "./prompt-stream.ts";

export async function prepareGeneration(job: Job, signal?: AbortSignal) {
  const { mode, count, prompt, model, duration, frameIds } = job.input;
  const total = mode === "image" ? count : count * frameIds.length;
  const definition: Model =
    job.input.promptModelDefinition ||
    MODELS.find(
      (m) => m.id === (job.input.promptModel || "openai/gpt-4.1-mini"),
    )!;
  if (!definition) throw new Error("Choose a prompt-generation text model");
  // Old queued batches can resume without re-creating prompts for existing child jobs.
  let prompts: string[] = [...(job.prompts || [])];
  if (!prompts.length && job.input.cursor)
    prompts = all("jobs")
      .filter((j) => j.batchId === job.batchId && j.kind === mode)
      .sort((a, b) => (a.input.sequence || 0) - (b.input.sequence || 0))
      .map((j) => j.input.prompt);
  const seen = new Set(
    prompts.map((p) => p.replace(/\s+/g, " ").trim().toLowerCase()),
  );
  const requests: PromptRequest[] = [...(job.promptRequests || [])]
    .slice(-8)
    .map((r) =>
      ["waiting", "streaming"].includes(r.status)
        ? { ...r, status: "failed" }
        : r,
    );
  let requestId = Math.max(0, ...requests.map((r) => r.id));
  let calls = 0;
  patchJob(job.id, {
    prompts,
    targetCount: total,
    draftText: "",
    progress: Math.round((prompts.length / total) * 100),
    promptStartedAt: new Date().toISOString(),
    promptFinishedAt: undefined,
    promptRequests: requests,
  });
  while (
    prompts.length < total &&
    calls < total + Math.max(3, Math.ceil(total * 0.25))
  ) {
    if (signal?.aborted || get("jobs", job.id)?.status === "canceled") return;
    const count = Math.min(
      4,
      total - prompts.length,
      total + Math.max(3, Math.ceil(total * 0.25)) - calls,
    );
    const result = await Promise.allSettled(
      Array.from({ length: count }, async () => {
        const release = await textSlot(signal);
        calls++;
        const request: PromptRequest = {
          id: ++requestId,
          status: "waiting",
          startedAt: new Date().toISOString(),
        };
        requests.push(request);
        const save = () =>
          patchJob(job.id, {
            promptRequests: requests.slice(-12).map((r) => ({ ...r })),
            prompts: [...prompts],
            progress: Math.round((prompts.length / total) * 100),
          });
        let lastDraft = 0,
          candidate = false;
        save();
        try {
          await streamPrompts(
            'Resolve the supplied generic image/video brief into ONE complete, distinct production prompt. Follow ONLY the variation or randomness instructions already in that brief. Preserve all fixed requirements; do not invent randomization rules. The brief describes the requested media, not the format of your chat response. Honor its scene/content rules inside the output prompt, even if it mentions FINAL OUTPUT or asks to generate an image. Your chat response must be exactly one JSON object {"prompt":"complete resolved production prompt"}. Escape newlines inside the string. No commentary. Do not repeat any prompt in avoid.',
            JSON.stringify({
              genericPrompt: prompt,
              count: 1,
              variation: request.id,
              aspectRatio: job.input.aspectRatio || "9:16",
              avoid: prompts.slice(-20),
            }),
            definition,
            (text) => {
              if (candidate || prompts.length >= total) return;
              candidate = true;
              const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
              if (seen.has(normalized)) {
                request.status = "duplicate";
                save();
                return;
              }
              seen.add(normalized);
              prompts.push(text);
              request.status = "completed";
              request.draftText = "";
              save();
            },
            (draft) => {
              if (Date.now() - lastDraft > 150 && !candidate) {
                lastDraft = Date.now();
                request.status = "streaming";
                request.firstTextMs ??=
                  Date.now() - Date.parse(request.startedAt);
                request.draftText = draft.slice(-20000);
                save();
              }
            },
            signal,
            (timing) => {
              Object.assign(request, timing);
              save();
            },
          );
        } catch (error) {
          request.status = "failed";
          request.durationMs = Date.now() - Date.parse(request.startedAt);
          save();
          throw error;
        } finally {
          release();
        }
      }),
    );
    const failure = result.find(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failure) throw failure.reason;
  }
  if (prompts.length !== total)
    throw new Error(
      `The text model returned ${prompts.length} of ${total} unique prompts. Retry to generate the remainder; completed prompts are saved.`,
    );
  if (signal?.aborted || get("jobs", job.id)?.status === "canceled") return;
  // Phase two starts only when every distinct prompt has been persisted.
  prompts.forEach((resolved, i) =>
    addJob(
      job.projectId,
      mode,
      `${mode === "image" ? "First frame" : "Reaction"} ${i + 1}`,
      {
        model,
        modelInputs: job.input.modelInputs,
        modelDefinition: job.input.modelDefinition,
        prompt: resolved,
        seed: Math.floor(Math.random() * 2147483646),
        duration,
        sequence: i + 1,
        aspectRatio: job.input.aspectRatio,
        sourceId:
          mode === "video" ? frameIds[Math.floor(i / count)] : undefined,
      },
      job.batchId,
      `${job.id}-${i}`,
    ),
  );
  patchJob(job.id, {
    status: "completed",
    progress: 100,
    prompts,
    draftText: "",
    promptFinishedAt: new Date().toISOString(),
  });
}
