import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reactionInputs, reactionConstraints } from "../shared/reaction.ts";
import { assembleImagePrompt } from "../shared/image-prompts.ts";
import type { Model } from "../shared/types.ts";
process.env.DATA_DIR = await mkdtemp(
  path.join(os.tmpdir(), "avem-silent-reaction-"),
);
const { ffmpeg, run, probe } = await import("../server/render.ts");
const { removeReactionAudio } = await import("../server/reaction-audio.ts");
const dir = await mkdtemp(path.join(os.tmpdir(), "reaction-audio-test-"));
after(async () => {
  await rm(dir, { recursive: true, force: true });
});
test("silent reaction settings override only documented audio fields and choose image animation", () => {
  const model = {
    id: "test",
    name: "test",
    kind: "video",
    schema: {
      properties: {
        generate_audio: { type: "boolean" },
        task_type: {
          type: "string",
          enum: ["reference_to_video", "image_to_video"],
        },
      },
    },
  } as Model;
  assert.deepEqual(
    reactionInputs(model, {
      generate_audio: true,
      task_type: "reference_to_video",
      size: "720p",
    }),
    { generate_audio: false, task_type: "image_to_video", size: "720p" },
  );
  assert.equal(
    reactionInputs(model, { generate_audio: true }, "ambient").generate_audio,
    true,
  );
  const noToggle = {
    ...model,
    schema: { properties: { size: { type: "string" } } },
  } as Model;
  assert.deepEqual(reactionInputs(noToggle, { size: "720p" }), {
    size: "720p",
  });
  const parts = {
    fixedInstructions: "  Fixed\r\n",
    generatedDescription: "Movement",
    enforcedInstructions: reactionConstraints(),
  };
  assert.equal(
    assembleImagePrompt(parts),
    parts.fixedInstructions + "\n\nMovement\n\n" + parts.enforcedInstructions,
  );
  assert(
    reactionConstraints("ambient").includes("Environmental room tone only"),
  );
});
test("real FFmpeg removes all returned audio without re-encoding video or changing duration", async () => {
  const file = path.join(dir, "reaction.mp4");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=96x160:r=24:d=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-shortest",
    file,
  ]);
  const before = await probe(file);
  assert.equal(before.hasAudio, true);
  const saved = await removeReactionAudio(file);
  const after = await probe(file);
  assert.equal(after.hasAudio, false);
  assert.equal(after.hasVideo, true);
  assert.equal(after.width, before.width);
  assert(Math.abs(after.duration - before.duration) < 0.05);
  assert.equal(saved.size, (await stat(file)).size);
  await removeReactionAudio(file);
  assert.equal((await probe(file)).hasAudio, false);
});
