export interface GenerationEstimate {
 modelId:string; currency:'USD'; perGeneration?:number; total?:number; count:number;
 estimated:boolean; notes:string[]; settings:Record<string,unknown>; checkedAt:string; source:string;
}
/** Only public pricing dimensions go to the quote API, never prompts or media. */
export function pricingParameters(payload:Record<string,unknown>,dimensions:{key:string}[]) {
 const params:Record<string,unknown>={};
 for(const {key} of dimensions) {
  if(/prompt|image|video|audio|url|token|secret|key/i.test(key)&&!/_enable$/.test(key))continue;
  const value=payload[key];if(['string','number','boolean'].includes(typeof value))params[key]=value;
 }
 return params;
}
export function referenceBillingSeconds(payload:Record<string,unknown>,durationOf:(reference:string)=>number|undefined) {
 const videos=payload.videos;
 if(!Array.isArray(videos)||!videos.length)return {seconds:0,unknown:false};
 // Provider wording does not specify how multiple clips aggregate. Do not guess.
 if(videos.length!==1||typeof videos[0]!=='string')return {seconds:0,unknown:true};
 const duration=durationOf(videos[0]);
 return typeof duration==='number'&&Number.isFinite(duration)&&duration>=0 ? {seconds:Math.min(5,duration),unknown:false} : {seconds:0,unknown:true};
}
