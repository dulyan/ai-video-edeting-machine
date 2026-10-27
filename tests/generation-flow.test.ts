import { test, after, mock } from "node:test";
import https from "node:https";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MODELS } from "../shared/models.ts";
import { newProject } from "../shared/project.ts";
import {
  isTextToImage,
  isImageToVideo,
  ratioInputs,
  outputResolution,
} from "../shared/ratios.ts";
process.env.DATA_DIR = await mkdtemp(
  path.join(os.tmpdir(), "avem-generation-"),
);
const { addJob, get, all, put, patchJob, setSecret, state, mediaDir, changes } =
  await import("../server/store.ts");
const { prepareGeneration } = await import("../server/prepare.ts");
const { processJob } = await import("../server/queue.ts");
const { run, ffmpeg, probe } = await import("../server/render.ts");
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
const textModel = MODELS.find((m) => m.id === "anthropic/claude-sonnet-4.6")!,
  imageModel = MODELS.find(
    (m) => m.id === "black-forest-labs/flux-1.1-pro-t2i",
  )!;
setSecret("siray", "test-fixture-only");
setSecret("textModel", "irrelevant/settings-model");
const generic =
  "Keep the same product and room. Randomly choose a red, blue, green, or yellow shirt. No other changes.";
const texts = [
  "A red shirt. Same product and room.",
  "A blue shirt. Same product and room.",
  "A green shirt. Same product and room.",
  "A yellow shirt. Same product and room.",
];
const input = {
  mode: "image",
  count: 4,
  prompt: generic,
  model: imageModel.id,
  modelDefinition: imageModel,
  promptModel: textModel.id,
  promptModelDefinition: textModel,
  frameIds: [null],
  aspectRatio: "1:1",
  modelInputs: { aspect_ratio: "1:1" },
};
test("four prompts stream live, duplicates are replaced, then exactly four saved images use them", async () => {
  const p = newProject();
  put("projects", p);
  const batch = addJob(p.id, "prepare", "Prepare 4 first frames", input);
  patchJob(batch.id, { status: "running" });
  const fixture = path.join(mediaDir, "fixture.png");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=48x48",
    "-frames:v",
    "1",
    fixture,
  ]);
  const bytes = await readFile(fixture);
  const download = mock.method(https, "request", ((
    _url: unknown,
    _options: unknown,
    callback: any,
  ) => {
    const request: any = new EventEmitter();
    request.setTimeout = () => request;
    request.end = () => {
      const response: any = new PassThrough();
      response.statusCode = 200;
      response.headers = { "content-type": "image/png" };
      callback(response);
      response.end(bytes);
    };
    return request;
  }) as any);
  const requests: any[] = [];
  let chats = 0;
  let activeChats = 0,
    maxActiveChats = 0;
  let task = 0;
  let checkpoints: number[] = [];
  const observe = () => {
    const b = get("jobs", batch.id)!;
    if (b.prompts?.length) {
      checkpoints.push(b.prompts.length);
      if (b.prompts.length < 4)
        assert.equal(all("jobs").filter((j) => j.kind === "image").length, 0);
    }
  };
  changes.on("change", observe);
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/chat/completions")) {
      const body = JSON.parse(String(options?.body));
      requests.push(body);
      assert.equal(body.model, textModel.id);
      assert.equal(body.stream, true);
      activeChats++;
      maxActiveChats = Math.max(maxActiveChats, activeChats);
      const index = chats++;
      const lines = [index < 2 ? texts[0] : texts[Math.min(index - 1, 3)]]
        .map((prompt) => JSON.stringify({ prompt }) + "\n")
        .join("");
      const encoder = new TextEncoder();
      let at = 0;
      return new Response(
        new ReadableStream({
          async pull(controller) {
            await new Promise((r) => setTimeout(r, 2));
            if (at >= lines.length) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              activeChats--;
              controller.close();
              return;
            }
            const content = lines.slice(at, (at += 17));
            controller.enqueue(
              encoder.encode(
                "data: " +
                  JSON.stringify({ choices: [{ delta: { content } }] }) +
                  "\n\n",
              ),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    if (
      String(url).includes("/images/generations/async") &&
      options?.method === "POST"
    ) {
      requests.push(JSON.parse(String(options.body)));
      return Response.json({ task_id: "task-" + ++task });
    }
    if (String(url).includes("/images/generations/async/"))
      return Response.json({
        status: "SUCCESS",
        outputs: ["https://8.8.8.8/generated.png"],
      });
    return new Response(bytes, { headers: { "Content-Type": "image/png" } });
  };
  try {
    await prepareGeneration(get("jobs", batch.id)!);
    const children = all("jobs")
      .filter((j) => j.batchId === batch.batchId && j.kind === "image")
      .sort((a, b) => a.input.sequence - b.input.sequence);
    assert.equal(children.length, 4);
    assert(
      maxActiveChats > 1 && maxActiveChats <= 4,
      "Prompt calls must overlap without exceeding four requests",
    );
    assert.deepEqual(
      children.map((j) => j.input.prompt),
      get("jobs", batch.id)?.prompts,
    );
    assert.deepEqual(new Set(get("jobs", batch.id)?.prompts), new Set(texts));
    assert(
      checkpoints.includes(1) &&
        checkpoints.includes(2) &&
        checkpoints.includes(3),
    );
    for (const child of children) {
      await processJob(child);
      assert.equal(
        get("jobs", child.id)?.status,
        "completed",
        get("jobs", child.id)?.error || "Image job should complete",
      );
    }
    const assets = all("assets").filter((a) => a.projectId === p.id);
    assert.equal(assets.length, 4);
    assert.equal(new Set(assets.map((a) => a.prompt)).size, 4);
    assert(
      assets.every(
        (a) => a.kind === "image" && a.width === 48 && a.height === 48,
      ),
    );
    for (const asset of assets)
      assert((await stat(path.join(mediaDir, asset.key))).size > 0);
    const submitted = requests.filter((r) => r.model === imageModel.id);
    assert.equal(submitted.length, 4);
    assert(submitted.every((r) => r.aspect_ratio === "1:1"));
    const msg = JSON.parse(requests[0].messages[1].content);
    assert.equal(msg.genericPrompt, generic);
    assert(!("briefs" in msg));
    assert(!JSON.stringify(requests).includes("Vary only unspecified"));
    const publicState = state();
    assert.equal(
      publicState.jobs.find((j) => j.id === batch.id)?.promptModel,
      textModel.id,
    );
    assert(publicState.jobs.every((j) => j.input === undefined));
    assert(publicState.assets.every((a) => a.projectId === p.id));
  } finally {
    changes.off("change", observe);
    globalThis.fetch = original;
    download.mock.restore();
  }
});
test("retry keeps partial unique prompts and never starts images for an incomplete plan", async () => {
  const batch = addJob(
    "retry-project",
    "prepare",
    "Prepare 4 first frames",
    input,
  );
  patchJob(batch.id, { status: "running", prompts: [texts[0]] });
  globalThis.fetch = async () =>
    Response.json({
      choices: [{ message: { content: '{"prompt":"incomplete' } }],
    });
  await assert.rejects(
    () => prepareGeneration(get("jobs", batch.id)!),
    /incomplete prompt JSON/,
  );
  assert.deepEqual(get("jobs", batch.id)?.prompts, [texts[0]]);
  assert.equal(
    all("jobs").filter((j) => j.batchId === batch.batchId && j.kind === "image")
      .length,
    0,
  );
  let resumed = 0;
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ prompt: texts[++resumed] }),
          },
        },
      ],
    });
  await prepareGeneration(get("jobs", batch.id)!);
  assert.equal(
    all("jobs").filter((j) => j.batchId === batch.batchId && j.kind === "image")
      .length,
    4,
  );
  globalThis.fetch = original;
});
test("generation model lists match their actions and native dimensions follow chosen ratio", () => {
  assert(MODELS.filter(isTextToImage).every((m) => m.tag === "text-to-image"));
  assert(
    !isTextToImage(MODELS.find((m) => m.id === "bytedance/seedream-4.5-i2i")!),
  );
  assert(!isImageToVideo(MODELS.find((m) => m.id === "google/veo-3.1-t2v")!));
  assert(isImageToVideo(MODELS.find((m) => m.id === "google/veo-3.1-i2v")!));
  const seedream = MODELS.find((m) => m.id === "bytedance/seedream-4.5-t2i")!;
  assert.equal(ratioInputs(seedream, "16:9", {}).size, "2560x1440");
  assert.equal(ratioInputs(seedream, "1:1", {}).size, "2048x2048");
  assert.deepEqual(outputResolution("16:9"), [1920, 1080]);
  assert.deepEqual(outputResolution("1:1"), [1080, 1080]);
});
test("saved media can conform to a ratio the model does not generate natively", async () => {
  const { conformMedia } = await import("../server/conform.ts");
  const image = path.join(mediaDir, "crop-image.png");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=96x64",
    "-frames:v",
    "1",
    image,
  ]);
  await conformMedia(image, "image", "1:1");
  const dimensions = await probe(image);
  assert.equal(dimensions.width, 64);
  assert.equal(dimensions.height, 64);
});
