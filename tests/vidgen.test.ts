import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {spawn} from "node:child_process";
import {pathToFileURL} from "node:url";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";
import https from "node:https";
import {EventEmitter} from "node:events";
import {Readable} from "node:stream";
import type {Model} from "../shared/types.ts";
import {vidGenPayload} from "../shared/vidgen.ts";
import {newProject} from "../shared/project.ts";
import {projectSchema} from "../shared/schema.ts";
const model:Model={id:"fixture/video",name:"Fixture video",kind:"video",schema:{
 required:["model","prompt","duration"],
 properties:{
  model:{type:"string"},prompt:{type:"string"},duration:{type:"integer",minimum:1,maximum:30},
  seed:{type:"integer",minimum:0},audio_enable:{type:"boolean"},n:{type:"integer",minimum:1,maximum:4},
  videos:{type:"array",items:{type:"string","x-format":"video"}},
  images:{type:"array",maxItems:2,items:{type:"string"}},
  elements:{type:"array",items:{type:"object",required:["image"],properties:{image:{type:"string"},strength:{type:"number",minimum:0,maximum:1}}}}
 }
}};
test("VidGen preserves explicit settings and isolates per-model drafts",()=>{
 const inputs={prompt:"Exact prompt",duration:12,seed:0,audio_enable:false,n:3,images:["asset:one"],elements:[{image:"asset:two",strength:.5}]};
 assert.deepEqual(vidGenPayload(model,inputs),{model:model.id,...inputs});
 for(const invalid of [{...inputs,duration:1.5},{...inputs,audio_enable:"false"},{...inputs,images:["1","2","3"]},{...inputs,elements:[{image:"x",strength:2}]},{...inputs,elements:[{}]},{...inputs,unexpected:true}])assert.throws(()=>vidGenPayload(model,invalid));
 assert.throws(()=>vidGenPayload({...model,kind:"text"},inputs));
 const p=newProject();p.vidGen={modelId:model.id,inputsByModel:{[model.id]:inputs,other:{prompt:"Different"}}};
 assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))).vidGen,p.vidGen);
});
const dir=await mkdtemp(path.join(os.tmpdir(),"avem-vidgen-"));process.env.DATA_DIR=dir;
const {put,get,all,addJob,setSecret,mediaDir}=await import("../server/store.ts");
const {processJob}=await import("../server/queue.ts");
const {run,ffmpeg,probe}=await import("../server/render.ts");
test("VidGen sends exact resolved inputs, resumes provider tasks and saves every original",async()=>{
 const file=path.join(mediaDir,"fixture.mp4");
 await run(ffmpeg,["-y","-v","error","-f","lavfi","-i","color=c=black:s=96x160:r=15","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-t","8","-c:v","libx264","-c:a","aac",file]);
 const bytes=await readFile(file);
 const p=newProject();put("projects",p);setSecret("siray","test-only");
 put("assets",{id:"reference",key:"fixture.mp4",name:"Reference",kind:"reaction",projectId:p.id,mime:"video/mp4",size:bytes.length,createdAt:""});
 const payload={model:model.id,prompt:"asset: this is literal prompt text, not a file",duration:8,seed:0,audio_enable:true,n:2,videos:["asset:reference"]};
 const job=addJob(p.id,"video","VidGen fixture",{tool:"vidgen",model:model.id,prompt:payload.prompt,payload,modelDefinition:model});
 const originalFetch=globalThis.fetch,originalLookup=dns.lookup,originalRequest=https.request;
 let submissions=0,failSecond=true,sent:any;
 globalThis.fetch=async(_url,init)=>{
   if(init?.method==="POST"){submissions++;sent=JSON.parse(String(init.body));return Response.json({task_id:"saved-task"});}
   return Response.json({status:"SUCCESS",outputs:["https://fixture.example/one.mp4","https://fixture.example/two.mp4"]});
 };
 dns.lookup=(async()=>[{address:"93.184.216.34",family:4}]) as any;
 https.request=((url:any,_options:any,callback:any)=>{
   const request=new EventEmitter() as any;request.setTimeout=()=>request;
   request.end=()=>queueMicrotask(()=>{if(String(url).includes("two.mp4")&&failSecond){failSecond=false;request.emit("error",new Error("Download interrupted"));}else callback(Object.assign(Readable.from([bytes]),{statusCode:200,headers:{"content-type":"video/mp4"}}));});return request;
 }) as any;
 try {
   await processJob(job);assert.equal(get("jobs",job.id)?.status,"failed");assert.equal(get("jobs",job.id)?.taskId,"saved-task");
   assert.equal(all("assets").filter(a=>a.jobId===job.id).length,1);
   await processJob(get("jobs",job.id)!);assert.equal(get("jobs",job.id)?.status,"completed");assert.equal(submissions,1);
   assert.equal(sent.duration,8);assert.equal(sent.seed,0);assert.equal(sent.n,2);assert.equal(sent.audio_enable,true);assert.equal(sent.prompt,payload.prompt);
   assert.match(sent.videos[0],/^data:video\/mp4;base64,/);
   const outputs=all("assets").filter(a=>a.jobId===job.id);assert.equal(outputs.length,2);
   for(const asset of outputs){const actual=await probe(path.join(mediaDir,asset.key));assert(actual.duration>=8);assert.equal(actual.width,96);assert(actual.hasAudio);assert.deepEqual(await readFile(path.join(mediaDir,asset.key)),bytes);}
 } finally {globalThis.fetch=originalFetch;dns.lookup=originalLookup;https.request=originalRequest;}
});

test("VidGen API authenticates, validates, snapshots, and deduplicates submissions",async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),"avem-vidgen-api-"));
 const boot=path.join(home,"boot.mjs");
 const entry={id:model.id,model_name:model.id,name:model.name,tag:"text-to-video",schema:model.schema};
 await writeFile(boot,`globalThis.fetch=async url=>{if(String(url).includes('model-verse'))return Response.json({data:[${JSON.stringify(entry)}]});if(String(url).endsWith('/v1/models'))return Response.json({data:[${JSON.stringify(entry)}]});throw new Error('Unexpected external call');};await import(${JSON.stringify(pathToFileURL(path.resolve("server/index.ts")).href)});`);
 const port=30000+Math.floor(Math.random()*5000),base=`http://127.0.0.1:${port}/api`;
 const child=spawn(process.execPath,["--import","tsx",boot],{cwd:process.cwd(),windowsHide:true,env:{...process.env,DATA_DIR:home,PORT:String(port),HOST:"127.0.0.1",APP_PASSWORD:"fixture",ENCRYPTION_KEY:"fixture-only",QUEUE_ENABLED:"0",LOG_LEVEL:"silent",LOCAL_APP:"0"},stdio:"ignore"});
 let token="";
 const api=async(route:string,method="GET",body?:unknown)=>{const r=await fetch(base+route,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 try {
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+"/health")).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready);
  const p=newProject(),requestId=crypto.randomUUID(),input={projectId:p.id,modelId:model.id,requestId,inputs:{prompt:"Exact",duration:12,seed:0,n:3,audio_enable:false}};
  assert.equal((await api("/vidgen","POST",input)).status,401);
  token=(await api("/login","POST",{password:"fixture"})).body.token;
  await api(`/projects/${p.id}`,"PUT",p);await api("/settings","PUT",{apiKey:"test-only"});
  const first=await api("/vidgen","POST",input);assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.input.payload.seed,0);assert.equal(first.body.input.payload.n,3);
  assert.equal((await api("/vidgen","POST",input)).body.id,first.body.id);
  assert.equal((await api("/vidgen","POST",{...input,requestId:crypto.randomUUID(),inputs:{...input.inputs,duration:1.5}})).status,400);
  const jobs=(await api("/state")).body.jobs;
  assert.equal(jobs.length,1);
  assert.equal(jobs[0].input,undefined);
  assert.equal(jobs[0].tool,"vidgen");
  assert.deepEqual(jobs[0].requestSettings,{model:model.id,...input.inputs});
 } finally {await new Promise<void>(resolve=>{if(child.exitCode!==null)return resolve();child.once("exit",()=>resolve());child.kill();});}
});
