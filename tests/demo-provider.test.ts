import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type {Model} from '../shared/types.ts';
import {newDemoCreation} from '../shared/demo-creation.ts';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'avem-demo-provider-'));
const {put,get,addJob,mediaDir,setSecret}=await import('../server/store.ts');
const {run,ffmpeg,probe}=await import('../server/render.ts');
const {processDemoJob}=await import('../server/demo.ts');
const {materializeVidGen}=await import('../server/vidgen-inputs.ts');
const {processJob,recoverJobs}=await import('../server/queue.ts');
const definition=(seedance:boolean):Model=>({id:seedance?'bytedance/seedance-2.5-ref2v':'kuaishou/kling-4.0-video-edit',name:'Fixture',kind:'video',schema:{required:['model','prompt','duration','size','aspect_ratio',...(seedance?[]:['video'])],properties:{model:{type:'string'},prompt:{type:'string'},duration:{type:'integer',enum:[6]},size:{type:'string',enum:['1080p']},aspect_ratio:{type:'string',enum:[seedance?'adaptive':'auto']},...(seedance?{videos:{type:'array',items:{type:'string','x-format':'video'}},task_type:{type:'string',enum:['edit']},audio_enable:{type:'boolean'}}:{video:{type:'string','x-format':'video'},keep_original_sound:{type:'boolean'}})}}});
test('demo Siray payloads use trimmed references, native edit controls and saved task IDs without Studio overrides',async()=>{
 const d=newDemoCreation();Object.assign(d,{sourceId:'source',start:1,duration:6,walkthroughId:'walkthrough',recordingApproved:true,instructions:'Tap Create',actions:[{id:'a',description:'Tap',gesture:'tap',at:1,until:2,screen:0,next:0,target:[.3,.4],end:[.3,.4],viewport:[0,1],transition:'hold',transitionDuration:0}]});
 await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=blue:s=160x240:d=8','-threads','2',path.join(mediaDir,'source.mp4')]);
 for(const id of ['source','walkthrough'])put('assets',{id,key:'source.mp4',name:id,projectId:'p',kind:'presenter',mime:'video/mp4',duration:8,size:100,createdAt:''});
 setSecret('siray','mock-only');const actualFetch=globalThis.fetch;let submissions=0,payload:any;
 globalThis.fetch=async(url,options)=>{assert.match(String(url),/^https:\/\/api\.siray\.ai\/v1\/video\/generations/);if(options?.method==='POST'){submissions++;payload=JSON.parse(String(options.body));return Response.json({task_id:'saved-provider-task'});}return Response.json({status:'FAILED',fail_reason:'Mock completion: no paid generation'});};
 try{for(const seedance of [false,true]){
  const model=definition(seedance),parent=addJob('p','demo','Demo motion',{tool:'demo-creation',phase:'motion',draft:d,modelDefinition:model});await processDemoJob(parent,new AbortController().signal);const child=get('jobs',parent.id+'-candidate')!;
  assert.equal(child.input.payload.duration,6);assert.equal(child.input.outputDuration,undefined);assert.equal(child.input.freezeLips,undefined);
  const ref=get('assets',parent.id+'-reference')!;assert(Math.abs((await probe(path.join(mediaDir,ref.key))).duration-6)<.1);
  const materialized=await materializeVidGen(child.input.payload,model);if(seedance){assert.equal(materialized.task_type,'edit');assert.equal((materialized.videos as string[]).length,2);assert.equal(materialized.audio_enable,false);}else{assert.equal(materialized.keep_original_sound,false);assert(String(materialized.video).startsWith('data:video/mp4;base64,'));assert.equal(Buffer.from(String(materialized.video).split(',')[1],'base64').equals(await readFile(path.join(mediaDir,ref.key))),true);}
  const before=submissions;await processJob(child);assert.equal(submissions,before+1);assert.equal(payload.prompt,child.input.payload.prompt);assert.equal(get('jobs',child.id)?.taskId,'saved-provider-task');
  put('jobs',{...get('jobs',child.id)!,status:'running'});recoverJobs();assert.equal(get('jobs',child.id)?.status,'queued');await processJob(get('jobs',child.id)!);assert.equal(submissions,before+1,'Restart must poll the saved task, never submit again');
 }}finally{globalThis.fetch=actualFetch;}
});

test('vision analysis receives labeled bounded copies, saves proposed actions, and marks ambiguous paid failures uncertain',async()=>{
 const d=newDemoCreation();Object.assign(d,{sourceId:'source',start:1,duration:6,instructions:'Tap Create',screens:[{assetId:'screen',name:'Create button',instructions:'Tap the middle'}]});
 await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=white:s=1600x2400','-frames:v','1','-threads','1',path.join(mediaDir,'screen.png')]);put('assets',{id:'screen',key:'screen.png',name:'screen',projectId:'p',kind:'hook-image',mime:'image/png',width:1600,height:2400,size:100,createdAt:''});
 const actualFetch=globalThis.fetch;let content:any[]=[];globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://api.siray.ai/v1/chat/completions');const body=JSON.parse(String(options?.body));content=body.messages[1].content;return Response.json({choices:[{message:{content:JSON.stringify({actions:[{id:'tap',description:'Tap Create',gesture:'tap',at:1,until:2,screen:0,next:0,target:[.5,.5],end:[.5,.5],transition:'hold',transitionDuration:0}],issues:['Review the proposed timing.']})}}]});};
 try{const job=addJob('p','demo','Demo analyze',{tool:'demo-creation',phase:'analyze',draft:d});await processDemoJob(job,new AbortController().signal);assert.equal(get('jobs',job.id)?.demoResult?.actions?.length,1);assert(content.some(c=>c.type==='text'&&c.text==='App screenshot 1: Create button'));const images=content.filter(c=>c.type==='image_url');assert.equal(images.length,4);assert(images.every(c=>c.image_url.url.startsWith('data:image/jpeg;base64,')));
  globalThis.fetch=async()=>{throw new Error('fetch failed: connection outcome unknown');};const failed=addJob('p','demo','Demo analyze',{tool:'demo-creation',phase:'analyze',draft:d});await processJob(failed);assert.equal(get('jobs',failed.id)?.status,'uncertain');
 }finally{globalThis.fetch=actualFetch;}
});
