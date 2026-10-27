import type { Job, Model } from "../shared/types.ts";
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
  let lastDraft = 0;
  patchJob(job.id, {
    prompts,
    targetCount: total,
    draftText: "",
    progress: Math.round((prompts.length / total) * 100),
  });
  for (
    let attempt = 0;
    prompts.length < total && attempt < Math.ceil(total / 20) + 6;
    attempt++
  ) {
    if (signal?.aborted || get("jobs", job.id)?.status === "canceled") return;
    const amount = Math.min(20, total - prompts.length),
      before = prompts.length;
    await streamPrompts(
      'Expand the supplied generic prompt into the requested number of distinct, complete production prompts. Follow ONLY the variation or randomness instructions already present in the generic prompt. Preserve fixed requirements. Do not invent additional randomization rules. The selected aspect ratio is an output constraint. Return one JSON object per line, each exactly {"prompt":"complete prompt"}. No markdown, lists, or commentary. Do not repeat any prompt in avoid.',
      JSON.stringify({
        genericPrompt: prompt,
        count: amount,
        aspectRatio: job.input.aspectRatio || "9:16",
        avoid: prompts.slice(-80),
      }),
      definition,
      (text) => {
        if (prompts.length >= total) return;
        const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        prompts.push(text);
        patchJob(job.id, {
          prompts: [...prompts],
          draftText: "",
          progress: Math.round((prompts.length / total) * 100),
        });
      },
      (draft) => {
        if (Date.now() - lastDraft > 150) {
          lastDraft = Date.now();
          patchJob(job.id, { draftText: draft.slice(-20000) });
        }
      },
      signal,
    );
    if (prompts.length === before && attempt >= 3) break;
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
  });
}
