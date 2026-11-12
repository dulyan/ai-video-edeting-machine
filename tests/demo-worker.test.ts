import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp,copyFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {newProject} from '../shared/project.ts';
import {newDemoCreation,defaultCorners} from '../shared/demo-creation.ts';
const python=process.env.DEMO_PYTHON||path.join(process.env.LOCALAPPDATA||'', 'AI Video Edeting Machine','demo-worker','venv','Scripts','python.exe');
const ready=existsSync(python)&&spawnSync(python,['-c','import cv2, numpy'],{windowsHide:true,timeout:15000}).status===0;
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'avem-demo-worker-'));process.env.DEMO_PYTHON=python;
const {ffmpeg,run,probe}=await import('../server/render.ts');
const {put,get,addJob,mediaDir,db}=await import('../server/store.ts');
const {processDemoJob,demoTrackingKey}=await import('../server/demo.ts');
test('real local demo media pipeline: deterministic screens, foreground compositing, audio retention and final demo library', {skip:!ready?'Install the optional demo worker to run real media checks.':false,timeout:120000},async()=>{
 const fixture=path.join(process.env.DATA_DIR!,'fixture');
 await run(python,['tests/demo-worker-check.py',fixture,ffmpeg]);
 const p=newProject();p.demoCreation=newDemoCreation();const d=p.demoCreation;Object.assign(d,{sourceId:'source',duration:3,instructions:'Tap next.',screens:[{assetId:'first',name:'Home',instructions:''},{assetId:'last',name:'Next',instructions:''}],actions:[{id:'a',description:'Tap',gesture:'tap',at:.5,until:1,screen:0,next:1,target:[.5,.5],end:[.5,.5],viewport:[0,1],transition:'fade',transitionDuration:.25}],candidateId:'candidate',useGpu:false});put('projects',p);
 for(const id of ['source','candidate','first','last']){const image=['first','last'].includes(id),key=id+(image?'.png':'.mp4');if(id==='source')await run(ffmpeg,['-y','-v','error','-i',path.join(fixture,key),'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','copy','-c:a','aac',path.join(mediaDir,key)]);else await copyFile(path.join(fixture,key),path.join(mediaDir,key));put('assets',{id,key,name:id,kind:image?'hook-image':'presenter',projectId:p.id,mime:image?'image/png':'video/mp4',size:100,duration:3,width:160,height:240,createdAt:''});}
 const execute=async(phase:string)=>{const job=addJob(p.id,'demo','Demo '+phase,{tool:'demo-creation',phase,draft:structuredClone(d),fingerprint:demoTrackingKey(d)});await processDemoJob(job,new AbortController().signal);assert.equal(get('jobs',job.id)?.status,'completed');return job.id;};
 d.walkthroughId=await execute('walkthrough');d.recordingApproved=true;
 const cal={time:0,corners:structuredClone(defaultCorners),hand:[],holding:[],exclude:[],maskStrokes:[{object:'hand' as const,points:[[.5,.5] as [number,number]],radius:.06,erase:false}],editRegion:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]] as [number,number][]};d.sourceCalibration=[cal];d.candidateCalibration=[structuredClone(cal)];
 d.trackingJobId=await execute('track');d.previewId=await execute('preview');d.sceneApproved=true;d.reviews.a={point:[.5,.5],end:[.5,.5],startRecorded:true,endRecorded:false,startTime:1,endTime:1,approved:true};
 const final=await execute('render'),asset=get('assets',final)!;assert.equal(asset.kind,'demo');assert.equal(asset.projectId,p.id);const meta=await probe(path.join(mediaDir,asset.key));assert(Math.abs(meta.duration-3)<.1);
 const probeResult=await run(ffmpeg,['-i',path.join(mediaDir,asset.key),'-map','0:a:0','-t','0.1','-f','null','-']);assert.equal(typeof probeResult,'string');
 const frames=JSON.parse(await readFile(path.join(process.env.DATA_DIR!,'work','demo',d.trackingJobId,'tracks.json'),'utf8'));assert.equal(frames.source.frames.length,90);db.close();
});
