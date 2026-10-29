import {test} from "node:test";
import assert from "node:assert/strict";
import {runUploadBatch,uploadProblem,MAX_UPLOAD_BYTES,type UploadProgress} from "../shared/uploads.ts";
test("120 mixed files upload sequentially, retain successes, skip corrupt files and yield to the UI",async()=>{
 const files=Array.from({length:120},(_,index)=>({name:`track-${index}.${["mp3","wav","m4a"][index%3]}`,size:1000}));
 let active=0,maxActive=0,yields=0,progress:UploadProgress|undefined;const saved:number[]=[];
 const result=await runUploadBatch(files,"music",async file=>{active++;maxActive=Math.max(active,maxActive);await Promise.resolve();active--;const index=Number(file.name.match(/\d+/)![0]);if(index===30||index===90)throw new Error("Corrupt audio");return index;},{signal:new AbortController().signal,onProgress:p=>{progress=p;},onSaved:index=>saved.push(index),yieldBetween:async()=>{yields++;}});
 assert.equal(maxActive,1);assert.equal(result.length,118);assert.deepEqual(result,saved);assert.equal(progress!.completed,120);assert.equal(progress!.failed,2);assert.equal(progress!.active,false);assert.equal(yields,120);
});
test("cancellation stops the active batch and preserves earlier files",async()=>{
 const controller=new AbortController();let calls=0,progress:UploadProgress|undefined;
 const result=await runUploadBatch(Array.from({length:10},(_,i)=>({name:i+".mp3",size:10})),"music",async()=>{calls++;if(calls===3){controller.abort();throw new Error("aborted");}return calls;},{signal:controller.signal,onProgress:p=>{progress=p;},yieldBetween:async()=>{}});
 assert.deepEqual(result,[1,2]);assert.equal(calls,3);assert.equal(progress!.stopped,true);assert.equal(progress!.failed,0);assert.equal(progress!.active,false);
});
test("connection/storage failures stop the batch instead of retrying every remaining file",async()=>{
 let calls=0;const result=await runUploadBatch([{name:"a.wav",size:10},{name:"b.m4a",size:10}],"music",async()=>{calls++;throw Object.assign(new Error("Disk full"),{status:507});},{signal:new AbortController().signal,onProgress:()=>{},yieldBetween:async()=>{}});assert.equal(calls,1);assert.deepEqual(result,[]);
 assert(uploadProblem({name:"large.wav",size:MAX_UPLOAD_BYTES+1},"music"));assert(uploadProblem({name:"image.png",size:10},"music"));assert.equal(uploadProblem({name:"track.M4A",size:10},"music"),undefined);
});
