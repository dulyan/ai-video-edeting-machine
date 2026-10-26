import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import ffmpeg from "ffmpeg-static";
import { newProject } from "../shared/project.ts";
const dir = await mkdtemp(path.join(os.tmpdir(), "avem-api-"));
const port = 18000 + Math.floor(Math.random() * 10000),
  base = `http://127.0.0.1:${port}/api`,
  password = "test-only-workspace-password";
let server: ChildProcess,
  logs = "";
async function start() {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      DATA_DIR: dir,
      PORT: String(port),
      HOST: "127.0.0.1",
      APP_PASSWORD: password,
      ENCRYPTION_KEY: "test-only-encryption-key-for-isolated-fixtures",
      PUBLIC_API_URL: `http://127.0.0.1:${port}`,
      LOG_LEVEL: "error",
    },
  });
  server.stdout?.on("data", (c) => {
    logs += c;
  });
  server.stderr?.on("data", (c) => {
    logs += c;
  });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Test backend failed to start: ${logs}`);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    server.once("exit", () => resolve());
    server.kill();
  });
}
after(stop);
await start();
let token = "";
async function api(route: string, method = "GET", body?: any) {
  const res = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const project = newProject();
project.name = "Isolated API fixture";
test("private workspace requires authentication and rejects wrong passwords", async () => {
  assert.equal((await api("/state")).status, 401);
  assert.equal(
    (await api("/login", "POST", { password: "wrong" })).status,
    401,
  );
  const login = await api("/login", "POST", { password });
  assert.equal(login.status, 200);
  token = login.data.token;
  assert(token);
  assert.equal((await api("/state")).status, 200);
});
test("projects persist and independent timing fields round trip", async () => {
  project.hookModel = "anthropic/claude-sonnet-4.6";
  project.modelInputs = { [project.imageModel]: { aspect_ratio: "9:16" } };
  assert.equal(
    (await api(`/projects/${project.id}`, "PUT", project)).status,
    200,
  );
  assert.equal(
    (
      await api(`/projects/${project.id}`, "PATCH", {
        composition: {
          ...project.composition,
          hookSpan: "whole",
          musicSpan: "demo",
        },
      })
    ).status,
    200,
  );
  const state = (await api("/state")).data;
  assert.equal(state.projects[0].composition.hookSpan, "whole");
  assert.equal(state.projects[0].composition.musicSpan, "demo");
  assert.equal(state.projects[0].hookModel, project.hookModel);
  assert.deepEqual(state.projects[0].modelInputs, project.modelInputs);
  assert.equal(
    (
      await api(`/projects/${project.id}`, "PATCH", {
        composition: { ...project.composition, keyColor: "evil;filter" },
      })
    ).status,
    400,
  );
});
test("API keys are encrypted at rest and never returned in state", async () => {
  const key = "fixture-not-a-real-api-key-1234";
  assert.equal((await api("/settings", "PUT", { apiKey: key })).status, 200);
  const settings = (await api("/settings")).data;
  assert.equal(settings.keyConfigured, true);
  assert.equal(settings.keySuffix, "1234");
  assert(!JSON.stringify((await api("/state")).data).includes(key));
  assert(!JSON.stringify(settings).includes(key));
  const db = await readFile(path.join(dir, "workspace.sqlite-wal"));
  assert(!db.includes(Buffer.from(key)));
  await api("/settings", "PUT", { apiKey: "" });
});
test("empty rendering is rejected atomically without queued partial jobs", async () => {
  const result = await api("/render", "POST", { projectId: project.id });
  assert.equal(result.status, 400);
  assert.equal((await api("/state")).data.jobs.length, 0);
  assert.equal(
    (await api("/generate", "POST", { projectId: project.id, mode: "image" }))
      .status,
    400,
  );
});
test("invalid or expired media signatures cannot expose files", async () => {
  assert.equal(
    (await fetch(`${base}/media/nonexistent?expires=1&signature=no`)).status,
    403,
  );
});
test("uploaded media renders through the durable API queue and downloads privately", async () => {
  async function fixture(name: string, args: string[]) {
    const file = path.join(dir, name);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffmpeg!,
        ["-y", "-v", "error", ...args, "-t", "0.5", file],
        { windowsHide: true },
      );
      let error = "";
      child.stderr.on("data", (c) => {
        error += c;
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(error)),
      );
    });
    return file;
  }
  async function upload(file: string, kind: string, mime: string) {
    const form = new FormData();
    form.append("projectId", project.id);
    form.append("kind", kind);
    form.append(
      "file",
      new Blob([await readFile(file)], { type: mime }),
      path.basename(file),
    );
    const response = await fetch(base + "/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = (await response.json()) as any;
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  }
  const clip = await fixture("clip.mp4", [
    "-f",
    "lavfi",
    "-i",
    "color=c=0x536653:s=216x384:r=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ]);
  const track = await fixture("track.mp3", [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-c:a",
    "libmp3lame",
  ]);
  const reaction = await upload(clip, "reaction", "video/mp4"),
    demo = await upload(clip, "demo", "video/mp4"),
    music = await upload(track, "music", "audio/mpeg");
  const patch = {
    reactionIds: [reaction.id],
    demoIds: [demo.id],
    musicIds: [music.id],
    musicMode: "selected",
    hooks: [
      {
        id: "fixture-hook",
        text: "A fresh perspective.",
        createdAt: new Date().toISOString(),
      },
    ],
  };
  assert.equal(
    (await api(`/projects/${project.id}`, "PATCH", patch)).status,
    200,
  );
  const batch = await api("/render", "POST", { projectId: project.id });
  assert.equal(batch.status, 200);
  assert.equal(batch.data.count, 1);
  let job: any;
  for (let i = 0; i < 120; i++) {
    job = (await api("/state")).data.jobs.find(
      (j: any) => j.batchId === batch.data.batchId,
    );
    if (["completed", "failed"].includes(job.status)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(job.status, "completed", job.error);
  const link = (await api(`/assets/${job.outputId}/url`)).data.url;
  const media = await fetch(link);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "video/mp4");
  assert((await media.arrayBuffer()).byteLength > 1000);
  const zip = await fetch(`${base}/projects/${project.id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(zip.status, 200);
  assert.equal(zip.headers.get("content-type"), "application/zip");
  assert.equal(
    Buffer.from(await zip.arrayBuffer())
      .subarray(0, 2)
      .toString(),
    "PK",
  );
});
test("server restart preserves projects, resets expiring sessions, and retains scopes", async () => {
  await stop();
  await start();
  assert.equal((await api("/state")).status, 401);
  token = (await api("/login", "POST", { password })).data.token;
  const p = (await api("/state")).data.projects.find(
    (p: any) => p.id === project.id,
  );
  assert.equal(p.name, project.name);
  assert.equal(p.composition.hookSpan, "whole");
  assert.equal(p.composition.musicSpan, "demo");
  assert.equal(
    (await api("/state")).data.assets.filter((a: any) => a.kind === "output")
      .length,
    1,
  );
});
