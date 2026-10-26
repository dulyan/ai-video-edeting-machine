import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MODELS } from "../shared/models.ts";
import {
  normalizeCatalog,
  modelPayload,
  isAutoFrameField,
  fieldDefault,
} from "../shared/catalog.ts";
import { projectSchema } from "../shared/schema.ts";
import { newProject } from "../shared/project.ts";

test("catalog includes every published text, image and video model with input schemas", () => {
  assert.equal(new Set(MODELS.map((m) => m.id)).size, 175);
  assert.equal(MODELS.filter((m) => m.kind === "text").length, 37);
  assert.equal(MODELS.filter((m) => m.kind === "image").length, 58);
  assert.equal(MODELS.filter((m) => m.kind === "video").length, 80);
  assert(MODELS.every((m) => m.schema?.properties?.model));
});
test("future API models use endpoint metadata, including lifecycle and text protocols", () => {
  const models = normalizeCatalog([
    { id: "future/painter", supported_endpoint_types: ["image-generation"] },
    {
      id: "future/director",
      supported_endpoint_types: ["video-generation"],
      status: "retired",
    },
    { id: "future/writer", supported_endpoint_types: ["anthropic"] },
    { id: "future/embed", supported_endpoint_types: ["embeddings"] },
  ]);
  assert.equal(models.length, 3);
  assert.equal(models.find((m) => m.id === "future/painter")?.kind, "image");
  assert.equal(models.find((m) => m.id === "future/director")?.active, false);
  assert.equal(models.find((m) => m.id === "future/writer")?.kind, "text");
});
test("every published media model builds its documented required payload", () => {
  for (const model of MODELS.filter((m) => m.kind !== "text")) {
    const inputs: Record<string, unknown> = {};
    for (const name of model.schema?.required || []) {
      if (["model", "prompt", "duration", "seconds"].includes(name)) continue;
      const field = model.schema!.properties![name];
      inputs[name] =
        fieldDefault(name, field) ??
        (field.type === "array"
          ? Array.from(
              { length: field.minItems || 1 },
              () => "https://example.com/reference.png",
            )
          : "https://example.com/source.mp4");
    }
    const duration =
      model.durations?.find((n) => n === 8) ?? model.durations?.[0];
    const payload = modelPayload(
      model,
      "Test prompt",
      42,
      duration,
      undefined,
      inputs,
    );
    for (const name of model.schema?.required || [])
      assert(payload[name] !== undefined, `${model.id}: ${name}`);
    assert.equal(payload.model, model.id);
    assert.equal(payload.prompt, "Test prompt");
  }
});
test("provider fields stay model-specific and validate references and durations", () => {
  const veo = MODELS.find((m) => m.id === "google/veo-3.1-i2v")!;
  const result = modelPayload(veo, "Smile", 1, 8, "first-frame", {
    size: "made-up",
    model: "other",
  });
  assert.equal(result.image, "first-frame");
  assert.equal(result.model, veo.id);
  assert(!("size" in result));
  assert.throws(
    () => modelPayload(veo, "Smile", 1, 5, "frame"),
    /supported duration/,
  );
  const edit = MODELS.find((m) => m.id === "bytedance/seedream-4.5-i2i")!;
  assert.throws(() => modelPayload(edit, "Edit", 1), /Provide image/);
  const paired = MODELS.find(
    (m) => m.id === "bytedance/seedance-1.5-pro-se2v",
  )!;
  const pairedPayload = modelPayload(paired, "Transition", 1, 8, "first", {
    images: ["last"],
  });
  assert.deepEqual(pairedPayload.images, ["first", "last"]);
  assert(isAutoFrameField("images"));
});
test("hook model and per-model inputs round trip without breaking older projects", () => {
  const p = newProject();
  assert(projectSchema.safeParse(p).success);
  p.hookModel = "anthropic/claude-sonnet-4.6";
  p.modelInputs = { [p.imageModel]: { aspect_ratio: "9:16" } };
  p.videoDuration = -1;
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(p)));
  assert.equal(saved.hookModel, p.hookModel);
  assert.deepEqual(saved.modelInputs, p.modelInputs);
});

process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "avem-catalog-"));
const { chatJSON } = await import("../server/siray.ts");
const { setSecret } = await import("../server/store.ts");
test("hook requests use the chosen model and omit unsupported sampling controls", async () => {
  setSecret("siray", "test-only");
  setSecret("textModel", "openai/gpt-4.1-mini");
  const original = globalThis.fetch;
  const bodies: any[] = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"hooks":["A hook"]}' } }],
      }),
      { status: 200 },
    );
  };
  try {
    await chatJSON("Write hooks", "Product", "openai/gpt-6.1-sol");
    await chatJSON("Write hooks", "Product", "anthropic/claude-sonnet-4.6");
    assert.equal(bodies[0].model, "openai/gpt-6.1-sol");
    assert(!("temperature" in bodies[0]));
    assert.equal(bodies[1].model, "anthropic/claude-sonnet-4.6");
    assert.equal(bodies[1].temperature, 0.95);
  } finally {
    globalThis.fetch = original;
  }
});
