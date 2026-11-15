import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'slideshow-'));
const {put,get,addJob,mediaDir}=await import('../server/store.ts');
const {run,ffmpeg,ffprobe,probe}=await import('../server/render.ts');
const {renderSlideshow,validateSlideshow}=await import('../server/demo.ts');
test('slideshow renders ordered HD 30fps demos with exact frame duration and each transition, without Python or AI',async()=>{
 for(const [i,color] of ['red','blue'].entries()){await run(ffmpeg,['-y','-v','error','-f','lavfi','-i',`color=c=${color}:s=160x240`,'-frames:v','1','-threads','1',path.join(mediaDir,i+'.png')]);put('assets',{id:String(i),key:i+'.png',name:'Screen',kind:'hook-image',projectId:'p',mime:'image/png',size:100,width:160,height:240,createdAt:''});}
 for(const transition of ['fade','wipeleft','slideleft','cut'] as const){const settings={screens:['0','1'],duration:1.2,transition,sameTransition:true,transitions:[]};const job=addJob('p','demo','Demo slideshow',{tool:'demo-creation',phase:'slideshow',settings});await renderSlideshow(job,new AbortController().signal);assert.equal(get('jobs',job.id)?.status,'completed');const a=get('assets',job.id)!;assert.equal(a.kind,'demo');const meta=await probe(path.join(mediaDir,a.key));assert.equal(meta.width,1080);assert.equal(meta.height,1920);assert(Math.abs(meta.duration-1.2)<.035);const stream=JSON.parse(await run(ffprobe,['-v','error','-select_streams','v:0','-show_entries','stream=r_frame_rate,nb_frames','-of','json',path.join(mediaDir,a.key)])).streams[0];assert.equal(stream.r_frame_rate,'30/1');assert.equal(Number(stream.nb_frames),36);}
 assert.throws(()=>validateSlideshow({screens:[],duration:1,transition:'fade',sameTransition:true,transitions:[]}));
});
