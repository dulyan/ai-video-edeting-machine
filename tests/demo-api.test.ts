import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import {newProject} from '../shared/project.ts';
import {newDemoCreation,defaultCorners} from '../shared/demo-creation.ts';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'demo-api-'));
const {put,get,all}=await import('../server/store.ts');
const {registerDemoRoutes,demoTrackingKey}=await import('../server/demo.ts');
const app=Fastify();app.setErrorHandler((error,req,reply)=>reply.code(400).send({error:(error as Error).message}));registerDemoRoutes(app);after(()=>app.close());
const p=newProject();p.demoCreation=newDemoCreation();const d=p.demoCreation;
Object.assign(d,{sourceId:'source',instructions:'Tap then show result',screens:[{assetId:'screen',name:'Home',instructions:''}],actions:[{id:'a',description:'Tap',gesture:'tap',at:.5,until:1,screen:0,next:0,target:[.5,.5],end:[.5,.5],viewport:[0,1],transition:'hold',transitionDuration:0}]});put('projects',p);
for(const [id,mime] of [['source','video/mp4'],['candidate','video/mp4'],['screen','image/png'],['walkthrough','video/mp4']])put('assets',{id,key:id,name:id,mime,kind:mime.startsWith('video')?'presenter':'hook-image',projectId:p.id,createdAt:'',duration:10,size:10});
const post=(phase:string,requestId=crypto.randomUUID())=>app.inject({method:'POST',url:'/api/demo/jobs',payload:{projectId:p.id,phase,requestId}});
test('local walkthrough stage is durable/idempotent and retains an immutable snapshot',async()=>{
 const id=crypto.randomUUID(),r=await post('walkthrough',id);assert.equal(r.statusCode,200);assert.equal((await post('walkthrough',id)).json().id,id);assert.equal(all('jobs').length,1);
 const snapshot=get('jobs',id)!.input.draft;d.instructions='Changed later';put('projects',p);assert.equal(snapshot.instructions,'Tap then show result');
});
test('tracking requires frame-zero calibration, valid clockwise corners, hand seeds and an editable preservation region',async()=>{
 d.candidateId='candidate';put('projects',p);assert.equal((await post('track')).statusCode,400);
 d.sourceCalibration=[{time:0,corners:structuredClone(defaultCorners),hand:[[.5,.5]],holding:[],exclude:[],maskStrokes:[],editRegion:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]}];d.candidateCalibration=structuredClone(d.sourceCalibration);put('projects',p);
 assert.equal((await post('track')).statusCode,200);d.candidateCalibration[0].corners.reverse();put('projects',p);assert.equal((await post('track')).statusCode,400);d.candidateCalibration=structuredClone(d.sourceCalibration);
});
test('final export rejects unreviewed scenes and stale tracking; preview is a separate non-final stage',async()=>{
 d.walkthroughId='walkthrough';put('projects',p);assert.equal((await post('render')).statusCode,400);
 put('jobs',{id:'walkthrough',projectId:p.id,batchId:'b',kind:'demo',status:'completed',progress:100,label:'Demo walkthrough',input:{tool:'demo-creation',phase:'walkthrough',draft:structuredClone(d)},createdAt:'',updatedAt:''});
 d.trackingJobId='tracked';put('jobs',{id:'tracked',projectId:p.id,batchId:'b',kind:'demo',status:'completed',progress:100,label:'Demo track',input:{tool:'demo-creation',phase:'track',fingerprint:demoTrackingKey(d)},createdAt:'',updatedAt:''});put('projects',p);
 const preview=await post('preview');assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().input.phase,'preview');
 const before=d.instructions;d.instructions='Changed flow';put('projects',p);assert.equal((await post('preview')).statusCode,400);d.instructions=before;
 d.sourceCalibration[0].corners[0]=[.2,.2];put('projects',p);assert.equal((await post('preview')).statusCode,400);
});
test('invalid references, unsupported phases and reused request IDs from a different project are rejected',async()=>{
 assert.equal((await post('unknown')).statusCode,400);const other=newProject();other.demoCreation={...d};put('projects',other);const job=all('jobs')[0];const r=await app.inject({method:'POST',url:'/api/demo/jobs',payload:{projectId:other.id,phase:'walkthrough',requestId:job.id}});assert.equal(r.statusCode,400);
});
