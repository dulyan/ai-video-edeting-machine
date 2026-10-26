import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { newProject } from "../shared/project.ts";
import type { Asset } from "../shared/types.ts";
process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "avem-queue-"));
const { put, all, addJob, patchJob } = await import("../server/store.ts");
const { queueRender, recoverJobs } = await import("../server/queue.ts");
test("render jobs snapshot all four dimensions and per-output timing", () => {
  const p = newProject();
  p.hooks = [
    { id: "h1", text: "First", createdAt: "" },
    { id: "h2", text: "Second", createdAt: "" },
  ];
  p.reactionIds = ["r1", "r2", "r3"];
  p.demoIds = ["d1", "d2"];
  p.musicIds = ["m1", "m2", "m3", "m4"];
  p.musicMode = "selected";
  p.composition.hookSpan = "demo";
  p.composition.musicSpan = "reaction";
  p.rowOverrides["h1:r1:d1:m1"] = { hookSpan: "whole", musicSpan: "demo" };
  for (const id of [...p.reactionIds, ...p.demoIds, ...p.musicIds])
    put("assets", {
      id,
      key: id,
      name: id,
      kind: id.startsWith("r")
        ? "reaction"
        : id.startsWith("d")
          ? "demo"
          : "music",
      projectId: p.id,
      createdAt: "",
      mime: "video/mp4",
      size: 1,
      duration: 1,
    } as Asset);
  const result = queueRender(p);
  assert.equal(result.count, 48);
  const jobs = all("jobs").filter((j) => j.batchId === result.batchId);
  assert.equal(jobs.length, 48);
  const first = jobs.find((j) => j.input.row.id === "h1:r1:d1:m1")!;
  assert.equal(first.input.row.hookSpan, "whole");
  assert.equal(first.input.row.musicSpan, "demo");
  assert.equal(first.input.composition.hookSpan, "demo");
  p.composition.hookSpan = "reaction";
  assert.equal(first.input.composition.hookSpan, "demo");
});
test("recovery resumes known provider tasks and flags ambiguous submissions", () => {
  const known = addJob("p", "video", "known", {}),
    unknown = addJob("p", "image", "unknown", {}),
    render = addJob("p", "render", "render", {});
  patchJob(known.id, { status: "running", taskId: "provider-task" });
  patchJob(unknown.id, { status: "running" });
  patchJob(render.id, { status: "running" });
  recoverJobs();
  const jobs = all("jobs");
  assert.equal(jobs.find((j) => j.id === known.id)?.status, "queued");
  assert.equal(jobs.find((j) => j.id === unknown.id)?.status, "uncertain");
  assert.equal(jobs.find((j) => j.id === render.id)?.status, "queued");
});
