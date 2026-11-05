import {fork,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import type {Composition,Hook} from '../shared/types.ts';
type Input={hook:Hook;composition:Composition;width:number;height:number};
type Task={input:Input;key:string;signal?:AbortSignal;resolve:(png:Buffer)=>void;reject:(error:Error)=>void;abort:()=>void};
const aborted=()=>Object.assign(new Error('Preview canceled'),{name:'AbortError'});
/** One isolated CPU renderer; queue, cache, native memory and execution time are bounded. */
export class HookPreviewService {
 private child?:ChildProcess;private active?:Task;private pending:Task[]=[];private timer?:ReturnType<typeof setTimeout>;
 private cache=new Map<string,Buffer>();private cacheBytes=0;private rendered=0;private closed=false;
 private lastRSS=0;
 stats(){return {active:this.active?1:0,pending:this.pending.length,workerPid:this.child?.pid,workerRSS:this.lastRSS,cacheBytes:this.cacheBytes,cacheEntries:this.cache.size};}
 render(input:Input,signal?:AbortSignal):Promise<Buffer>{
  if(this.closed)return Promise.reject(new Error('Preview renderer is closed'));
  if(signal?.aborted)return Promise.reject(aborted());
  const key=createHash('sha256').update(JSON.stringify(input)).digest('hex'),cached=this.cache.get(key);
  if(cached)return Promise.resolve(cached);
  if(this.pending.length>=8)return Promise.reject(Object.assign(new Error('Preview renderer is busy. Pause editing briefly and try again.'),{statusCode:429}));
  return new Promise((resolve,reject)=>{
   const task:Task={input,key,signal,resolve,reject,abort:()=>{
    const index=this.pending.indexOf(task);if(index>=0){this.pending.splice(index,1);reject(aborted());signal?.removeEventListener('abort',task.abort);}
    // The active native call is bounded and isolated; suppress its result on cancellation.
   }};
   signal?.addEventListener('abort',task.abort,{once:true});this.pending.push(task);this.pump();
  });
 }
 private worker(){
  if(this.child)return this.child;
  const child=fork(fileURLToPath(new URL('./hook-preview-worker.ts',import.meta.url)),[],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced',execArgv:['--max-old-space-size=128','--import','tsx'],env:{...process.env,UV_THREADPOOL_SIZE:'2'}});
  this.child=child;this.rendered=0;
  child.on('message',(result:any)=>{
   if(this.child!==child||!this.active)return;
   this.lastRSS=result.rss||0;const task=this.active;
   if(result.error)this.finish(new Error(result.error));
   else {
    const png=Buffer.from(result.png);
    if(!task.signal?.aborted&&png.length<=4*1024*1024){
     while(this.cache.size>=12||this.cacheBytes+png.length>4*1024*1024){const first=this.cache.keys().next().value;if(!first)break;this.cacheBytes-=this.cache.get(first)!.length;this.cache.delete(first);}
     this.cache.set(task.key,png);this.cacheBytes+=png.length;
    }
    if(++this.rendered>=40||this.lastRSS>192*1024*1024)this.retire();
    this.finish(undefined,png);
   }
  });
  const failed=(error:Error)=>{if(this.child!==child)return;this.retire();this.finish(error);};
  child.on('error',failed);child.on('exit',()=>failed(new Error('Preview renderer stopped; try the preview again.')));
  return child;
 }
 private pump(){
  if(this.active||this.closed)return;
  const task=this.pending.shift();if(!task)return;
  if(task.signal?.aborted){task.signal.removeEventListener('abort',task.abort);task.reject(aborted());this.pump();return;}
  const cached=this.cache.get(task.key);
  if(cached){task.signal?.removeEventListener('abort',task.abort);task.resolve(cached);this.pump();return;}
  this.active=task;
  this.timer=setTimeout(()=>{this.retire();this.finish(new Error('Hook preview took too long. Shorten the text or try again.'));},5000);
  try{this.worker().send(task.input,error=>{if(error&&this.active===task){this.retire();this.finish(error);}});}catch(error){this.retire();this.finish(error as Error);}
 }
 private finish(error?:Error,png?:Buffer){
  clearTimeout(this.timer);const task=this.active;this.active=undefined;
  if(task){task.signal?.removeEventListener('abort',task.abort);if(task.signal?.aborted)task.reject(aborted());else if(error)task.reject(error);else task.resolve(png!);}
  this.pump();
 }
 private retire(){const child=this.child;this.child=undefined;child?.kill();}
 close(){this.closed=true;this.retire();clearTimeout(this.timer);if(this.active)this.finish(new Error('Preview renderer is closing'));for(const task of this.pending){task.signal?.removeEventListener('abort',task.abort);task.reject(new Error('Preview renderer is closing'));}this.pending=[];this.cache.clear();this.cacheBytes=0;}
}
