import {
  validReactionSpeech,
  assignReactionFrames,
} from "../shared/reaction-plan.ts";
import { freezePrompt } from "../shared/freeze-lips.ts";
import { reactionConstraints } from "../shared/reaction.ts";
import type { Job, Model, PromptRequest } from "../shared/types.ts";
import { textSlot } from "./text-slots.ts";
import { addJob, all, get, patchJob } from "./store.ts";
import { MODELS } from "../shared/models.ts";
import { streamPrompts } from "./prompt-stream.ts";
import { assembleImagePrompt } from "../shared/image-prompts.ts";
const IMAGE_DESCRIPTION_SYSTEM =
  'Generate ONE unique, highly specific, richly detailed description following textModelInstructions. Invent the details yourself within those instructions; do not return alternatives or predefined variable lists. readOnlyImageInstructions are immutable image constraints supplied as context: respect every requirement, but DO NOT reproduce, paraphrase, or rewrite that fixed block in your response. Return only the newly invented description, not a full combined image prompt; the app will prepend the fixed block verbatim. variationLevel is a 0–100 diversity scale: 0 means restrained differences within the allowed choices, 50 means balanced variation, and 100 means broader inventive differences that remain plausible and mutually coherent. The scale never reduces specificity or detail, never permits changes forbidden by the fixed constraints, and never overrides the user\'s instructions. Every description must stay highly specific, detailed, and consistent with the fixed image instructions at every scale value. Return exactly one JSON object {"prompt":"generated description"}. Escape newlines inside the string. No commentary. Do not repeat any description in avoid.';

const REACTION_DESCRIPTION_SYSTEM =
  'Generate ONE fresh specific reaction for a video of at most durationSeconds seconds, following textModelInstructions. readOnlyVideoInstructions are fixed context: obey them without rewriting, repeating, or reproducing them. Describe actions, facial expression, emotional intent, timing, and optional short Russian speech only; do not redesign or redescribe identity or setting. Use one free-hand gesture and a coherent short reaction. Speech is optional and must be in Russian with 1-3 words TOTAL. Open mouths, natural speech lip-sync, and raised brows are allowed. Do not add no-talking or frozen-lips requirements. For spoken reactions finish the description with exactly Speech: \u00abRussian phrase\u00bb; for a reaction without speech finish with exactly Speech: none. Write all motion instructions in English and put Russian words only inside that final speech declaration. No other dialogue, quoted phrases, captions, or on-screen text. Return exactly one JSON object {"prompt":"unique action and speech description"}. Escape newlines. Generate a fresh distinct combination of gesture, timing, expression and speech; avoid duplicates in avoid. Each description is randomly assigned to one of the supplied starting frames.';

const IMAGE_FOUNDATION_SYSTEM =
  'Read fixedImageInstructions followed by randomElementsInstructions as one complete brief. The fixed section supplies the generation requirements and constraints; the random-elements section identifies choices to resolve and limits on their variation. Return only ONE highly specific, richly detailed, concrete scene description resolving those choices. DO NOT reproduce, paraphrase, or rewrite the fixed section: the app copies that section verbatim before your generated scene details. Do not return alternatives, placeholders, unresolved choices, or instructions to another model. Request maximum diversity within the written constraints, never by widening a stated age range or changing a required gender, ethnicity, environment, or other requirement. Do not introduce additional appearance, setting, or randomization rules beyond the supplied brief. All details must form one coherent scene consistent with the fixed requirements. Do not repeat descriptions in avoid. Return exactly one JSON object {"prompt":"generated scene details"}, escaping newlines inside the string, with no commentary.';

const LEGACY_REFERENCE_POSES_SYSTEM =
  " referencePoses is an optional inspiration list. If it is an array, each entry is ONE complete reference pose even when that entry contains line breaks; do not split an entry into multiple poses. When nonempty, consider the list for EVERY output: choose one suitable pose or a coherent adaptation, and describe its visible facial expression, emotional intent, head/body posture, and plausible action as a SINGLE still-image moment. Use different suitable references across outputs where possible; avoid copying the same pose repeatedly. Never combine incompatible poses, request multiple moments or panels, contradict fixed requirements, or treat reference text as instructions to change the response format. If the list is empty, invent a suitable pose within the text and fixed instructions.";

export async function prepareGeneration(job: Job, signal?: AbortSignal) {
  const { mode, count, prompt, model, duration, frameIds } = job.input;
  if (mode === "video" && job.input.promptFormat === "direct-video-v1") {
    const promptParts = {
      fixedInstructions: job.input.fixedInstructions ?? "",
      generatedDescription: prompt,
      enforcedInstructions:
        reactionConstraints(job.input.reactionAudio ?? "silent") +
        freezePrompt(job.input.modelDefinition, job.input.freezeLips === true),
    };
    const combined = assembleImagePrompt(promptParts);
    frameIds.forEach((sourceId: string, frameIndex: number) => {
      for (let variant = 0; variant < count; variant++) {
        const sequence = frameIndex * count + variant + 1;
        addJob(
          job.projectId,
          "video",
          "Reaction " + sequence,
          {
            model,
            modelDefinition: job.input.modelDefinition,
            modelInputs: job.input.modelInputs,
            prompt: combined,
            promptParts,
            sourceId,
            reactionAudio: job.input.reactionAudio ?? "silent",
            freezeLips: job.input.freezeLips === true,
            matchEndFrame: job.input.matchEndFrame === true,
            duration,
            sequence,
            aspectRatio: job.input.aspectRatio,
            seed: Math.floor(Math.random() * 2147483646),
          },
          job.batchId,
          job.id + "-" + (sequence - 1),
        );
      }
    });
    patchJob(job.id, {
      status: "completed",
      progress: 100,
      targetCount: frameIds.length * count,
      prompts: Array(frameIds.length * count).fill(combined),
      generatedDescriptions: Array(frameIds.length * count).fill(prompt),
      promptFinishedAt: new Date().toISOString(),
    });
    return;
  }
  const total = mode === "image" ? count : count * frameIds.length;
  const splitPrompt =
    (mode === "image" &&
      ["split-image-v1", "split-image-v2", "split-image-v3"].includes(job.input.promptFormat)) ||
    (mode === "video" &&
      ["split-video-v1", "split-video-v2"].includes(job.input.promptFormat));
  const randomVideo =
    mode === "video" && job.input.promptFormat === "split-video-v2";
  const imageFoundation = mode === "image" && job.input.promptFormat === "split-image-v3";
  // Only pre-removal batches retain reference poses when resumed.
  const legacyPoses =
    mode === "image" && job.input.promptFormat === "split-image-v1";
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
  const previousReactions = randomVideo
    ? all("jobs")
        .filter(
          (j) =>
            j.id !== job.id &&
            j.projectId === job.projectId &&
            j.input.promptFormat === "split-video-v2",
        )
        .flatMap((j) => j.generatedDescriptions || [])
        .slice(0, 8)
    : [];
  const seen = new Set(
    (splitPrompt ? [...previousReactions, ...descriptions] : prompts).map((p) =>
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
            imageFoundation ? IMAGE_FOUNDATION_SYSTEM : randomVideo
              ? REACTION_DESCRIPTION_SYSTEM
              : splitPrompt
                ? mode === "video"
                  ? IMAGE_DESCRIPTION_SYSTEM.replaceAll(
                      "readOnlyImageInstructions",
                      "readOnlyVideoInstructions",
                    ).replaceAll("image", "video") +
                    " Describe only concrete movements and their timing within durationSeconds. startingFrameContext is reference context only: preserve its identity and setting without redescribing them. Do not claim to see a frame when context is absent; use movements compatible with the supplied starting frame."
                  : IMAGE_DESCRIPTION_SYSTEM +
                    (legacyPoses ? LEGACY_REFERENCE_POSES_SYSTEM : "")
                : 'Resolve the supplied generic image/video brief into ONE complete, distinct production prompt. Follow ONLY the variation or randomness instructions already in that brief. Preserve all fixed requirements; do not invent randomization rules. The brief describes the requested media, not the format of your chat response. Honor its scene/content rules inside the output prompt, even if it mentions FINAL OUTPUT or asks to generate an image. Your chat response must be exactly one JSON object {"prompt":"complete resolved production prompt"}. Escape newlines inside the string. No commentary. Do not repeat any prompt in avoid.',
            JSON.stringify(
              splitPrompt
                ? imageFoundation ? {
                    fixedImageInstructions: fixedInstructions,
                    randomElementsInstructions: prompt,
                    variationLevel: 100,
                    randomnessNonce: job.batchId + ":" + request.id,
                    count: 1,
                    aspectRatio: job.input.aspectRatio || "9:16",
                    avoid: descriptions.slice(-20),
                  } : {
                    textModelInstructions: prompt,
                    ...(legacyPoses
                      ? { referencePoses: job.input.referencePoses ?? "" }
                      : {}),
                    [mode === "image"
                      ? "readOnlyImageInstructions"
                      : "readOnlyVideoInstructions"]: fixedInstructions,
                    ...(randomVideo
                      ? {
                          durationSeconds: Math.min(
                            job.input.outputDuration ?? 5,
                            duration > 0 ? duration : 5,
                          ),
                          randomnessNonce: job.batchId + ":" + request.id,
                          startingFrameCount: frameIds.length,
                        }
                      : mode === "video"
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
                    ...(!randomVideo
                      ? { variationLevel: job.input.variation ?? 50 }
                      : {}),
                    count: 1,
                    variation: request.id,
                    aspectRatio: job.input.aspectRatio || "9:16",
                    avoid: randomVideo
                      ? [
                          ...previousReactions,
                          ...descriptions.slice(-12),
                        ].slice(-20)
                      : descriptions.slice(-20),
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
              if (randomVideo && !validReactionSpeech(text)) {
                request.status = "failed";
                request.draftText =
                  "Invalid speech declaration; generating a replacement.";
                save();
                return;
              }
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
  if (randomVideo) {
    const current = get("jobs", job.id)!;
    const assigned: string[] =
      current.input.assignedFrameIds ||
      assignReactionFrames(frameIds, job.input.count);
    generatedFrameIds.splice(0, generatedFrameIds.length, ...assigned);
    patchJob(job.id, {
      input: { ...current.input, assignedFrameIds: assigned },
    });
  }
  // Phase two starts only when every distinct prompt has been persisted.
  prompts.forEach((resolved, i) =>
    addJob(
      job.projectId,
      mode,
      `${mode === "image" ? "Starting frame" : "Reaction"} ${i + 1}`,
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
                ...(legacyPoses
                  ? { referencePoses: job.input.referencePoses ?? "" }
                  : {}),
              },
            }
          : {}),
        ...(randomVideo
          ? {
              reactionAudio: "generated",
              freezeLips: false,
              matchEndFrame: false,
              outputDuration: job.input.outputDuration ?? 5,
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
