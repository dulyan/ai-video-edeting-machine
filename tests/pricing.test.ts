import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PricingService} from '../server/pricing.ts';
import {pricingParameters} from '../shared/pricing.ts';
function fixture({token=false,formula=true,fail=false,countDimension=false}={}){
 const requests:{url:string;body:any}[]=[];
 const transport=(async(url:any,options:any={})=>{
  const body=options.body?JSON.parse(options.body):undefined;requests.push({url:String(url),body});
  if(fail)return new Response('unavailable',{status:503});
  let data:any;
  if(String(url).includes('by-name'))data={model_id:'model-fixture'};
  else if(!body)data={dimensions:[{key:'duration'},{key:'size'},{key:'quality'},...(countDimension?[{key:'n'}]:[])],pricing_description:formula?'Billing formula: billable duration = input video duration (up to 5 seconds) + output video duration.':'',...(token?{token_pricing_rules:[{}]}:{})};
  else{assert.equal(typeof body.request_params,'string');const params=JSON.parse(body.request_params);data={price:String((token?(params.quality==='high'?.047:.012):.4)*(countDimension?(params.n||1):1)),estimated:token};}
  return Response.json({code:200,data});
 }) as typeof fetch;
 return {service:new PricingService(transport),requests};
}
test('5s 720p ref2v with a 5.69s reference reconciles to the $0.80 bill, while image-only stays $0.40',async()=>{
 const {service,requests}=fixture(),payload={duration:5,size:'720p',prompt:'PRIVATE PROMPT',videos:['asset:clip'],images:['PRIVATE IMAGE']};
 const quote=await service.estimate('alibaba/wan-3.0-ref2v',payload,1,()=>5.686667);
 assert.equal(quote.total,.8);assert(quote.notes.some(n=>n.includes('10s billed')));
 const without=await service.estimate('alibaba/wan-3.0-ref2v',{...payload,videos:[]},4,()=>5.686667);assert.equal(without.perGeneration,.4);assert.equal(without.total,1.6);
 assert.equal(requests.length,3,'Metadata and dimension-matched quote are reused');
 assert(!JSON.stringify(requests).includes('PRIVATE'));assert(!JSON.stringify(requests).includes('asset:'));
});
test('token-priced image estimates reflect quality, native size, batch/output count, and warn they are not actual charges',async()=>{
 const {service}=fixture({token:true,formula:false});
 const high=await service.estimate('image',{size:'1440x2560',quality:'high',n:1},4,()=>undefined);
 assert.equal(high.perGeneration,.047);assert.equal(high.total,.188);assert(high.estimated);assert(high.notes.some(n=>n.includes('actual charges may vary')));
 const medium=await service.estimate('image',{size:'1440x2560',quality:'medium',n:2},1,()=>undefined);assert.equal(medium.total,.024);
});
test('unknown/multiple reference durations and unsupported billing rules never present an output-only quote as the total',async()=>{
 const {service}=fixture();
 for(const videos of [['https://example.com/clip.mp4'],['asset:a','asset:b']]){const q=await service.estimate('video',{duration:5,size:'720p',videos},1,()=>undefined);assert.equal(q.total,undefined);assert(q.notes.some(n=>n.includes('cannot be reliably estimated')));}
 const other=fixture({formula:false});assert.equal((await other.service.estimate('other',{duration:5,videos:['asset:a']},1,()=>3)).total,undefined);
});
test('pricing transport fails explicitly and sensitive-looking dimensions never leave the app',async()=>{
 const {service}=fixture({fail:true});await assert.rejects(service.estimate('video',{},1,()=>undefined),/unavailable/);
 const input={prompt:'private',images:'private',api_key:'secret',videos:'private',duration:5,size:'720p',audio_enable:false};
 assert.deepEqual(pricingParameters(input,Object.keys(input).map(key=>({key}))),{duration:5,size:'720p',audio_enable:false});
});
test('a provider quote already containing the output count is not multiplied twice',async()=>{
 const {service}=fixture({countDimension:true});const q=await service.estimate('image',{duration:5,size:'720p',n:3},2,()=>undefined);assert.equal(q.perGeneration,1.2);assert.equal(q.total,2.4);
});
