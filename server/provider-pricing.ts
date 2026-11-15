import type {Model} from '../shared/types.ts';
import type {GenerationEstimate} from '../shared/pricing.ts';
import {get} from './store.ts';
export function externalEstimate(model:Model,p:Record<string,any>,count:number):GenerationEstimate{
 let price:number|undefined;const notes=['Published-rate estimate, checked 2026-11-15. Check the linked provider rate table before spending; final measured usage determines charges.'],settings:Record<string,unknown>={};
 const source=model.apiProvider==='wanapi'?'https://wanapi.app/pricing':'https://replicate.com/bytedance/video-upscaler';
 const duration=(ref:unknown)=>typeof ref==='string'&&ref.startsWith('asset:')?get('assets',ref.slice(6))?.duration:undefined;
 if(model.apiProvider==='wanapi'){
  const id=model.nativeId!,pro=id.includes('pro'),prime=id.includes('prime'),res=p.resolution||'1080p',filter=p.nsfw_checker??!pro;
  const rates:Record<string,number>=pro?(prime?{'1080p':.182,'2k':.196,'4k':.217}:{'1080p':.126,'2k':.140,'4k':.161}):prime?(filter?{'480p':.0442,'720p':.091,'1080p':.182}:{'480p':.0476,'720p':.098,'1080p':.196}):(filter?{'480p':.0275,'720p':.055,'1080p':.110}:{'480p':.030,'720p':.060,'1080p':.120});
  const rate=rates[res],seconds=p.duration??5;Object.assign(settings,{resolution:res,duration:seconds,nsfw_checker:filter});notes.push(`USD ${rate} per billable second. Audio does not change this rate.`);
  if(seconds>0&&!(p.reference_videos?.length))price=rate*seconds;
  else notes.push(`Total unavailable: automatic output or reference-video duration is unknown. Up to USD ${(rate*30).toFixed(4)} may be reserved for 30 billable seconds. Reference video plus output must fit 30 seconds.`);
 }else{
  const res=p.target_resolution||'4k',fps=p.target_fps??60,seconds=duration(p.video),tier=p.processing_type||'standard';Object.assign(settings,{target_resolution:res,target_fps:fps,processing_type:tier});
  const rates:Record<string,number[]>={'720p':[.003443,.006887],'1080p':[.006887,.013773],'2k':[.013773,.027548],'4k':[.027548,.055097]},rate=rates[res]?.[fps>30?1:0];
  if(rate!==undefined){notes.push(`USD ${rate} per second of output video.`);if(seconds&&tier==='standard')price=rate*seconds;else notes.push('Total unavailable: choose a library video with known duration. External URL duration is not assumed.');}else notes.push('No verified rate for this resolution; check the provider before generating.');
 }
 return {modelId:model.id,currency:'USD',count,estimated:true,perGeneration:price,total:price===undefined?undefined:Number((price*count).toFixed(8)),notes,settings,checkedAt:'2026-11-15T00:00:00Z',source};
}
