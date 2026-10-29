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

test("hook batches preserve virality and product snapshots across chunks and retries", async () => {
  const {processJob}=await import("../server/queue.ts");
  const {setSecret,get}=await import("../server/store.ts");
  setSecret("siray","test-only");
  const original=globalThis.fetch;
  try {
    for(const level of [1,5,10]) {
      const p=newProject();put("projects",p);
      const product={id:"product-"+level,internalName:"Campaign",externalName:"Gym app",description:"Fitness coaching",url:"",painPoints:"Unsure how to train",costOfInaction:"",solution:"Guided plans",proof:""};
      put("products",product);
      const job=addJob(p.id,"hooks","Hooks",{hookPromptVersion:"virality-v1",viralityLevel:level,productSnapshot:structuredClone(product),productId:product.id,count:21,completed:0,language:"Russian",model:"openai/gpt-4.1-mini"});
      let call=0;const bodies:any[]=[];
      globalThis.fetch=async (_url,init)=>{
        const body=JSON.parse(String(init?.body));bodies.push(body);call++;
        if(call===2) throw new Error("simulated connection failure");
        const context=JSON.parse(body.messages[1].content);
        put("products",{...product,description:"Changed after start"});
        return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({hooks:Array.from({length:context.count},(_,i)=>"Hook "+level+"-"+call+"-"+i)})}}]}));
      };
      await processJob(job);
      assert.equal(get("jobs",job.id)?.status,"failed");
      assert.equal(get("projects",p.id)?.hooks.length,20);
      await processJob(get("jobs",job.id)!);
      assert.equal(get("jobs",job.id)?.status,"completed");
      assert.equal(get("projects",p.id)?.hooks.length,21);
      for(const body of bodies) {
        assert.equal(body.model,"openai/gpt-4.1-mini");
        assert.match(body.messages[0].content,new RegExp("Virality level: "+level+"/10"));
        const context=JSON.parse(body.messages[1].content);
        assert.equal(context.viralityLevel,level);assert.equal(context.language,"Russian");
        assert.equal(context.product.description,"Fitness coaching");
      }
      assert.equal(JSON.parse(bodies.at(-1).messages[1].content).avoid.length,20);
    }
  } finally {globalThis.fetch=original;}
});

test("render snapshots retain text size, position, hook selection and segment volumes",()=>{
 const p=newProject();p.composition.fontSize=93;p.composition.position="lower-middle";p.composition.reactionVolume=0;p.composition.demoVolume=.65;
 p.hooks=[{id:"wanted",text:"Selected",createdAt:""},{id:"later",text:"Save for later",enabled:false,createdAt:""}];p.reactionIds=["snapshot-reaction"];
 put("assets",{id:"snapshot-reaction",key:"r.mp4",name:"r",size:1,kind:"reaction",projectId:p.id,mime:"video/mp4",createdAt:"",duration:1});
 const batch=queueRender(p);assert.equal(batch.count,1);
 const job=all("jobs").find(j=>j.batchId===batch.batchId)!;
 assert.equal(job.input.hook.id,"wanted");assert.equal(job.input.composition.fontSize,93);assert.equal(job.input.composition.position,"lower-middle");assert.equal(job.input.composition.textLayoutVersion,2);
 p.composition.fontSize=20;p.composition.reactionVolume=1;
 assert.equal(job.input.composition.fontSize,93);assert.equal(job.input.composition.reactionVolume,0);assert.equal(job.input.composition.demoVolume,.65);
});
