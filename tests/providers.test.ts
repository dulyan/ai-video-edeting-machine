import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {vidGenPayload} from '../shared/vidgen.ts';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'providers-'));
const {providerModels,mediaProvider,validateExternal,externalCatalog}=await import('../server/providers.ts');
const {setSecret,put,addJob,get}=await import('../server/store.ts');
const {externalEstimate}=await import('../server/provider-pricing.ts');
test('four Wan variants expose all fifteen fields, native constraints and reference exclusions',()=>{
 const models=providerModels.filter(m=>m.apiProvider==='wanapi');assert.equal(models.length,4);for(const m of models){assert.equal(Object.keys(m.schema!.properties!).length,15);assert(vidGenPayload(m,{duration:-1,prompt:'A scene'}));assert.throws(()=>vidGenPayload(m,{duration:1}));assert.throws(()=>validateExternal(m,{first_frame:'https://example.com/a.jpg',reference_images:['https://example.com/b.jpg']}));assert.throws(()=>validateExternal(m,{first_frame:'asset:private'}));assert.throws(()=>validateExternal(m,{prompt:''}));}
});
test('provider estimates include filter tier, unknown reference/auto duration and upscaler fps bands',()=>{
 const wan=providerModels[0];assert.equal(externalEstimate(wan,{duration:5,resolution:'720p'},1).total,.275);assert.equal(externalEstimate(wan,{duration:5,resolution:'720p',nsfw_checker:false},1).total,.3);assert.equal(externalEstimate(wan,{duration:-1},1).total,undefined);assert.equal(externalEstimate(wan,{duration:5,reference_videos:['https://example.com/v.mp4']},1).total,undefined);
 put('assets',{id:'v',name:'v',key:'v.mp4',projectId:'p',kind:'demo',mime:'video/mp4',size:1,duration:5,createdAt:''});const up=providerModels.find(m=>m.apiProvider==='replicate')!;assert.equal(externalEstimate(up,{video:'asset:v',target_resolution:'4k',target_fps:30},1).total,.13774);assert.equal(externalEstimate(up,{video:'asset:v',target_resolution:'4k',target_fps:60},1).total,.275485);assert.equal(externalEstimate(up,{video:'https://example.com/v.mp4'},1).total,undefined);
});
test('native provider submission/polling route separately, preserve signed outputs and never resubmit saved IDs',async()=>{
 setSecret('wanapi','fixture-wan');setSecret('replicate','fixture-replicate');const actual=globalThis.fetch;let posts=0;
 globalThis.fetch=async(url,options)=>{const u=String(url),post=options?.method==='POST';if(post)posts++;if(u.includes('wanapi')){assert.equal((options?.headers as any).Authorization,'Bearer fixture-wan');if(post){assert.equal(JSON.parse(String(options?.body)).model,undefined);return Response.json({task_info:{id:'task_saved'}});}return Response.json({task_info:{status:'completed'},videos:['https://example.com/v.mp4?token=signed']});}assert(u.startsWith('https://api.replicate.com/'));return Response.json(post?{id:'prediction_saved'}:{status:'succeeded',output:'https://example.com/u.mp4'});};
 try{for(const model of [providerModels[0],providerModels.find(m=>m.apiProvider==='replicate')!]){const job=addJob('p','video','Fixture',{model:model.id,modelDefinition:model});const submitted=await mediaProvider(job,{model:model.id,prompt:'Scene'});const n=posts;const result=await mediaProvider({...job,taskId:submitted.task_id});assert.equal(posts,n);assert.equal(result.outputs.length,1);assert(result.outputs[0].startsWith('https://'));}}
 finally{globalThis.fetch=actual;}
});
test('Replicate catalog discovers historical versions with dereferenced settings without a generation call',async()=>{
 const actual=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.notEqual(options?.method,'POST');return Response.json({next:null,results:[{id:'abc',openapi_schema:{components:{schemas:{Input:{required:['video'],properties:{video:{type:'string'},processing_type:{$ref:'#/components/schemas/Tier'}}},Tier:{type:'string',enum:['standard','pro']}}}}}]});};try{const m=(await externalCatalog()).find(m=>m.nativeId==='abc')!;assert.deepEqual(m.schema?.properties?.processing_type.enum,['standard']);}finally{globalThis.fetch=actual;}
});
