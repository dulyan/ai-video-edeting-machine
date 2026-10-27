import type { Job, Model, PromptRequest } from "../shared/types.ts";
import { textSlot } from "./text-slots.ts";
import { addJob, all, get, patchJob } from "./store.ts";
import { MODELS } from "../shared/models.ts";
import { streamPrompts } from "./prompt-stream.ts";
import { assembleImagePrompt } from "../shared/image-prompts.ts";
const IMAGE_DESCRIPTION_SYSTEM =
  'Generate ONE unique, highly specific, richly detailed description following textModelInstructions. Invent the details yourself within those instructions; do not return alternatives or predefined variable lists. readOnlyImageInstructions are immutable image constraints supplied as context: respect every requirement, but DO NOT reproduce, paraphrase, or rewrite that fixed block in your response. Return only the newly invented description, not a full combined image prompt; the app will prepend the fixed block verbatim. variationLevel is a 0–100 diversity scale: 0 means restrained differences within the allowed choices, 50 means balanced variation, and 100 means broader inventive differences that remain plausible and mutually coherent. The scale never reduces specificity or detail, never permits changes forbidden by the fixed constraints, and never overrides the user\'s instructions. Every description must stay highly specific, detailed, and consistent with the fixed image instructions at every scale value. Return exactly one JSON object {"prompt":"generated description"}. Escape newlines inside the string. No commentary. Do not repeat any description in avoid.';

export async function prepareGeneration(job: Job, signal?: AbortSignal) {
  const { mode, count, prompt, model, duration, frameIds } = job.input;
  const total = mode === "image" ? count : count * frameIds.length;
  const splitPrompt =
    (mode === "image" && job.input.promptFormat === "split-image-v1") ||
    (mode === "video" && job.input.promptFormat === "split-video-v1");
  const fixedInstructions: string = job.input.fixedInstructions ?? "";
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
  const descriptions: string[] = splitPrompt
    ? [
        ...(job.generatedDescriptions ||
          prompts.map((p) =>
            fixedInstructions && p.startsWith(fixedInstructions + "\n\n")
              ? p.slice(fixedInstructions.length + 2)
              : p,
          )),
      ]
    : [];
  const generatedFrameIds: (string | null)[] = [
    ...(job.input.generatedFrameIds || []),
  ];
  const seen = new Set(
    (splitPrompt ? descriptions : prompts).map((p) =>
      p.replace(/\s+/g, " ").trim().toLowerCase(),
    ),
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
    ...(splitPrompt ? { generatedDescriptions: descriptions } : {}),
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
    const pendingFrames =
      mode === "video" && splitPrompt
        ? frameIds.flatMap((id: string | null) =>
            Array.from(
              {
                length: Math.max(
                  0,
                  job.input.count -
                    generatedFrameIds.filter((saved) => saved === id).length,
                ),
              },
              () => id,
            ),
          )
        : [];
    const result = await Promise.allSettled(
      Array.from({ length: count }, async (_, offset) => {
        const sourceId = pendingFrames[offset];
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
            ...(mode === "video" && splitPrompt
              ? {
                  input: {
                    ...job.input,
                    generatedFrameIds: [...generatedFrameIds],
                  },
                }
              : {}),
            progress: Math.round((prompts.length / total) * 100),
            ...(splitPrompt
              ? { generatedDescriptions: [...descriptions] }
              : {}),
          });
        let lastDraft = 0,
          candidate = false;
        save();
        try {
          await streamPrompts(
            splitPrompt
              ? mode === "video"
                ? IMAGE_DESCRIPTION_SYSTEM.replaceAll(
                    "readOnlyImageInstructions",
                    "readOnlyVideoInstructions",
                  ).replaceAll("image", "video") +
                  " Describe only concrete movements and their timing within durationSeconds. startingFrameContext is reference context only: preserve its identity and setting without redescribing them. Do not claim to see a frame when context is absent; use movements compatible with the supplied starting frame."
                : IMAGE_DESCRIPTION_SYSTEM
              : 'Resolve the supplied generic image/video brief into ONE complete, distinct production prompt. Follow ONLY the variation or randomness instructions already in that brief. Preserve all fixed requirements; do not invent randomization rules. The brief describes the requested media, not the format of your chat response. Honor its scene/content rules inside the output prompt, even if it mentions FINAL OUTPUT or asks to generate an image. Your chat response must be exactly one JSON object {"prompt":"complete resolved production prompt"}. Escape newlines inside the string. No commentary. Do not repeat any prompt in avoid.',
            JSON.stringify(
              splitPrompt
                ? {
                    textModelInstructions: prompt,
                    [mode === "image"
                      ? "readOnlyImageInstructions"
                      : "readOnlyVideoInstructions"]: fixedInstructions,
                    ...(mode === "video"
                      ? {
                          durationSeconds: duration,
                          startingFrameContext: (() => {
                            const frame = get("assets", sourceId);
                            return (
                              frame?.promptParts?.generatedDescription ||
                              frame?.prompt ||
                              ""
                            );
                          })(),
                        }
                      : {}),
                    variationLevel: job.input.variation ?? 50,
                    count: 1,
                    variation: request.id,
                    aspectRatio: job.input.aspectRatio || "9:16",
                    avoid: descriptions.slice(-20),
                  }
                : {
                    genericPrompt: prompt,
                    count: 1,
                    variation: request.id,
                    aspectRatio: job.input.aspectRatio || "9:16",
                    avoid: prompts.slice(-20),
                  },
            ),
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
              if (splitPrompt) {
                descriptions.push(text);
                if (mode === "video") generatedFrameIds.push(sourceId);
                prompts.push(
                  assembleImagePrompt({
                    fixedInstructions,
                    generatedDescription: text,
                  }),
                );
              } else prompts.push(text);
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
        ...(splitPrompt
          ? {
              promptParts: {
                fixedInstructions,
                generatedDescription: descriptions[i],
              },
            }
          : {}),
        seed: Math.floor(Math.random() * 2147483646),
        duration,
        sequence: i + 1,
        aspectRatio: job.input.aspectRatio,
        sourceId:
          mode === "video"
            ? splitPrompt
              ? generatedFrameIds[i]
              : frameIds[Math.floor(i / count)]
            : undefined,
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
    ...(splitPrompt ? { generatedDescriptions: descriptions } : {}),
  });
}
