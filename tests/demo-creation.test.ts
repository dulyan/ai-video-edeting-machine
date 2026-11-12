import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newDemoCreation,demoCreationSchema,changeDemo,validateDemoTimeline,validateDemoReview,demoMotionPrompt} from '../shared/demo-creation.ts';
import {projectSchema} from '../shared/schema.ts';
import {newProject} from '../shared/project.ts';
const draft=()=>{const d=newDemoCreation();d.instructions='Tap create, then show the supplied result.';d.screens=[{assetId:'a',name:'Home',instructions:''},{assetId:'b',name:'Result',instructions:''}];d.actions=[{id:'tap',description:'Tap Create',gesture:'tap',at:.5,until:1,screen:0,next:1,target:[.5,.5],end:[.5,.5],transition:'fade',viewport:[0,1],transitionDuration:.25}];return d;};
test('demo drafts round trip without changing old projects; defaults expose both modes and strict review',()=>{
 const p=newProject();assert.equal(projectSchema.parse(p).demoCreation,undefined);p.demoCreation=draft();assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))).demoCreation,p.demoCreation);
 assert.equal(p.demoCreation.scene,'preserve');assert.equal(p.demoCreation.accuracy,'strict');assert.equal(p.demoCreation.useGpu,true);
 for(const scene of ['preserve','recreate'])for(const inputMode of ['screenshots','recording'])assert(demoCreationSchema.safeParse({...p.demoCreation,scene,inputMode}).success);
});
test('timeline rejects missing app states, overlap, duplicate actions, reversed time and transitions past the shot',()=>{
 const d=draft();validateDemoTimeline(d);
 for(const actions of [[{...d.actions[0],next:8}],[{...d.actions[0],at:2,until:1}],[{...d.actions[0],until:5}],[d.actions[0],d.actions[0]]])assert.throws(()=>validateDemoTimeline({...d,actions}));
 assert.throws(()=>validateDemoTimeline({...d,inputMode:'recording'}),/recording/);assert.throws(()=>demoCreationSchema.parse({...d,duration:31}));assert.throws(()=>demoCreationSchema.parse({...d,actions:[{...d.actions[0],target:[-1,0]}]}));
});
test('strict export requires observed contact, correct timing, matching target and a composited preview',()=>{
 const d=draft();assert.throws(()=>validateDemoReview(d),/preview/);d.previewId='preview';d.sceneApproved=true;
 assert.throws(()=>validateDemoReview(d),/contact/);
 d.reviews.tap={point:[.5,.5],end:[.5,.5],approved:true,startRecorded:false,endRecorded:false,startTime:1,endTime:1};assert.throws(()=>validateDemoReview(d),/contact/);
 d.reviews.tap.startRecorded=true;validateDemoReview(d);d.reviews.tap.point=[.8,.8];assert.throws(()=>validateDemoReview(d),/misses/);
 d.reviews.tap.point=[.5,.5];d.reviews.tap.startTime=2;assert.throws(()=>validateDemoReview(d),/time/);
 d.accuracy='approximate';validateDemoReview(d);d.sceneApproved=false;assert.throws(()=>validateDemoReview(d),/approve/);
});
test('screen/motion/calibration changes invalidate dependent outputs while reviews and navigation do not',()=>{
 const d=draft();Object.assign(d,{walkthroughId:'w',candidateId:'c',trackingJobId:'t',previewId:'p',sceneApproved:true});
 assert.equal(changeDemo(d,{step:4}).candidateId,'c');assert.equal(changeDemo(d,{instructions:'Another flow'}).candidateId,'');
 const settings=changeDemo(d,{videoModel:'different'});assert.equal(settings.walkthroughId,'w');assert.equal(settings.candidateId,'');assert.equal(settings.previewId,'');
 const tracking=changeDemo(d,{sourceCalibration:[]});assert.equal(tracking.candidateId,'c');assert.equal(tracking.trackingJobId,'');assert.equal(tracking.sceneApproved,false);
 assert.equal(changeDemo(d,{useGpu:false}).trackingJobId,'');
 assert(demoCreationSchema.safeParse({...d,sourceCalibration:[{time:0,corners:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],editRegion:[[.1,.1]]}]}).success,'Unfinished polygon drafts must survive autosave.');
});
test('motion prompt retains appearance constraint and explicit screen-coordinate timing, without claiming an enforced provider control',()=>{
 const text=demoMotionPrompt(draft());assert.match(text,/nail design/);assert.match(text,/0.5s–1s/);assert.match(text,/0.5,0.5/);assert.match(text,/screen will be replaced afterward/);
});
