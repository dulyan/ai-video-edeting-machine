import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELS } from "../shared/models.ts";
import {
  freezeInputs,
  freezePrompt,
  cfgBaseline,
  GOOGLE_I2V,
  WAN_I2V,
} from "../shared/freeze-lips.ts";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "freeze-payload-"));
const { generationPayload } = await import("../server/siray.ts");
import { reactionInputs } from "../shared/reaction.ts";
import { IMAGE_PROMPT, IMAGE_FIXED_INSTRUCTIONS } from "../shared/project.ts";
const google = MODELS.find((m) => m.id === GOOGLE_I2V)!,
  wan = MODELS.find((m) => m.id === WAN_I2V)!;
test("real Siray schemas use supported fields and honest prompt fallbacks", () => {
  for (const model of [google, wan]) {
    const prompt = "User instructions" + freezePrompt(model, true);
    const input = freezeInputs(
      model,
      reactionInputs(model, {
        size: "720p",
        aspect_ratio: "9:16",
        audio_enable: true,
      }),
      true,
      true,
      "frame-a",
    );
    const body = generationPayload(
      model.id,
      prompt,
      1,
      8,
      "frame-a",
      input,
      [model],
      { freezeLips: true, matchEndFrame: true },
    );
    assert.equal(body.prompt, prompt);
    assert.equal(body.image, "frame-a");
    assert.equal(body.negative_prompt, undefined);
    assert.equal(body.guidance_scale, undefined);
    assert.equal(body.cfg_scale, undefined);
    assert(prompt.includes("Avoid: talking, speaking"));
    if (model.id === WAN_I2V) {
      assert.equal(body.end_image, "frame-a");
      assert.equal(body.audio_enable, false);
      assert.equal(body.prompt_expansion_enable, false);
      assert(prompt.includes("(mouth closed:1.3)"));
    } else {
      assert.equal(body.end_image, undefined);
      assert(prompt.includes("jaw is locked"));
    }
  }
});
test("native negative prompt, CFG and end frames are mapped when the model schema supports them", () => {
  const supported = {
    ...wan,
    schema: {
      ...wan.schema,
      properties: {
        ...wan.schema?.properties,
        negative_prompt: { type: "string" },
        guidance_scale: { type: "number", minimum: 1, maximum: 8, default: 3 },
      },
    },
  };
  const inputs = freezeInputs(
    supported,
    { negative_prompt: "blurry", guidance_scale: 3, end_image: "manual-end" },
    true,
    true,
    "chosen-start",
  );
  assert.equal(inputs.guidance_scale, 4);
  assert.equal(inputs.end_image, "chosen-start");
  assert(String(inputs.negative_prompt).startsWith("blurry, talking"));
  assert.deepEqual(
    freezeInputs(supported, inputs, true, true, "chosen-start"),
    inputs,
  );
  assert(!freezePrompt(supported, true).includes("Avoid:"));
  const body = generationPayload(
    supported.id,
    "Exact preview",
    1,
    8,
    "chosen-start",
    { ...inputs, size: "720p", aspect_ratio: "9:16" },
    [supported],
    { freezeLips: true, matchEndFrame: true },
  );
  assert.equal(body.guidance_scale, 4);
  assert.equal(body.negative_prompt, inputs.negative_prompt);
  assert.equal(
    cfgBaseline({
      ...supported,
      schema: {
        properties: { cfg: { type: "number", minimum: 1, maximum: 3.5 } },
      },
    }),
    3.5,
  );
  const off = {
    negative_prompt: "custom",
    guidance_scale: 3,
    end_image: "manual-end",
  };
  assert.deepEqual(
    freezeInputs(supported, off, false, false, "chosen-start"),
    off,
  );
  assert.equal(freezePrompt(supported, false), "");
  const other = { ...supported, id: "other/model" };
  assert.deepEqual(freezeInputs(other, off, true, true, "chosen-start"), off);
  assert.equal(freezePrompt(other, true), "");
});
test("starting-frame defaults require touching lips without changing reaction defaults", () => {
  assert(IMAGE_PROMPT.includes("upper and lower lips gently touching"));
  assert(
    IMAGE_FIXED_INSTRUCTIONS.includes("Upper and lower lips gently touch"),
  );
});
