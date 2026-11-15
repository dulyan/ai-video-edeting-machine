import type {Job,Model} from '../shared/types.ts';
import snapshots from '../shared/provider-models.json';
import {getSecret} from './store.ts';
import {siray} from './siray.ts';
export const providerOf=(id:string)=>id.startsWith('wanapi/')?'wanapi':id.startsWith('replicate/')?'replicate':'siray';
export const providerModels=snapshots as unknown as Model[];
for(const m of providerModels.filter(m=>m.apiProvider==='replicate'))if(m.schema?.properties?.processing_type)m.schema.properties.processing_type.enum=['standard'];
export async function providerJSON(provider:'wanapi'|'replicate',endpoint:string,body?:unknown){
 const key=getSecret(provider);if(!key)throw new Error(`Add your ${provider==='wanapi'?'Wan API':'Replicate'} key in Settings.`);
 const base=provider==='wanapi'?'https://api.wanapi.app':'https://api.replicate.com';
 const r=await fetch(base+endpoint,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(120000)});
 if(!r.ok){await r.body?.cancel();throw new Error(`${provider} request failed (HTTP ${r.status}). Check Settings, balance and request settings.`);}return r.json();
}
function replicateSchema(v:any){const api=v.openapi_schema,schemas=api.components.schemas;function resolve(f:any,depth=0):any{if(depth>10)throw new Error('Invalid model schema');if(f?.$ref)return resolve(schemas[f.$ref.split('/').at(-1)],depth+1);if(Array.isArray(f))return f.map(x=>resolve(x,depth+1));if(f&&typeof f==='object')return Object.fromEntries(Object.entries(f).map(([k,x])=>[k,resolve(x,depth+1)]));return f;}const s=resolve(schemas.Input);if(s.properties.processing_type?.enum?.includes('standard'))s.properties.processing_type.enum=['standard'];return s;}
export async function externalCatalog():Promise<Model[]>{
 if(!getSecret('replicate'))return providerModels;
 try{const versions:any[]=[];let endpoint='/v1/models/bytedance/video-upscaler/versions';for(let page=0;endpoint&&page<20;page++){const d=await providerJSON('replicate',endpoint);versions.push(...d.results);if(d.next){const url=new URL(d.next,'https://api.replicate.com');if(url.origin!=='https://api.replicate.com')throw new Error('Invalid catalog URL');endpoint=url.pathname+url.search;}else endpoint='';}return [...providerModels.filter(m=>m.apiProvider!=='replicate'),...versions.filter(v=>v.openapi_schema?.components?.schemas?.Input).map(v=>({id:'replicate/bytedance/video-upscaler:'+v.id,name:'[Replicate] ByteDance Standard - '+v.id.slice(0,8),kind:'video' as const,tag:'upscale',apiProvider:'replicate' as const,nativeId:v.id,active:replicateSchema(v).properties?.processing_type?.enum?.includes('standard')===true,schema:replicateSchema(v)}))];}catch{return providerModels;}
}
export function validateExternal(model:Model,p:Record<string,any>){
 if(model.apiProvider==='replicate'&&!model.schema?.properties?.processing_type?.enum?.includes('standard'))throw new Error('This model version does not publish support for the Standard tier.');
 if(model.apiProvider==='replicate'&&p.processing_type&&p.processing_type!=='standard')throw new Error('This tool uses the requested ByteDance Standard tier.');
 if(model.apiProvider!=='wanapi')return;
 const media=['first_frame','last_frame','reference_images','reference_videos','reference_audios','file','link'];
 if(!String(p.prompt||'').trim()&&!media.some(k=>Array.isArray(p[k])?p[k].length:!!p[k]))throw new Error('Provide a prompt or media input.');
 if((p.first_frame||p.last_frame)&&['reference_images','reference_videos','reference_audios','file','link'].some(k=>Array.isArray(p[k])?p[k].length:!!p[k]))throw new Error('Frames cannot be combined with references, file or link.');
 if(p.file&&p.link)throw new Error('Choose file or link, not both.');
 if((p.nsfw_checker??!model.nativeId?.includes('pro'))&&(p.file||p.link))throw new Error('file/link require nsfw_checker=false.');
 for(const k of media)for(const value of Array.isArray(p[k])?p[k]:p[k]?[p[k]]:[]){let u:URL;try{u=new URL(value);}catch{throw new Error('Wan API needs public HTTP(S) URLs; local library media requires public hosting.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/^(localhost|127\.|10\.|192\.168\.|\[|0\.)/.test(u.hostname))throw new Error('Wan API requires public HTTP(S) media URLs.');}
}
export async function mediaProvider(job:Job,body?:Record<string,unknown>){
 const model=job.input.modelDefinition as Model,provider=providerOf(job.input.model||'');
 if(provider==='siray')return siray(body?job.kind==='image'?'/v1/images/generations/async':'/v1/video/generations':`${job.kind==='image'?'/v1/images/generations/async':'/v1/video/generations'}/${encodeURIComponent(job.taskId!)}`,body);
 if(!model?.nativeId)throw new Error('Provider model definition missing.');
 if(provider==='wanapi'){const endpoint='/wan/v1/'+encodeURIComponent(model.nativeId)+'/generation';if(body){const {model:_,...native}=body;validateExternal(model,native);const d=await providerJSON(provider,endpoint,native);return {task_id:d.task_info?.id};}const d=await providerJSON(provider,endpoint+'/'+encodeURIComponent(job.taskId!));return {status:d.task_info?.status,outputs:d.videos,fail_reason:'Wan API generation failed. Review your provider dashboard.'};}
 if(body){const {model:_,...input}=body;validateExternal(model,input);const d=await providerJSON(provider,'/v1/predictions',{version:model.nativeId,input});return {task_id:d.id};}
 const d=await providerJSON(provider,'/v1/predictions/'+encodeURIComponent(job.taskId!));return {status:d.status,outputs:d.output?(Array.isArray(d.output)?d.output:[d.output]):[],fail_reason:'Replicate prediction failed. Review your provider dashboard.'};
}
