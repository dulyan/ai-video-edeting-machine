import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HookPreviewService} from '../server/hook-preview.ts';
import {newProject} from '../shared/project.ts';
import {renderHookPNG} from '../server/emoji-hook.ts';
const input=(text='Hello \u{1f602}')=>({hook:{id:'preview',text,createdAt:''},composition:newProject().composition,width:216,height:384});
test('simultaneous identical requests reuse the completed PNG without inflating cache accounting',async()=>{
 const service=new HookPreviewService();
 try{const results=await Promise.all(Array.from({length:6},()=>service.render(input())));assert(results.every(png=>png.equals(results[0])));assert.equal(service.stats().cacheEntries,1);assert.equal(service.stats().cacheBytes,results[0].length);}
 finally{service.close();}
});
test('isolated previews preserve exact output, serialize work, bound the queue and cancel queued requests',async()=>{
 const service=new HookPreviewService(),controller=new AbortController();
 try{
  const first=service.render(input()),cancel=service.render(input('Canceled'),controller.signal);const canceled=assert.rejects(cancel,{name:'AbortError'});controller.abort();await canceled;
  const queue=Array.from({length:8},(_,i)=>service.render(input('Queued '+i)));
  assert.equal(service.stats().active,1);assert.equal(service.stats().pending,8);
  await assert.rejects(service.render(input('Overflow')),/busy/);
  const png=await first;assert.deepEqual(png,await renderHookPNG(input().hook,input().composition,216,384));await Promise.all(queue);
  assert.deepEqual(await service.render(input()),png);assert.equal(service.stats().active,0);assert.equal(service.stats().pending,0);assert(service.stats().cacheBytes<=4*1024*1024);
 }finally{service.close();}
});
test('sustained previews recycle the native renderer and retain only a bounded cache',async()=>{
 const service=new HookPreviewService();
 try{
  const pids=new Set<number>();
  for(let i=0;i<45;i++){const png=await service.render(input('Stress '+i));assert(png.length>100);const stats=service.stats();if(stats.workerPid)pids.add(stats.workerPid);assert(stats.active<=1);assert(stats.cacheEntries<=12);assert(stats.cacheBytes<=4*1024*1024);}
  assert(pids.size>=2);
 }finally{service.close();}
 await assert.rejects(service.render(input()),/closed/);
});
