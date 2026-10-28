import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MODELS } from "../shared/models.ts";
import {
  VIDEO_PROMPT,
  VIDEO_FIXED_INSTRUCTIONS,
  newProject,
  reactionPromptSettings,
} from "../shared/project.ts";
import {
  assignReactionFrames,
  validReactionSpeech,
  providerDuration,
  outputDuration,
} from "../shared/reaction-plan.ts";
import { reactionInputs } from "../shared/reaction.ts";
import { assembleImagePrompt } from "../shared/image-prompts.ts";
process.env.DATA_DIR = await mkdtemp(
  path.join(os.tmpdir(), "random-reaction-"),
);
const { addJob, get, all, patchJob, mediaDir, setSecret } =
  await import("../server/store.ts");
const { prepareGeneration } = await import("../server/prepare.ts");
const { limitReactionDuration } =
  await import("../server/reaction-duration.ts");
const { run, ffmpeg, probe } = await import("../server/render.ts");
const textModel = MODELS.find((m) => m.id === "openai/gpt-4.1-mini")!,
  videoModel = MODELS.find((m) => m.id === "alibaba/wan-3.0-i2v")!;
setSecret("siray", "test-only-random-reaction-key");
const original = globalThis.fetch;
test("Russian speech declarations allow 1-3 words or no speech, rejecting extra dialogue", () => {
  for (const phrase of [
    "\u0412\u043e\u0442 \u044d\u0442\u043e \u0434\u0430",
    "\u0423\u0445 \u0442\u044b",
    "\u041d\u0438\u0447\u0435\u0433\u043e \u0441\u0435\u0431\u0435!",
  ])
    assert.equal(
      validReactionSpeech("Raises hand. Speech: \u00ab" + phrase + "\u00bb"),
      true,
    );
  assert.equal(
    validReactionSpeech("Raises brows and opens mouth. Speech: none."),
    true,
  );
  for (const value of [
    "Speech: none. Speech: none.",
    "Speech: \u00abWow\u00bb",
    "Speech: \u00ab\u0412\u043e\u0442 \u044d\u0442\u043e \u0434\u0430 \u0434\u0440\u0443\u0437\u044c\u044f\u00bb",
    'Says "Wow". Speech: none.',
    "Speech: none. More dialogue.",
  ])
    assert.equal(validReactionSpeech(value), false, value);
});
test("new defaults replace legacy restrictions and preserve the exact supplied fixed text", () => {
  const p = newProject();
  p.videoPromptMode = undefined;
  p.videoPrompt = "No talking";
  p.videoFixedInstructions = "Frozen lips";
  assert.equal(reactionPromptSettings(p).videoPrompt, VIDEO_PROMPT);
  assert.equal(
    reactionPromptSettings(p).videoFixedInstructions,
    VIDEO_FIXED_INSTRUCTIONS,
  );
  p.videoPromptMode = "randomized";
  p.videoPrompt = "Custom actions";
  p.videoFixedInstructions = "  Exact\nfixed  ";
  assert.equal(
    reactionPromptSettings(p).videoFixedInstructions,
    p.videoFixedInstructions,
  );
  assert.equal(
    VIDEO_FIXED_INSTRUCTIONS,
    "Animate the provided starting frame into one continuous, unedited, self recorded smartphone video, vertical 9:16, real time speed, of the person in the frame naturally acting surprised. No description of the person or people, no visible camera, no crew reflections. No flicker in teeth, jewelry, clothing patterns, or hair texture. No face melting, no background warping, no sudden lighting changes. Make the sound as if it was recorded on iPhone default microphone in this exact location at this exact distance to the phone. Raw unedited smartphone footage as it would look uploaded straight to TikTok.",
  );
  const assigned = assignReactionFrames(["a", "b"], 3, () => 0);
  assert.equal(assigned.filter((id) => id === "a").length, 3);
  assert.equal(assigned.filter((id) => id === "b").length, 3);
  assert.notDeepEqual(assigned, ["a", "a", "a", "b", "b", "b"]);
  assert.equal(providerDuration({ ...videoModel, durations: [6, 8] }, 5), 6);
  assert.equal(outputDuration(8), 5);
  assert.equal(providerDuration({...videoModel,durations:[-1]},5),-1);
  assert.equal(
    reactionInputs(videoModel, { audio_enable: false }, "generated")
      .audio_enable,
    true,
  );
});
test("unique randomized reactions stream, resume, and keep balanced stable random assignments without injected barriers", async () => {
  const fixed = "  " + VIDEO_FIXED_INSTRUCTIONS + "\n";
  const job = addJob("random-project", "prepare", "Prepare reactions", {
    mode: "video",
    promptFormat: "split-video-v2",
    count: 3,
    frameIds: ["frame-a", "frame-b"],
    prompt: VIDEO_PROMPT,
    fixedInstructions: fixed,
    duration: 5,
    outputDuration: 5,
    model: videoModel.id,
    modelDefinition: videoModel,
    promptModel: textModel.id,
    promptModelDefinition: textModel,
  });
  let n = 0,
    fail = true;
  const requests: any[] = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    const context = JSON.parse(body.messages[1].content);
    requests.push(context);
    const i = n++;
    if (fail && i === 1) throw new Error("Temporary text failure");
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              prompt:
                "Gesture " +
                i +
                ": points toward center with the free hand, raising brows. Speech: \u00ab\u0423\u0445 \u0442\u044b\u00bb",
            }),
          },
        },
      ],
    });
  };
  try {
    await assert.rejects(
      () => prepareGeneration(job),
      /Temporary text failure/,
    );
    assert.equal(get("jobs", job.id)?.prompts?.length, 3);
    assert.equal(
      all("jobs").filter((j) => j.batchId === job.batchId && j.kind === "video")
        .length,
      0,
    );
    fail = false;
    await prepareGeneration(get("jobs", job.id)!);
    const saved = get("jobs", job.id)!;
    const assigned = [...saved.input.assignedFrameIds];
    const children = all("jobs").filter(
      (j) => j.batchId === job.batchId && j.kind === "video",
    );
    assert.equal(children.length, 6);
    assert.equal(new Set(children.map((j) => j.input.prompt)).size, 6);
    for (const id of ["frame-a", "frame-b"])
      assert.equal(children.filter((j) => j.input.sourceId === id).length, 3);
    for (const child of children) {
      assert.equal(child.input.promptParts.fixedInstructions, fixed);
      assert.equal(
        child.input.prompt,
        assembleImagePrompt(child.input.promptParts),
      );
      assert.equal(child.input.promptParts.enforcedInstructions, undefined);
      assert.equal(child.input.reactionAudio, "generated");
      assert.equal(child.input.freezeLips, false);
      assert.equal(child.input.matchEndFrame, false);
      assert.equal(child.input.outputDuration, 5);
      assert(validReactionSpeech(child.input.promptParts.generatedDescription));
    }
    for (const request of requests) {
      assert.equal(request.readOnlyVideoInstructions, fixed);
      assert.equal(request.durationSeconds, 5);
      assert.equal(request.variationLevel, undefined);
      assert(request.randomnessNonce.startsWith(job.batchId));
    }
    await prepareGeneration(get("jobs", job.id)!);
    assert.deepEqual(get("jobs", job.id)?.input.assignedFrameIds, assigned);
    assert.equal(
      all("jobs").filter((j) => j.batchId === job.batchId && j.kind === "video")
        .length,
      6,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("overlong provider video is trimmed to five seconds with its audio preserved", async () => {
  const file = path.join(mediaDir, "six-seconds.mp4");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=96x160:r=24:d=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=6",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest",
    file,
  ]);
  assert((await probe(file)).duration > 5);
  await limitReactionDuration(file, 5);
  const meta = await probe(file);
  assert(meta.duration <= 5);
  assert.equal(meta.hasAudio, true);
  assert.equal(meta.hasVideo, true);
});
