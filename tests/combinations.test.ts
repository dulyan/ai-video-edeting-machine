import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newProject,
  combinationCount,
  combinationAt,
  resolveChoices,
  spanWindow,
} from "../shared/project.ts";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "avem-models-"));
const { generationPayload } = await import("../server/siray.ts");
test("every hook × reaction × demo × track combination is unique", () => {
  const p = newProject();
  p.hooks = ["h1", "h2"].map((id) => ({ id, text: id, createdAt: "" }));
  p.reactionIds = ["r1", "r2", "r3"];
  p.demoIds = ["d1", "d2"];
  p.musicIds = ["m1", "m2", "m3", "m4"];
  p.musicMode = "selected";
  assert.equal(combinationCount(p), 48);
  const rows = Array.from({ length: 48 }, (_, i) => combinationAt(p, i));
  assert.equal(new Set(rows.map((r) => r.id)).size, 48);
  assert.deepEqual(rows[0], {
    id: "h1:r1:d1:m1",
    hookId: "h1",
    reactionId: "r1",
    demoId: "d1",
    musicId: "m1",
  });
  assert.equal(rows[47].musicId, "m4");
  assert.equal(rows[47].hookId, "h2");
});
test("hook and music timing overrides are independent", () => {
  const p = newProject(),
    row = combinationAt(p, 0);
  p.rowOverrides[row.id] = { hookSpan: "demo", musicSpan: "reaction" };
  const result = combinationAt(p, 0);
  assert.equal(result.hookSpan, "demo");
  assert.equal(result.musicSpan, "reaction");
  assert.deepEqual(spanWindow(result.hookSpan!, 3, 7), [3, 10]);
  assert.deepEqual(spanWindow(result.musicSpan!, 3, 7), [0, 3]);
  assert.deepEqual(spanWindow("whole", 3, 7), [0, 10]);
});
test("skipped and optional dimensions use one omitted component", () => {
  const p = newProject();
  p.reactionIds = ["r1", "r2"];
  p.demoIds = ["d1"];
  p.musicMode = "selected";
  p.musicIds = ["m1", "m2"];
  p.hooks = [{ id: "h", text: "Hello", createdAt: "" }];
  assert.equal(combinationCount(p), 4);
  p.skipped = [3, 5, 6];
  assert.equal(combinationCount(p), 2);
  assert.equal(combinationAt(p, 1).hookId, null);
  assert.equal(combinationAt(p, 1).demoId, null);
  assert.equal(combinationAt(p, 1).musicId, null);
});
test("random music assigns one output per visual combination", () => {
  const p = newProject();
  p.reactionIds = ["a", "b"];
  p.musicMode = "random";
  p.musicIds = ["m1", "m2", "m3"];
  assert.equal(combinationCount(p), 2);
});
test("IMG hooks do not render inactive text-hook rows", () => {
  const p = newProject();
  p.hooks = [
    { id: "text", text: "Hi", createdAt: "" },
    { id: "image", text: "", imageId: "img", createdAt: "" },
  ];
  p.composition.style = "IMG";
  assert.equal(combinationCount(p), 1);
  assert.equal(combinationAt(p, 0).hookId, "image");
});
test("explicit prompt choices are enumerated without changing fixed instructions", () => {
  const prompt = "A [woman/man] in a [kitchen/office], no logos.";
  const prompts = Array.from({ length: 4 }, (_, i) =>
    resolveChoices(prompt, i),
  );
  assert.equal(new Set(prompts).size, 4);
  assert(prompts.every((p) => p.endsWith("no logos.")));
});
test("model payloads use documented model-specific fields and durations", () => {
  const flux = generationPayload(
    "black-forest-labs/flux-1.1-pro-t2i",
    "portrait",
    123,
  );
  assert.equal(flux.aspect_ratio, "9:16");
  assert.equal(flux.seed, 123);
  const veo = generationPayload("google/veo-3.1-i2v", "smile", 3, 8, "image");
  assert.equal(veo.image, "image");
  assert(!("size" in veo));
  assert.throws(() =>
    generationPayload("google/veo-3.1-i2v", "smile", 3, 5, "image"),
  );
});
