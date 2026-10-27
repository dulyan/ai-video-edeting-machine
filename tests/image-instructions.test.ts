import { test, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { MODELS } from "../shared/models.ts";
import { assembleImagePrompt } from "../shared/image-prompts.ts";
import { newProject } from "../shared/project.ts";
import { projectSchema } from "../shared/schema.ts";
process.env.DATA_DIR = await mkdtemp(
  path.join(os.tmpdir(), "avem-image-instructions-"),
);
const { get, put, all, addJob, patchJob, setSecret, state, mediaDir } =
  await import("../server/store.ts");
const { prepareGeneration } = await import("../server/prepare.ts");
const { processJob } = await import("../server/queue.ts");
const { run, ffmpeg } = await import("../server/render.ts");
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
setSecret("siray", "test-only-not-a-real-key");
const textModel = MODELS.find((m) => m.id === "openai/gpt-4.1-mini")!,
  imageModel = MODELS.find(
    (m) => m.id === "black-forest-labs/flux-1.1-pro-t2i",
  )!;
const fixed =
  "  CAMERA:\r\n\tPhone-video quality. 😮\r\n\r\nNo logos. Keep these spaces.  \n";
const referencePoses =
  "  Raised brows and a warm closed-mouth smile.\r\nA small head tilt with one hand near the chest.  ";
const descriptions = [
  "A 43-year-old woman with a round face, flyaway auburn hair and a faded olive sweatshirt, in a lived-in kitchen. Late-afternoon window light falls from her left beside a chipped mug and folded dish towel.",
  "A 61-year-old man with salt-and-pepper stubble, rectangular glasses and a worn blue cardigan in a small home office. A desk lamp softly lights his right cheek; books, a charging cable and an unfinished cup of tea sit behind him.",
  "A 29-year-old adult with short dark curls and a loose rust-colored T-shirt on an ordinary covered porch. Overcast daylight softly lights their face; scuffed shoes, a small plant and a folded canvas bag are visible nearby.",
  "A 52-year-old woman with a softly angular face, fine lines and loosely tied silver-streaked brown hair, in a modest living room. A floor lamp lights her cheek; a rumpled blanket and TV remote sit on a worn sofa.",
];
function input(count = 4, variation = 50, fixedInstructions = fixed) {
  return {
    mode: "image",
    count,
    prompt:
      "Invent highly specific people and coherent everyday settings with rich, realistic details.",
    model: imageModel.id,
    modelDefinition: imageModel,
    promptModel: textModel.id,
    promptModelDefinition: textModel,
    frameIds: [null],
    aspectRatio: "1:1",
    modelInputs: { aspect_ratio: "1:1" },
    promptFormat: "split-image-v1",
    referencePoses,
    fixedInstructions,
    variation,
  };
}
test("four image prompts preserve the exact fixed block, show only generated details, and reach the provider unchanged", async () => {
  const p = newProject();
  p.imageFixedInstructions = fixed;
  put("projects", p);
  const job = addJob(p.id, "prepare", "Prepare 4 first frames", input());
  const fixture = path.join(mediaDir, "fixture.png");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=48x48",
    "-frames:v",
    "1",
    fixture,
  ]);
  const bytes = await readFile(fixture);
  const download = mock.method(https, "request", ((
    _u: unknown,
    _o: unknown,
    cb: any,
  ) => {
    const req: any = new EventEmitter();
    req.setTimeout = () => req;
    req.end = () => {
      const res: any = new PassThrough();
      res.statusCode = 200;
      res.headers = { "content-type": "image/png" };
      cb(res);
      res.end(bytes);
    };
    return req;
  }) as any);
  const textRequests: any[] = [],
    imageRequests: any[] = [];
  let n = 0,
    tasks = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/chat/completions")) {
      const body = JSON.parse(String(options?.body));
      textRequests.push(body);
      return Response.json({
        choices: [
          {
            message: { content: JSON.stringify({ prompt: descriptions[n++] }) },
          },
        ],
      });
    }
    if (options?.method === "POST") {
      imageRequests.push(JSON.parse(String(options.body)));
      return Response.json({ task_id: "task-" + ++tasks });
    }
    return Response.json({
      status: "SUCCESS",
      outputs: ["https://8.8.8.8/fixture.png"],
    });
  };
  try {
    await processJob(job);
    const prepared = get("jobs", job.id)!;
    assert.equal(prepared.status, "completed");
    assert.equal(prepared.prompts?.length, 4);
    assert.deepEqual(
      new Set(prepared.generatedDescriptions),
      new Set(descriptions),
    );
    for (const body of textRequests) {
      const message = JSON.parse(body.messages[1].content);
      assert.equal(message.readOnlyImageInstructions, fixed);
      assert.equal(message.referencePoses, referencePoses);
      assert(body.messages[0].content.includes("SINGLE still-image moment"));
      assert.equal(message.textModelInstructions, input().prompt);
      assert.equal(message.variationLevel, 50);
      assert(
        body.messages[0].content.includes(
          "never reduces specificity or detail",
        ),
      );
      assert(body.messages[0].content.includes("DO NOT reproduce"));
    }
    p.imageFixedInstructions = "A later edit must not alter this batch";
    put("projects", p);
    const children = all("jobs").filter(
      (j) => j.batchId === job.batchId && j.kind === "image",
    );
    assert.equal(children.length, 4);
    for (const child of children) {
      assert.equal(child.input.promptParts.fixedInstructions, fixed);
      assert.equal(child.input.promptParts.referencePoses, referencePoses);
      assert.equal(
        child.input.prompt,
        assembleImagePrompt(child.input.promptParts),
      );
      await processJob(child);
      assert.equal(
        get("jobs", child.id)?.status,
        "completed",
        get("jobs", child.id)?.error || "Expected saved image",
      );
    }
    const assets = all("assets").filter((a) => a.projectId === p.id);
    assert.equal(assets.length, 4);
    for (const asset of assets) {
      assert.equal(asset.promptParts?.fixedInstructions, fixed);
      assert.equal(asset.promptParts?.referencePoses, referencePoses);
      assert.equal(asset.prompt, assembleImagePrompt(asset.promptParts!));
      assert(asset.prompt!.startsWith(fixed + "\n\n"));
      assert(imageRequests.some((b) => b.prompt === asset.prompt));
    }
    assert(
      imageRequests.every(
        (b) => !("variationLevel" in b) && !("textModelInstructions" in b),
      ),
    );
    const publicJob = state().jobs.find((j) => j.id === job.id)!;
    assert.equal(publicJob.fixedInstructions, fixed);
    assert.equal(publicJob.referencePoses, referencePoses);
    assert.deepEqual(
      publicJob.generatedDescriptions,
      prepared.generatedDescriptions,
    );
  } finally {
    globalThis.fetch = original;
    download.mock.restore();
  }
});
test("split-image retries preserve completed prompts and snapshotted fixed text without double-prefixing", async () => {
  const job = addJob(
    "retry-project",
    "prepare",
    "Prepare 2 first frames",
    input(2),
  );
  const first = assembleImagePrompt({
    fixedInstructions: fixed,
    generatedDescription: descriptions[0],
  });
  patchJob(job.id, {
    status: "running",
    prompts: [first],
    generatedDescriptions: [descriptions[0]],
  });
  globalThis.fetch = async () =>
    Response.json({
      choices: [{ message: { content: '{"prompt":"incomplete' } }],
    });
  await assert.rejects(
    () => prepareGeneration(get("jobs", job.id)!),
    /incomplete prompt JSON/,
  );
  assert.deepEqual(get("jobs", job.id)?.prompts, [first]);
  assert.equal(
    all("jobs").filter((j) => j.batchId === job.batchId && j.kind === "image")
      .length,
    0,
  );
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        { message: { content: JSON.stringify({ prompt: descriptions[1] }) } },
      ],
    });
  await prepareGeneration(get("jobs", job.id)!);
  const children = all("jobs").filter(
    (j) => j.batchId === job.batchId && j.kind === "image",
  );
  assert.equal(children.length, 2);
  assert(
    children.every(
      (j) => j.input.prompt === assembleImagePrompt(j.input.promptParts),
    ),
  );
  assert.equal(get("jobs", job.id)?.prompts?.[0], first);
  assert.equal(get("jobs", job.id)?.generatedDescriptions?.length, 2);
  assert(
    children.every(
      (j) => j.input.promptParts.referencePoses === referencePoses,
    ),
  );
  globalThis.fetch = original;
});
test("variation endpoints change only text-model diversity guidance; specificity and fixed constraints remain mandatory", async () => {
  for (const variation of [0, 50, 100]) {
    const job = addJob(
      "variation-" + variation,
      "prepare",
      "Prepare 1 first frame",
      input(1, variation),
    );
    let body: any;
    globalThis.fetch = async (_u, options) => {
      body = JSON.parse(String(options?.body));
      return Response.json({
        choices: [
          { message: { content: JSON.stringify({ prompt: descriptions[0] }) } },
        ],
      });
    };
    await prepareGeneration(job);
    const request = JSON.parse(body.messages[1].content);
    assert.equal(request.variationLevel, variation);
    assert.equal(request.readOnlyImageInstructions, fixed);
    assert(
      body.messages[0].content.includes(
        "highly specific, detailed, and consistent",
      ),
    );
    assert(!("temperature" in body));
  }
  globalThis.fetch = original;
});
test("empty fixed text and whitespace-only fixed text assemble predictably, while older projects remain valid", async () => {
  assert.equal(
    assembleImagePrompt({
      fixedInstructions: "",
      generatedDescription: descriptions[0],
    }),
    descriptions[0],
  );
  assert.equal(
    assembleImagePrompt({
      fixedInstructions: "  \n",
      generatedDescription: "Detailed scene",
    }),
    "  \n\n\nDetailed scene",
  );
  const job = addJob(
    "empty-fixed",
    "prepare",
    "Prepare 1 first frame",
    input(1, 50, ""),
  );
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        { message: { content: JSON.stringify({ prompt: descriptions[0] }) } },
      ],
    });
  await prepareGeneration(job);
  assert.equal(get("jobs", job.id)?.prompts?.[0], descriptions[0]);
  globalThis.fetch = original;
  const legacy = newProject();
  delete legacy.imageFixedInstructions;
  delete legacy.imageVariation;
  delete legacy.imageReferencePoses;
  const parsed = projectSchema.parse(legacy);
  assert.equal(parsed.imagePrompt, legacy.imagePrompt);
  assert.equal(parsed.imageFixedInstructions, undefined);
  assert.equal(parsed.imageReferencePoses, undefined);
  assert.equal(
    projectSchema.safeParse({ ...legacy, imageVariation: 101 }).success,
    false,
  );
});
test("video and pre-split image jobs keep legacy request and prompt semantics", async () => {
  for (const mode of ["video", "image"]) {
    const settings: any = { ...input(1), mode };
    delete settings.promptFormat;
    const job = addJob(
      "legacy-" + mode,
      "prepare",
      "Prepare 1 output",
      settings,
    );
    let body: any;
    globalThis.fetch = async (_u, options) => {
      body = JSON.parse(String(options?.body));
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompt: "Legacy resolved production prompt",
              }),
            },
          },
        ],
      });
    };
    await prepareGeneration(job);
    const message = JSON.parse(body.messages[1].content);
    assert.equal(message.genericPrompt, settings.prompt);
    assert(!("readOnlyImageInstructions" in message));
    const child = all("jobs").find(
      (j) => j.batchId === job.batchId && j.kind === mode,
    )!;
    assert.equal(child.input.prompt, "Legacy resolved production prompt");
    assert.equal(child.input.promptParts, undefined);
  }
  globalThis.fetch = original;
});

test("split video prompts keep frame context paired across out-of-order completion and resume", async () => {
  for (const [id, prompt] of [
    ["frame-a", "A person beside packed gym bag"],
    ["frame-b", "A person near the hallway mirror"],
  ]) {
    put("assets", {
      id,
      prompt,
      kind: "image",
      projectId: "video-split",
      name: id,
      createdAt: new Date().toISOString(),
      mime: "image/png",
      size: 1,
      key: id,
    });
  }
  const job = addJob("video-split", "prepare", "Prepare reactions", {
    ...input(2),
    mode: "video",
    promptFormat: "split-video-v1",
    frameIds: ["frame-a", "frame-b"],
    duration: 8,
  });
  let n = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body));
    const context = JSON.parse(body.messages[1].content);
    assert.equal(context.readOnlyVideoInstructions, fixed);
    assert.equal(context.durationSeconds, 8);
    assert(!("readOnlyImageInstructions" in context));
    const index = n++;
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 30 : 1));
    if (index === 1) throw new Error("temporary test failure");
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              prompt: context.startingFrameContext + " movement " + index,
            }),
          },
        },
      ],
    });
  };
  await assert.rejects(() => prepareGeneration(job), /temporary test failure/);
  assert.equal(get("jobs", job.id)?.prompts?.length, 3);
  assert.equal(
    all("jobs").filter((j) => j.batchId === job.batchId && j.kind === "video")
      .length,
    0,
  );
  await prepareGeneration(get("jobs", job.id)!);
  const children = all("jobs").filter(
    (j) => j.batchId === job.batchId && j.kind === "video",
  );
  assert.equal(children.length, 4);
  for (const id of ["frame-a", "frame-b"])
    assert.equal(children.filter((j) => j.input.sourceId === id).length, 2);
  for (const child of children) {
    assert.equal(
      child.input.prompt,
      assembleImagePrompt(child.input.promptParts),
    );
    assert(
      child.input.promptParts.generatedDescription.startsWith(
        get("assets", child.input.sourceId)!.prompt!,
      ),
    );
  }
  assert.equal(
    state().jobs.find((j) => j.id === job.id)?.fixedInstructions,
    fixed,
  );
  const project = newProject();
  assert.equal(
    projectSchema.parse({
      ...project,
      videoFixedInstructions: fixed,
      videoVariation: 100,
    }).videoFixedInstructions,
    fixed,
  );
  assert.equal(
    projectSchema.safeParse({ ...project, videoVariation: 101 }).success,
    false,
  );
  globalThis.fetch = original;
});

test("direct reaction animation uses selected frames and exact guidance without calling a text model", async () => {
  const job = addJob("direct-reactions", "prepare", "Prepare reactions", {
    ...input(2),
    mode: "video",
    promptFormat: "direct-video-v1",
    frameIds: ["frame-a", "frame-b"],
    duration: 8,
    prompt: "Silent delighted surprise. Small hand gestures.",
  });
  globalThis.fetch = async () => {
    throw new Error("No text-model request allowed");
  };
  await prepareGeneration(job);
  await prepareGeneration(get("jobs", job.id)!);
  const children = all("jobs").filter(
    (j) => j.batchId === job.batchId && j.kind === "video",
  );
  assert.equal(children.length, 4);
  assert.deepEqual(
    [...children]
      .sort((a, b) => a.input.sequence - b.input.sequence)
      .map((j) => j.input.sourceId),
    ["frame-a", "frame-a", "frame-b", "frame-b"],
  );
  for (const child of children) {
    assert.equal(
      child.input.prompt,
      assembleImagePrompt(child.input.promptParts),
    );
    assert.equal(child.input.promptParts.fixedInstructions, fixed);
    assert.equal(child.input.reactionAudio, "silent");
    assert(
      child.input.prompt.endsWith(child.input.promptParts.enforcedInstructions),
    );
    assert(child.input.prompt.includes("no repeated jaw opening"));
  }
  assert.equal(get("jobs", job.id)?.status, "completed");
  assert.equal(
    state().jobs.find((j) => j.id === job.id)?.fixedInstructions,
    fixed,
  );
  globalThis.fetch = original;
});

test("reaction provider payload matches its preview and returned audio is removed before saving", async () => {
  const fixture = path.join(mediaDir, "provider-reaction.mp4");
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
    fixture,
  ]);
  const bytes = await readFile(fixture);
  const { reactionConstraints } = await import("../shared/reaction.ts");
  const { probe } = await import("../server/render.ts");
  const promptParts = {
    fixedInstructions: fixed,
    generatedDescription: "Silent happy surprise.",
    enforcedInstructions: reactionConstraints(),
  };
  const prompt = assembleImagePrompt(promptParts);
  const job = addJob("silent-pipeline", "video", "Reaction test", {
    model: "video-test",
    modelDefinition: {
      id: "video-test",
      name: "Test",
      kind: "video",
      schema: { properties: { generate_audio: { type: "boolean" } } },
    },
    modelInputs: { generate_audio: false },
    prompt,
    promptParts,
    reactionAudio: "silent",
  });
  const download = mock.method(https, "request", ((
    _u: unknown,
    _o: unknown,
    cb: any,
  ) => {
    const req: any = new EventEmitter();
    req.setTimeout = () => req;
    req.end = () => {
      const res: any = new PassThrough();
      res.statusCode = 200;
      res.headers = { "content-type": "video/mp4" };
      cb(res);
      res.end(bytes);
    };
    return req;
  }) as any);
  let sent: any;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === "POST") {
      sent = JSON.parse(String(options.body));
      return Response.json({ task_id: "silent-fixture" });
    }
    return Response.json({
      status: "SUCCESS",
      outputs: ["https://8.8.8.8/reaction.mp4"],
    });
  };
  try {
    await processJob(job);
    assert.equal(
      get("jobs", job.id)?.status,
      "completed",
      get("jobs", job.id)?.error || "Expected completed reaction",
    );
    const asset = get("assets", job.id)!;
    assert.equal(sent.prompt, prompt);
    assert.equal(sent.generate_audio, false);
    assert.equal(asset.prompt, prompt);
    assert.deepEqual(asset.promptParts, promptParts);
    assert.equal((await probe(path.join(mediaDir, asset.key))).hasAudio, false);
  } finally {
    download.mock.restore();
    globalThis.fetch = original;
  }
});
