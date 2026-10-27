import path from "node:path";
import { prepareGeneration } from "./prepare.ts";
import { conformMedia } from "./conform.ts";
import { stat, unlink } from "node:fs/promises";
import type { Asset, Hook, Job, Project } from "../shared/types.ts";
import { addJob, all, get, put, patchJob, mediaDir } from "./store.ts";
import { chatJSON, generationPayload, siray } from "./siray.ts";
import { assetDataURL, copyRemote, storeFile } from "./storage.ts";
import { probe, renderVideo } from "./render.ts";
import {
  combinationAt,
  combinationCount,
  resolveChoices,
} from "../shared/project.ts";
const running = new Set<string>(),
  controllers = new Map<string, AbortController>();
export function cancelJob(id: string) {
  controllers.get(id)?.abort();
  const job = get("jobs", id);
  if (job && ["queued", "running", "uncertain"].includes(job.status))
    patchJob(id, {
      status: "canceled",
      error: job.taskId
        ? "Stopped tracking this provider task. Siray may still finish and charge for it."
        : undefined,
    });
}
export function recoverJobs() {
  for (const job of all("jobs").filter((j) => j.status === "running")) {
    if (["image", "video"].includes(job.kind) && !job.taskId)
      patchJob(job.id, {
        status: "uncertain",
        error:
          "The server stopped during submission. Check Siray before explicitly retrying to avoid a duplicate charge.",
      });
    else patchJob(job.id, { status: "queued" });
  }
}
async function materializeInputs(value: any): Promise<any> {
  if (typeof value === "string" && value.startsWith("asset:")) {
    const asset = get("assets", value.slice(6));
    if (!asset) throw new Error("A selected model reference asset is missing");
    return assetDataURL(asset);
  }
  if (Array.isArray(value)) return Promise.all(value.map(materializeInputs));
  if (value && typeof value === "object")
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [
          k,
          await materializeInputs(v),
        ]),
      ),
    );
  return value;
}
export async function processJob(job: Job) {
  const controller = new AbortController();
  controllers.set(job.id, controller);
  try {
    patchJob(job.id, { status: "running", error: undefined });
    if (job.kind === "prepare") {
      await prepareGeneration(job, controller.signal);
    } else if (job.kind === "image" || job.kind === "video") {
      let taskId = job.taskId;
      if (!taskId) {
        const source = job.input.sourceId
          ? get("assets", job.input.sourceId)
          : undefined;
        const body = generationPayload(
          job.input.model,
          job.input.prompt,
          job.input.seed,
          job.input.duration,
          source ? await assetDataURL(source) : undefined,
          await materializeInputs(job.input.modelInputs || {}),
          job.input.modelDefinition ? [job.input.modelDefinition] : undefined,
        );
        const response = await siray(
          job.kind === "image"
            ? "/v1/images/generations/async"
            : "/v1/video/generations",
          body,
        );
        taskId = response.data?.task_id || response.task_id;
        if (!taskId)
          throw new Error(
            "Siray accepted a request but returned no task ID. Check your provider dashboard before retrying.",
          );
        patchJob(job.id, { taskId });
      }
      let failures = 0;
      while (get("jobs", job.id)?.status !== "canceled") {
        let response: any;
        try {
          response = await siray(
            `${job.kind === "image" ? "/v1/images/generations/async" : "/v1/video/generations"}/${encodeURIComponent(taskId!)}`,
          );
          failures = 0;
        } catch (error) {
          if (++failures >= 5) throw error;
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        const info = response.data || response,
          status = String(info.status).toUpperCase();
        if (["FAILED", "FAILURE", "ERROR"].includes(status))
          throw new Error(
            info.fail_reason || info.message || "Provider generation failed",
          );
        if (["SUCCESS", "COMPLETED", "SUCCEEDED"].includes(status)) {
          if (get("jobs", job.id)?.status === "canceled") return;
          const output = info.outputs?.[0],
            url = typeof output === "string" ? output : output?.url;
          if (!url) throw new Error("Siray completed without an output URL");
          const ext = job.kind === "image" ? ".png" : ".mp4",
            id = job.id,
            key = `${id}${ext}`,
            file = path.join(mediaDir, key);
          let copied = await copyRemote(url, file);
          if (job.input.aspectRatio) {
            const conformed = await conformMedia(
              file,
              job.kind,
              job.input.aspectRatio,
              controller.signal,
            );
            if (conformed) copied = { ...copied, ...conformed };
          }
          const metadata = await probe(file);
          const asset: Asset = {
            id,
            key,
            name: job.label,
            kind: job.kind === "image" ? "image" : "reaction",
            projectId: job.projectId,
            createdAt: new Date().toISOString(),
            mime: copied.mime.startsWith(
              job.kind === "image" ? "image/" : "video/",
            )
              ? copied.mime
              : job.kind === "image"
                ? "image/png"
                : "video/mp4",
            size: copied.size,
            duration: metadata.duration,
            width: metadata.width,
            height: metadata.height,
            prompt: job.input.prompt,
            ...(job.input.promptParts
              ? { promptParts: job.input.promptParts }
              : {}),
            model: job.input.model,
            sourceId: job.input.sourceId,
            jobId: job.id,
          };
          if (get("jobs", job.id)?.status === "canceled") {
            await unlink(file).catch(() => {});
            return;
          }
          await storeFile(file, asset);
          patchJob(job.id, {
            status: "completed",
            progress: 100,
            outputId: id,
          });
          return;
        }
        const progress = Number.parseFloat(info.progress);
        patchJob(job.id, {
          progress: Number.isFinite(progress) ? Math.min(99, progress) : 0,
        });
        await new Promise((r) => setTimeout(r, 5000));
      }
    } else if (job.kind === "hooks") {
      const product = get("products", job.input.productId);
      if (!product) throw new Error("Product not found");
      let completed = job.input.completed || 0;
      const generated = new Set<string>(
        (get("projects", job.projectId)?.hooks || []).map((h) =>
          h.text.trim().toLowerCase(),
        ),
      );
      for (
        let tries = 0;
        completed < job.input.count &&
        tries < Math.ceil(job.input.count / 20) + 6;
        tries++
      ) {
        if (get("jobs", job.id)?.status === "canceled") return;
        const count = Math.min(20, job.input.count - completed);
        const response = await chatJSON(
          'Write concise, varied, attention-grabbing product video hooks in the requested language. Use only supplied product facts; never invent proof, guarantees, or results. Return JSON {"hooks":[strings]}.',
          JSON.stringify({
            product,
            language: job.input.language,
            count,
            avoid: Array.from(generated).slice(-80),
          }),
          job.input.model,
          job.input.modelDefinition,
        );
        if (!Array.isArray(response.hooks))
          throw new Error("Hook response was invalid");
        const hooks: Hook[] = [];
        for (const text of response.hooks) {
          if (
            typeof text !== "string" ||
            !text.trim() ||
            generated.has(text.trim().toLowerCase()) ||
            completed >= job.input.count
          )
            continue;
          generated.add(text.trim().toLowerCase());
          hooks.push({
            id: crypto.randomUUID(),
            text: text.trim(),
            productId: product.id,
            createdAt: new Date().toISOString(),
          });
          completed++;
        }
        const p = get("projects", job.projectId);
        if (!p) throw new Error("Project no longer exists");
        put("projects", {
          ...p,
          hooks: [...p.hooks, ...hooks],
          updatedAt: new Date().toISOString(),
        });
        patchJob(job.id, {
          progress: Math.round((completed / job.input.count) * 100),
          input: { ...job.input, completed },
        });
      }
      if (completed < job.input.count)
        throw new Error(
          `${completed} unique hooks saved. Provider did not return enough distinct hooks; retry to generate the remainder.`,
        );
      patchJob(job.id, { status: "completed", progress: 100 });
    } else if (job.kind === "render") {
      const outputId = job.id,
        key = `${outputId}.mp4`,
        file = path.join(mediaDir, key);
      const metadata = await renderVideo(
        job.input,
        file,
        (progress) => {
          if (get("jobs", job.id)?.status !== "canceled")
            patchJob(job.id, { progress });
        },
        controller.signal,
      );
      const asset: Asset = {
        id: outputId,
        key,
        name: job.label + ".mp4",
        kind: "output",
        projectId: job.projectId,
        createdAt: new Date().toISOString(),
        mime: "video/mp4",
        size: (await stat(file)).size,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        jobId: job.id,
      };
      if (get("jobs", job.id)?.status === "canceled") {
        await unlink(file).catch(() => {});
        return;
      }
      await storeFile(file, asset);
      patchJob(job.id, { status: "completed", progress: 100, outputId });
    }
  } catch (error) {
    if (get("jobs", job.id)?.status === "canceled") return;
    const current = get("jobs", job.id)!;
    const uncertain =
      ["image", "video"].includes(job.kind) &&
      !current.taskId &&
      /timeout|fetch failed|accepted|socket/i.test(String(error));
    patchJob(job.id, {
      status: uncertain ? "uncertain" : "failed",
      error: error instanceof Error ? error.message : "Job failed",
    });
  } finally {
    running.delete(job.id);
    controllers.delete(job.id);
  }
}
export function startQueue() {
  recoverJobs();
  const timer = setInterval(() => {
    const queue = all("jobs")
      .filter((j) => j.status === "queued" && !running.has(j.id))
      .reverse();
    const renderActive = all("jobs").some(
      (j) => j.kind === "render" && running.has(j.id),
    );
    let renderStarted = renderActive;
    for (const job of queue) {
      if (running.size >= 4) break;
      if (job.kind === "render" && renderStarted) continue;
      if (job.kind === "render") renderStarted = true;
      running.add(job.id);
      void processJob(job);
    }
  }, 1000);
  timer.unref();
  return timer;
}
export function queueRender(p: Project) {
  const batchId = crypto.randomUUID(),
    assets = Object.fromEntries(all("assets").map((a) => [a.id, a]));
  let count = 0;
  const total = combinationCount(p);
  if (total > 100000)
    throw new Error(
      "This selection exceeds 100,000 outputs. Reduce the selections or split the batch.",
    );
  for (let i = 0; i < total; i++) {
    const row = combinationAt(p, i);
    if (row.excluded) continue;
    if (
      !p.skipped.includes(6) &&
      p.musicMode === "random" &&
      p.musicIds.length &&
      !row.musicId
    )
      row.musicId = p.musicIds[Math.floor(Math.random() * p.musicIds.length)];
    const hook = p.hooks.find((h) => h.id === row.hookId);
    if (!row.reactionId && !row.demoId && !hook?.imageId)
      throw new Error(
        "Choose a reaction clip, demo video, or image hook before rendering",
      );
    const c = p.composition;
    if (c.style === "Green screen" && hook && !c.presenterId)
      throw new Error("Choose a green-screen presenter clip");
    const selected = [
      row.reactionId,
      row.demoId,
      row.musicId,
      hook?.imageId,
      c.presenterId,
      c.backgroundId,
    ].filter(Boolean) as string[];
    if (selected.some((id) => !assets[id]))
      throw new Error("A selected media asset is missing");
    addJob(
      p.id,
      "render",
      `${p.name || "Untitled project"} · ${String(i + 1).padStart(3, "0")}`,
      {
        row,
        hook,
        composition: structuredClone(c),
        assets: Object.fromEntries(selected.map((id) => [id, assets[id]])),
      },
      batchId,
    );
    count++;
  }
  if (!count) throw new Error("All output rows are excluded");
  return { batchId, count };
}
