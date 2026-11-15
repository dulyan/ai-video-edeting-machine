import {useEffect,useState} from 'react';
import {request} from './api.ts';
import {Button,Field} from './components.tsx';
import type {Workspace} from './workspace.tsx';
export default function ProviderKeys({w}:{w:Workspace}){
 const [saved,setSaved]=useState<Record<string,boolean>>({}),[keys,setKeys]=useState<Record<string,string>>({});
 useEffect(()=>{if(w.connected)void request('/provider-keys').then(setSaved).catch(()=>{});},[w.connected]);
 return <>{(['wanapi','replicate'] as const).map(provider=><section className="card settings-card" key={provider}><h3>{provider==='wanapi'?'Wan API':'Replicate'} API key</h3><p>{saved[provider]?'Key saved securely. Enter a new key only to replace it.':'Enter your key here. Do not send it in chat.'} Keys stay in encrypted backend storage across restarts and updates.</p><Field label={provider+' API key'}><input type="password" autoComplete="off" spellCheck={false} value={keys[provider]||''} onChange={e=>setKeys({...keys,[provider]:e.target.value})}/></Field><Button disabled={!w.connected||!!w.busy||!keys[provider]?.trim()} onClick={()=>void w.act('Saving provider key',async()=>{await request('/provider-keys',{method:'PUT',body:JSON.stringify({provider,key:keys[provider].trim()})});setKeys(k=>({...k,[provider]:''}));setSaved(s=>({...s,[provider]:true}));window.dispatchEvent(new Event('models-changed'));})}>Save key securely</Button>{saved[provider]&&<Button onClick={()=>void w.act('Removing provider key',async()=>{await request('/provider-keys',{method:'PUT',body:JSON.stringify({provider,key:''})});setSaved(s=>({...s,[provider]:false}));setKeys(k=>({...k,[provider]:''}));})}>Remove key</Button>}</section>)}</>;
}
