import type {GenerationEstimate} from '../shared/pricing.ts';
import {pricingParameters,referenceBillingSeconds} from '../shared/pricing.ts';
type Table={dimensions:{key:string}[];pricing_description?:string;token_pricing_rules?:unknown[]};
const gateway='https://api-gateway.siray.ai/api/model-verse';
/** Bounded public-metadata cache; this client can never call a generation route. */
export class PricingService {
 private metadata=new Map<string,{expires:number;id:string;table:Table}>();
 private quotes=new Map<string,{expires:number;data:any}>();
 constructor(private transport:typeof fetch=fetch){}
 private async json(url:string,body?:unknown){
  const r=await this.transport(url,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Siray pricing unavailable');const result=await r.json() as any;
  if(result.code!==200||!result.data)throw new Error('Siray pricing unavailable');return result.data;
 }
 private async info(modelId:string){
  const cached=this.metadata.get(modelId);if(cached&&cached.expires>Date.now())return cached;
  const detail=await this.json(gateway+'/models/by-name?model_name='+encodeURIComponent(modelId));
  if(typeof detail.model_id!=='string'||!/^model-[\w-]+$/.test(detail.model_id))throw new Error('No detailed pricing for this model');
  const table=await this.json(gateway+'/pricing?model-id='+encodeURIComponent(detail.model_id));
  if(!Array.isArray(table.dimensions))throw new Error('No detailed pricing for this model');
  const value={id:detail.model_id,table,expires:Date.now()+300000};
  if(this.metadata.size>=32)this.metadata.delete(this.metadata.keys().next().value!);this.metadata.set(modelId,value);return value;
 }
 async estimate(modelId:string,payload:Record<string,unknown>,count:number,durationOf:(reference:string)=>number|undefined):Promise<GenerationEstimate>{
  const {id,table}=await this.info(modelId),params=pricingParameters(payload,table.dimensions),key=JSON.stringify([id,params]);
  let cached=this.quotes.get(key);
  if(!cached||cached.expires<Date.now()){
   const data=await this.json(gateway+'/pricing',{model_id:id,request_params:JSON.stringify(params)});
   cached={data,expires:Date.now()+300000};if(this.quotes.size>=100)this.quotes.delete(this.quotes.keys().next().value!);this.quotes.set(key,cached);
  }
  const quote=cached.data,notes:string[]=[],base=Number(quote.price);
  if(!['string','number'].includes(typeof quote.price)||quote.price===''||!Number.isFinite(base)||base<0)throw new Error('Siray did not return a usable price');
  let perGeneration:number|undefined=base;
  let estimated=!!quote.estimated||!!table.token_pricing_rules?.length;
  const description=String(table.pricing_description||'');
  const hasVideos=Array.isArray(payload.videos)&&payload.videos.length>0;
  const refRule=/input video duration.*up to 5 seconds.*\+\s*output video duration/is.test(description);
  if(hasVideos){
   if(refRule){
    const ref=referenceBillingSeconds(payload,durationOf),duration=Number(payload.duration);
    if(ref.unknown||!(duration>0)){perGeneration=undefined;notes.push('Reference-video billing applies. Reference duration is unknown or there are multiple clips; the total cannot be reliably estimated.');}
    else{perGeneration=base*(duration+ref.seconds)/duration;notes.push(`${duration}s output + ${ref.seconds}s billable reference video = ${duration+ref.seconds}s billed. Reference video is capped at 5s.`);}
   }else{perGeneration=undefined;notes.push('Reference videos may add charges; no verified reference-billing formula is available for this model.');}
  }
  const countField=['n','num_outputs','num_images'].find(k=>payload[k]!==undefined),n=Number(countField?payload[countField]:1);
  if(Number.isFinite(n)&&n>1){if(Number.isInteger(n)){if(!countField||params[countField]===undefined)perGeneration=perGeneration===undefined?undefined:perGeneration*n;}else perGeneration=undefined;notes.push(`${n} outputs requested per generation.`);}
  if(estimated)notes.push('Token-billed or estimated pricing: actual charges may vary with prompt and output tokens.');
  if(quote.pricing_description&&!(estimated&&/token/i.test(quote.pricing_description)))notes.push(String(quote.pricing_description));
  notes.push('Media-generation estimate only; text-model prompt generation is billed separately.');
  return {modelId,currency:'USD',perGeneration:perGeneration===undefined?undefined:Number(perGeneration.toFixed(8)),total:perGeneration===undefined?undefined:Number((perGeneration*count).toFixed(8)),count,estimated,notes,settings:params,checkedAt:new Date().toISOString(),source:'https://console.siray.ai/model-detail/'+modelId};
 }
}
