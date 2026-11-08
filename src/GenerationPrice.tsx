import {useEffect,useState} from 'react';
import type {GenerationEstimate} from '../shared/pricing.ts';
import {request} from './api.ts';
const dollars=(n:number)=>n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:6});
export default function GenerationPrice({modelId,inputs,mode,count=1,duration,aspectRatio,connected}:{modelId?:string;inputs:Record<string,unknown>;mode:'image'|'video'|'vidgen';count?:number;duration?:number;aspectRatio?:string;connected:boolean}){
 const key=JSON.stringify({modelId,inputs,mode,count,duration,aspectRatio}),[state,setState]=useState<{key:string;data?:GenerationEstimate;error?:string}>({key:''});
 useEffect(()=>{
  if(!modelId||!connected||!count)return;
  const controller=new AbortController(),timer=setTimeout(()=>{
   void request<GenerationEstimate>('/pricing/estimate',{method:'POST',signal:controller.signal,body:key}).then(data=>{if(!controller.signal.aborted)setState({key,data});}).catch(e=>{if(!controller.signal.aborted)setState({key,error:e.message});});
  },600);
  return()=>{clearTimeout(timer);controller.abort();};
 },[key,connected]);
 if(!modelId||!connected||!count)return null;
 const current=state.key===key?state:undefined,data=current?.data;
 return <div className="generation-price" aria-live="polite"><strong>Estimated media cost</strong>
  {data?<><p>{data.total===undefined?'Total unavailable':`${dollars(data.total)} for ${data.count} generation${data.count===1?'':'s'}`}{data.perGeneration!==undefined&&data.count>1?` (${dollars(data.perGeneration)} each)`:''}</p>
   <p className="field-hint">{Object.entries(data.settings).map(([k,v])=>`${k}: ${v}`).join(' · ')}</p>
   {data.notes.map((note,i)=><p key={i} className="field-hint">{note}</p>)}<a href={data.source} target="_blank" rel="noreferrer" className="text-button">Siray rate table</a></>
   :<p className="field-hint">{current?.error?`Price unavailable: ${current.error}. Check Siray's rate table before generating.`:'Checking selected settings with Siray…'}</p>}
 </div>;
}
