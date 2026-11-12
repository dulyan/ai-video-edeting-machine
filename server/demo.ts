import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile,stat,copyFile,rm,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Asset,Job,Model} from '../shared/types.ts';
import {demoCreationSchema,demoActionSchema,demoMotionPrompt,validateDemoTimeline,validateDemoReview,type DemoCreationDraft} from '../shared/demo-creation.ts';
import {addJob,get,patchJob,mediaDir,workDir,dataDir} from './store.ts';
import {downloadAsset,storeFile} from './storage.ts';
import {ffmpeg,probe,run} from './render.ts';
import {getCatalog} from './catalog.ts';
import {siray} from './siray.ts';
import {vidGenPayload} from '../shared/vidgen.ts';
const workerHome=process.env.DEMO_WORKER_HOME||path.join(path.dirname(dataDir),'demo-worker');
export const demoPython=process.env.DEMO_PYTHON||path.join(workerHome,'venv','Scripts','python.exe');
const worker=fileURLToPath(new URL('./demo-worker.py',import.meta.url));
const phases=['analyze','walkthrough','motion','track','preview','render'] as const;
const ordered=(v:any):any=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(ordered(v))).digest('hex');
export const demoTrackingKey=(d:DemoCreationDraft)=>hash([d.sourceId,d.start,d.duration,d.candidateId,d.sourceCalibration,d.candidateCalibration,d.useGpu]);
const compositeKey=(d:DemoCreationDraft)=>hash([demoTrackingKey(d),d.scene,d.walkthroughId,d.trackingJobId]);
const walkthroughKey=(d:DemoCreationDraft)=>hash([d.duration,d.inputMode,d.screens,d.recordingId,d.recordingStart,d.instructions,d.actions]);
function currentWalkthrough(d:DemoCreationDraft,projectId:string){const j=get('jobs',d.walkthroughId);if(!j||j.projectId!==projectId||j.status!=='completed'||j.input.phase!=='walkthrough'||walkthroughKey(j.input.draft)!==walkthroughKey(d))throw new Error('The selected screen animation is stale. Render and select one for the current timeline.');}
const stageDirectory=(id:string)=>{if(!/^[\w-]{1,200}$/.test(id))throw new Error('Invalid job ID');return path.join(workDir,'demo',id);};
function asset(id:string,type:'video'|'image'){const a=get('assets',id);if(!a||!a.mime.startsWith(type+'/'))throw new Error(`Choose a valid ${type} asset`);if(Math.max(a.width||0,a.height||0)>3840)throw new Error('Demo Creation supports sources up to 4K. Supply a 4K or smaller copy.');return a;}
async function localAsset(id:string,type:'video'|'image',dir:string){const a=asset(id,type),local=path.resolve(mediaDir,a.key);if(!local.startsWith(mediaDir+path.sep))throw new Error('Invalid media path');if(existsSync(local))return local;const file=path.join(dir,`${a.id}.input`);if(!existsSync(file))await downloadAsset(a,file);return file;}
export async function demoWorker(manifest:Record<string,unknown>,dir:string,signal?:AbortSignal,progress?:(n:number,message:string)=>void){
 if(!existsSync(demoPython))throw new Error('Demo worker is not installed. Run scripts/setup-demo-worker.ps1 first.');
 await mkdir(dir,{recursive:true});const input=path.join(dir,crypto.randomUUID()+'.json');await writeFile(input,JSON.stringify({...manifest,ffmpeg,checkpoint:path.join(workerHome,'sam2.1_hiera_small.pt')}));
 return new Promise<void>((resolve,reject)=>{
  const child=spawn(demoPython,[worker,input],{windowsHide:true,signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20*60*1000)]),env:{...process.env,OMP_NUM_THREADS:'2',MKL_NUM_THREADS:'2',PYTHONUNBUFFERED:'1'}});let buffer='',errors='',reported='';
  child.stdout.on('data',b=>{buffer+=b.toString();let n;while((n=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);try{const p=JSON.parse(line);if(p.error)reported=p.error;if(p.progress!==undefined)progress?.(p.progress,p.message||'Processing');}catch{}}if(buffer.length>10000)buffer=buffer.slice(-10000);});
  child.stderr.on('data',b=>errors=(errors+b).slice(-5000));child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(reported||errors||'Demo worker stopped')));
 });
}
async function referenceFile(d:DemoCreationDraft,dir:string,signal?:AbortSignal){
 const a=asset(d.sourceId,'video');if(d.start+d.duration>(a.duration||0)+.05)throw new Error('Selected segment extends beyond the reference video');
 const input=await localAsset(a.id,'video',dir),output=path.join(dir,'reference.mp4');
 if(!existsSync(output)){await run(ffmpeg,['-y','-v','error','-threads','2','-filter_threads','2','-ss',String(d.start),'-i',input,'-t',String(d.duration),'-vf',"scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",'-c:v','libx264','-preset','fast','-crf','18','-threads','2','-c:a','aac','-movflags','+faststart',output+'.partial.mp4'],undefined,undefined,signal);await rename(output+'.partial.mp4',output);}
 return output;
}
async function candidateFile(d:DemoCreationDraft,dir:string,signal?:AbortSignal){const input=await localAsset(d.candidateId,'video',dir),output=path.join(dir,'candidate-30fps.mp4');if(!existsSync(output)){await run(ffmpeg,['-y','-v','error','-threads','2','-filter_threads','2','-i',input,'-t',String(d.duration),'-vf',"fps=30,scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-an','-c:v','libx264','-preset','fast','-crf','18','-threads','2',output+'.partial.mp4'],undefined,undefined,signal);await rename(output+'.partial.mp4',output);}return output;}
async function recordingFile(d:DemoCreationDraft,dir:string,signal?:AbortSignal){const input=await localAsset(d.recordingId,'video',dir),output=path.join(dir,'recording-30fps.mp4');await run(ffmpeg,['-y','-v','error','-threads','2','-filter_threads','2','-ss',String(d.recordingStart),'-i',input,'-t',String(d.duration),'-vf',"fps=30,scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-an','-c:v','libx264','-preset','fast','-crf','18','-threads','2',output],undefined,undefined,signal);return output;}
async function saveVideo(job:Job,file:string,kind:Asset['kind'],name:string){
 const key=job.id+'.mp4',output=path.join(mediaDir,key);if(file!==output)await run(ffmpeg,['-y','-v','error','-i',file,'-c','copy',output]);
 const m=await probe(output);const a:Asset={id:job.id,key,name,kind,projectId:job.projectId,createdAt:new Date().toISOString(),mime:'video/mp4',size:(await stat(output)).size,duration:m.duration,width:m.width,height:m.height,jobId:job.id};
 if(get('jobs',job.id)?.status==='canceled')return;await storeFile(output,a);patchJob(job.id,{outputId:a.id});
}
function validateReferences(d:DemoCreationDraft){
 asset(d.sourceId,'video');validateDemoTimeline(d);
 if(d.inputMode==='screenshots'){const screens=d.screens.map(s=>asset(s.assetId,'image'));const first=screens[0];if(first.width&&first.height&&screens.some(s=>s.width&&s.height&&Math.abs(s.width/s.height-first.width!/first.height!)>.005))throw new Error('Use screenshots with the same aspect ratio so touch targets remain aligned.');}else{const a=asset(d.recordingId,'video');if(d.recordingStart+d.duration>(a.duration||0)+.05)throw new Error('Screen recording ends too early');}
}
function validateCalibration(d:DemoCreationDraft){
 for(const [name,cal] of [['Source',d.sourceCalibration],['Candidate',d.candidateCalibration]] as const){
  if(!cal.length||cal[0].time!==0)throw new Error(`${name}: add calibration at time zero.`);
  if(cal.some((c,i)=>c.time>=d.duration||(i>0&&c.time<=cal[i-1].time)))throw new Error('Calibration times must be unique, sorted and within the clip.');
  for(const c of cal){const p=c.corners;let area=0;for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4],next=p[(i+2)%4];area+=a[0]*b[1]-b[0]*a[1];if((b[0]-a[0])*(next[1]-b[1])-(b[1]-a[1])*(next[0]-b[0])<=0)throw new Error('Screen corners must form a convex clockwise quadrilateral.');}if(area<.002)throw new Error('Mark screen corners clockwise: top-left, top-right, bottom-right, bottom-left.');}
  if(d.useGpu&&!cal[0].hand.length)throw new Error(`${name}: mark the interacting hand before GPU segmentation.`);
 }
 if(d.scene==='preserve'&&d.sourceCalibration.some(c=>!c.editRegion||c.editRegion.length<3))throw new Error('Draw an editable region with at least three points around the old and new gesture paths.');
}
export async function processDemoJob(job:Job,signal:AbortSignal){
 const d=demoCreationSchema.parse(job.input.draft),dir=stageDirectory(job.id);await mkdir(dir,{recursive:true});
 const progress=(n:number,message:string)=>{if(get('jobs',job.id)?.status!=='canceled')patchJob(job.id,{progress:Math.min(99,Math.round(n)),demoPhase:message});};
 if(job.input.phase==='analyze'){
  const reference=await referenceFile(d,dir,signal),content:any[]=[{type:'text',text:`Plan a ${d.duration}-second ${d.device} app walkthrough. Screenshots are ordered. Return JSON {actions:[{id,description,gesture:"tap"|"swipe"|"hold",at,until,screen,next,target:[x,y],end:[x,y],transition:"hold"|"fade"|"slide"|"scroll",transitionDuration}],issues:[strings]}. Coordinates normalized 0..1 within the SCREEN, not the full camera frame. Times are relative to clip start; screen indices zero-based. Actions must fit the duration including transitions, be chronological and non-overlapping. Use only supplied app content. Return proposals, never claim taps/tracking verified. Report missing states, cuts, occlusion and uncertain targets. User walkthrough: ${d.instructions}\nScreens: ${JSON.stringify((d.inputMode==='screenshots'?d.screens:[]).map(s=>({name:s.name,instructions:s.instructions})))}`}];
  for(const [i,t] of [0,d.duration/2,Math.max(0,d.duration-.1)].entries()){const file=path.join(dir,`sample-${i}.jpg`);await run(ffmpeg,['-y','-v','error','-ss',String(t),'-i',reference,'-frames:v','1','-vf','scale=640:-2','-threads','1',file],undefined,undefined,signal);content.push({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+(await readFile(file)).toString('base64')}});}
  for(const [i,screen] of (d.inputMode==='screenshots'?d.screens:[]).slice(0,20).entries()){const input=await localAsset(screen.assetId,'image',dir),file=path.join(dir,`screen-${i}.jpg`);await run(ffmpeg,['-y','-v','error','-threads','1','-i',input,'-frames:v','1','-vf',"scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease",'-threads','1','-q:v','3',file],undefined,undefined,signal);content.push({type:'text',text:`App screenshot ${i+1}: ${screen.name}`},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+(await readFile(file)).toString('base64')}});}
  if(d.inputMode==='recording'){const recording=await localAsset(d.recordingId,'video',dir);for(const t of [d.recordingStart,d.recordingStart+d.duration/2]){const file=path.join(dir,crypto.randomUUID()+'.jpg');await run(ffmpeg,['-y','-v','error','-ss',String(t),'-i',recording,'-frames:v','1','-vf','scale=640:-2',file],undefined,undefined,signal);content.push({type:'image_url',image_url:{url:'data:image/jpeg;base64,'+(await readFile(file)).toString('base64')}});}}
  progress(20,'Analyzing reference and app screens');
  if(signal.aborted||get('jobs',job.id)?.status==='canceled')return;
  const response=await siray('/v1/chat/completions',{model:d.planningModel,messages:[{role:'system',content:'You are a precise app-demo planner. Return JSON only. Never invent missing app content; flag uncertainty.'},{role:'user',content}],max_tokens:6000});
  const parsed=JSON.parse(String(response.choices?.[0]?.message?.content||'').replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
  const result=z.object({actions:z.array(demoActionSchema).max(30),issues:z.array(z.string().max(2000)).max(50)}).parse(parsed);validateDemoTimeline({...d,actions:result.actions});patchJob(job.id,{demoResult:result});
 }else if(job.input.phase==='walkthrough'){
  validateReferences(d);const screens=await Promise.all(d.inputMode==='screenshots'?d.screens.map(s=>localAsset(s.assetId,'image',dir)):[]),recording=d.inputMode==='recording'?await recordingFile(d,dir,signal):undefined,output=path.join(dir,'walkthrough.mp4');
  await demoWorker({mode:'walkthrough',draft:{...d,recordingStart:0},screens,recording,output},dir,signal,progress);await saveVideo(job,output,'presenter','Demo walkthrough');
 }else if(job.input.phase==='motion'){
  const childId=job.id+'-candidate';if(!get('jobs',childId)){
   const ref=await referenceFile(d,dir,signal),refId=job.id+'-reference';
   if(!get('assets',refId)){const refAsset:Asset={id:refId,key:refId+'.mp4',name:'Demo reference segment',kind:'presenter',projectId:job.projectId,createdAt:new Date().toISOString(),mime:'video/mp4',size:(await stat(ref)).size,...await probe(ref)};const stored=path.join(mediaDir,refAsset.key);await copyFile(ref,stored);await storeFile(stored,refAsset);}
   const model:Model=job.input.modelDefinition,inputs:Record<string,unknown>={prompt:demoMotionPrompt(d),duration:d.duration,size:d.size,aspect_ratio:model.schema?.properties?.aspect_ratio?.enum?.includes('auto')?'auto':'adaptive'};
   if(model.id==='bytedance/seedance-2.5-ref2v'){inputs.prompt+='\nThe first input video is the physical scene to edit. The second input video is the timed app-screen walkthrough: use it only to guide gesture sequence and timing, never as the physical scene.';inputs.task_type='edit';inputs.videos=['asset:'+refId,'asset:'+d.walkthroughId];inputs.audio_enable=false;}
   else{inputs.video='asset:'+refId;inputs.keep_original_sound=false;}
   if(signal.aborted||get('jobs',job.id)?.status==='canceled')return;
   addJob(job.projectId,'video','Demo movement candidate',{tool:'demo-creation',payload:vidGenPayload(model,inputs),model:model.id,modelDefinition:model,prompt:inputs.prompt,demoDraft:d},job.batchId,childId);
  }patchJob(job.id,{demoResult:{childId}});
 }else if(job.input.phase==='track'){
  validateCalibration(d);const source=await referenceFile(d,dir,signal),candidate=await candidateFile(d,dir,signal),output=path.join(dir,'tracks.json');
  await demoWorker({mode:'track',draft:d,source,candidate,output,directory:dir},dir,signal,progress);
  const track=JSON.parse(await readFile(output,'utf8'));patchJob(job.id,{demoResult:{issues:[...track.source.warnings,...track.candidate.warnings].length?['Some tracking frames lost confidence. Inspect and correct screen corners before approval.']:[]}});
 }else if(['render','preview'].includes(job.input.phase)){
  if(job.input.phase==='render')validateDemoReview(d);const track=get('jobs',d.trackingJobId);if(!track||track.status!=='completed'||track.input.fingerprint!==demoTrackingKey(d))throw new Error('Tracking is stale. Run tracking again.');
  const source=await referenceFile(d,dir,signal),candidate=await candidateFile(d,dir,signal),walkthrough=await localAsset(d.walkthroughId,'video',dir),trackingDirectory=stageDirectory(track.id),silent=path.join(dir,'silent.mp4');
  await demoWorker({mode:'composite',draft:d,source,candidate,walkthrough,tracks:path.join(trackingDirectory,'tracks.json'),trackingDirectory,output:silent},dir,signal,progress);
  const output=path.join(dir,'finished.mp4');await run(ffmpeg,['-y','-v','error','-i',silent,'-i',source,'-map','0:v:0','-map','1:a?','-c:v','copy','-c:a','aac','-t',String(d.duration),'-movflags','+faststart',output],undefined,undefined,signal);await saveVideo(job,output,job.input.phase==='render'?'demo':'presenter',job.input.phase==='render'?'App walkthrough demo':'Demo review preview');
 }else throw new Error('Unsupported demo phase');
 if(get('jobs',job.id)?.status!=='canceled')patchJob(job.id,{status:'completed',progress:100,demoPhase:'Complete'});
}
export function registerDemoRoutes(app:FastifyInstance){
 let frameBusy=false;
 app.get('/api/demo/status',async()=>({installed:existsSync(path.join(workerHome,'ready.json')),pythonAvailable:existsSync(demoPython),gpuCheckpoint:existsSync(path.join(workerHome,'sam2.1_hiera_small.pt'))}));
 app.post('/api/demo/jobs',async req=>{
  const {projectId,phase,requestId}=z.object({projectId:z.string(),phase:z.enum(phases),requestId:z.uuid()}).parse(req.body),p=get('projects',projectId);if(!p)throw new Error('Project not found');
  const d=demoCreationSchema.parse(p.demoCreation);const existing=get('jobs',requestId);if(existing){if(existing.projectId!==projectId||existing.input.tool!=='demo-creation'||existing.input.phase!==phase)throw new Error('Request ID conflict');return existing;}
  asset(d.sourceId,'video');if(d.start+d.duration>(asset(d.sourceId,'video').duration||0)+.05)throw new Error('Reference segment exceeds the source duration');
  if(phase!=='analyze')validateReferences(d);else if(!d.instructions.trim())throw new Error('Describe the walkthrough.');
  let model:Model|undefined;
  if(phase==='motion'){
   if(!d.walkthroughId||!d.recordingApproved)throw new Error('Render, inspect, and approve the walkthrough first.');asset(d.walkthroughId,'video');
   currentWalkthrough(d,projectId);
   if(!['kuaishou/kling-4.0-video-edit','bytedance/seedance-2.5-ref2v'].includes(d.videoModel))throw new Error('Choose a supported demo editing model');
   model=(await getCatalog()).find(m=>m.id===d.videoModel&&m.active!==false);if(!model)throw new Error('Selected video model is unavailable');
   if(!model.schema?.properties?.duration?.enum?.includes(d.duration)||!model.schema?.properties?.size?.enum?.includes(d.size))throw new Error('Selected model does not support this duration/resolution. Choose supported settings; no automatic substitution is made.');
  }
  if(phase==='analyze'){if(d.inputMode==='screenshots'&&(!d.screens.length||d.screens.length>20))throw new Error('Analysis supports 1–20 screenshots. Use a recording or manually plan larger sets.');if(d.inputMode==='recording')asset(d.recordingId,'video');model=(await getCatalog()).find(m=>m.id===d.planningModel&&m.kind==='text'&&m.active!==false);if(!model)throw new Error('Choose an available vision planning model');}
  if(phase==='track'){asset(d.candidateId,'video');validateCalibration(d);}
  if(phase==='render'||phase==='preview'){asset(d.candidateId,'video');asset(d.walkthroughId,'video');if(phase==='render'){validateDemoReview(d);const preview=get('jobs',d.previewId);if(!preview||preview.projectId!==projectId||preview.status!=='completed'||preview.input.phase!=='preview'||preview.input.compositeKey!==compositeKey(d))throw new Error('The review preview is stale. Render and inspect a current preview.');}const t=get('jobs',d.trackingJobId);if(!t||t.projectId!==projectId||t.status!=='completed'||t.input.fingerprint!==demoTrackingKey(d))throw new Error('Run tracking for the current settings before rendering.');}
  if(phase==='render'||phase==='preview')currentWalkthrough(d,projectId);
  return addJob(projectId,'demo','Demo '+phase,{tool:'demo-creation',phase,draft:d,modelDefinition:model,fingerprint:demoTrackingKey(d),compositeKey:compositeKey(d)},undefined,requestId);
 });
 app.post('/api/demo/frame',async(req,reply)=>{
  const {projectId,assetId,time,trackingJobId,view,rectified,overlay}=z.object({projectId:z.string(),assetId:z.string(),time:z.number().min(0).max(86400),trackingJobId:z.string().optional(),view:z.enum(['source','candidate']).default('candidate'),rectified:z.boolean().default(false),overlay:z.enum(['none','hand','holding']).default('none')}).parse(req.body);
  if(!get('projects',projectId))throw new Error('Project not found');const a=asset(assetId,'video');if(time>(a.duration||0))throw new Error('Frame is outside this video');if(Math.max(a.width||0,a.height||0)>3840)throw new Error('Correction frames support up to 4K sources. Choose a 4K or smaller reference.');
  if(frameBusy)throw Object.assign(new Error('A correction frame is loading. Try again shortly.'),{statusCode:429});frameBusy=true;
  const dir=stageDirectory(crypto.randomUUID());
  try{await mkdir(dir,{recursive:true});const source=await localAsset(assetId,'video',dir),output=path.join(dir,'frame.png');let tracks:string|undefined,trackingDirectory:string|undefined,trackTime=time,screenSize:number[]|undefined;
   if(trackingJobId){const j=get('jobs',trackingJobId);if(!j||j.projectId!==projectId||j.status!=='completed'||j.input.phase!=='track')throw new Error('Choose completed tracking');trackingDirectory=stageDirectory(j.id);tracks=path.join(trackingDirectory,'tracks.json');if(view==='source')trackTime=Math.max(0,time-j.input.draft.start);const screen=get('assets',j.input.draft.walkthroughId);if(screen?.width&&screen?.height)screenSize=[screen.width,screen.height];}
   await demoWorker({mode:'frame',source,time,trackTime,tracks,trackingDirectory,view,rectified,overlay,screenSize,output},dir,AbortSignal.timeout(30000));return reply.header('Cache-Control','no-store').type('image/png').send(await readFile(output));
  }finally{frameBusy=false;await rm(dir,{recursive:true,force:true});}
 });
}
