import {useEffect,useState} from 'react';
import {request} from './api.ts';
import {TEXT_APPEARANCES,APPEARANCE_LABELS,HOOK_STYLES,currentHookStyle} from '../shared/hook-appearance.ts';
type FontStatus={legacyInstalled:boolean;installed:Record<string,boolean>};
let availability:Promise<FontStatus>|undefined;
const loadingFonts=new Map<string,Promise<void>>();
function useLocalFonts(){
 const [status,setStatus]=useState<FontStatus>({legacyInstalled:false,installed:{}});
 useEffect(()=>{let alive=true;const refresh=()=>{availability??=request<FontStatus>('/hook-fonts').catch(error=>{availability=undefined;throw error;});void availability.then(value=>{
  if(alive)setStatus(value);
  for(const font of HOOK_FONTS.filter(f=>f.local&&value.installed?.[f.id]))if(!loadingFonts.has(font.id)){
   loadingFonts.set(font.id,request<Blob>('/hook-fonts/'+font.id+'/file').then(b=>b.arrayBuffer()).then(async bytes=>{const face=new FontFace('AVEM '+font.family,bytes,{weight:String(font.weight)});document.fonts.add(await face.load());}).catch(()=>{loadingFonts.delete(font.id);}));
  }
 }).catch(()=>{});};refresh();window.addEventListener('avem-hook-fonts',refresh);return()=>{alive=false;window.removeEventListener('avem-hook-fonts',refresh);};},[]);
 return status;
}
function FontImport({id,name,url,onInstalled}:{id:HookFontId;name:string;url:string;onInstalled?:(id:HookFontId)=>void}){
 const status=useLocalFonts(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(status.installed?.[id])return <div className="hook-font-import"><p className="field-hint">{name} installed locally.</p>{id==='classic-iphone-helvetica'&&<Button onClick={()=>onInstalled?.(id)}>Use reference font for all hooks</Button>}</div>;
 return <div className="hook-font-import"><p className="field-hint">{name} requires a licensed font file with Cyrillic support. <a href={url} target="_blank" rel="noreferrer">Get the font from its foundry</a>.</p><label className="text-button">{busy?'Importing font...':'Import '+name}<input aria-label={'Import '+name} type="file" accept=".ttf,.otf" disabled={busy} onChange={async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');
  try{const form=new FormData();form.append('file',file);await request('/hook-fonts/'+id,{method:'POST',body:form});availability=undefined;window.dispatchEvent(new Event('avem-hook-fonts'));onInstalled?.(id);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }}/></label>{error&&<p role="alert">{error}</p>}</div>;
}
export function LegacyHookFontImport({onInstalled}:{onInstalled?:(id:HookFontId)=>void}){
 return <><p className="field-hint"><strong>Your iPhone reference: Helvetica Pro Roman, Regular (400).</strong> Import this font to use it in both previews and final renders. TikTok Sans and Proxima Nova have a different Cyrillic letter shape.</p><FontImport id="classic-iphone-helvetica" name="Helvetica Pro Roman" url="https://www.myfonts.com/collections/helvetica-font-linotype" onInstalled={onInstalled}/><details><summary>Import Proxima Nova alternative</summary><FontImport id="tiktok-classic-legacy" name="Proxima Nova Semibold" url="https://www.marksimonson.com/fonts/view/proxima-nova/" onInstalled={onInstalled}/></details></>;
}
import type {Composition,Hook,TextSectionSettings} from "../shared/types.ts";
import {type HookFontId,activeHookFontId,HOOK_FONTS,hookFontCSS} from "../shared/hook-fonts.ts";
import {sectionDefaults} from "../shared/hook-sections.ts";
import {Button,Field} from "./components.tsx";

export function HookFontSelect({label,value,onChange,inherit=false}:{label:string;value?:HookFontId;onChange:(id:HookFontId|undefined)=>void;inherit?:boolean}) {
 const status=useLocalFonts();
 return <select aria-label={label} value={inherit&&!value?"":activeHookFontId(value)} onChange={e=>onChange(e.target.value?e.target.value as HookFontId:undefined)}>
  {inherit&&<option value="">Use hook default</option>}
  {HOOK_FONTS.map(f=><option key={f.id} value={f.id} disabled={f.local&&!status.installed?.[f.id]}>{f.name}{f.local&&!status.installed?.[f.id]?" (import font first)":""}</option>)}
 </select>;
}

export default function HookTextEditor({hook,composition,index,disabled,onChange}:{hook:Hook;composition:Composition;index:number;disabled:boolean;onChange:(change:(current:Hook)=>Hook)=>void}) {
 const base=sectionDefaults(hook,composition);
 const sections=[{id:hook.id,text:hook.text,settings:hook.textSettings},...(hook.sections||[])];
 function setText(i:number,text:string){onChange(h=>i===0?{...h,text}:{...h,sections:h.sections?.map((s,j)=>j===i-1?{...s,text}:s)});}
 function settings(i:number,value:Partial<TextSectionSettings>|undefined){onChange(h=>{
  if(i===0)return {...h,textSettings:value?{...h.textSettings,...value}:undefined};
  return {...h,sections:h.sections?.map((s,j)=>j===i-1?{...s,settings:value?{...s.settings,...value}:undefined}:s)};
 });}
 return <div className="hook-text-controls">
  <HookFontSelect label={`Font for hook ${index+1}`} value={hook.fontId} inherit onChange={fontId=>onChange(h=>({...h,fontId}))}/>
  {sections.map((section,i)=>{
   const overrides=section.settings || {},current={...base,...Object.fromEntries(Object.entries(overrides).filter(([,v])=>v!==undefined))};
   const name=`Hook ${index+1} section ${i+1}`;
   return <div className="hook-text-section" key={section.id}>
    <div className="section-heading"><strong>Text section {i+1}</strong>{i>0&&<button type="button" className="text-button" aria-label={`Remove ${name}`} disabled={disabled} onClick={()=>onChange(h=>({...h,sections:h.sections?.filter(s=>s.id!==section.id)}))}>Remove section</button>}</div>
    <textarea aria-label={i===0?`Hook ${index+1}`:name} rows={Math.max(2,Math.ceil(section.text.length/70))} disabled={disabled} style={{...hookFontCSS(activeHookFontId(current.fontId),section.text),letterSpacing:"normal"}} value={section.text} onChange={e=>setText(i,e.target.value)}/>
    <details className="section-customization"><summary>Customize section {i+1}</summary>
      <p className="field-hint">Inherits hook settings. Sections stack automatically and always stay horizontally centered.</p>
      <Field label="Font"><HookFontSelect label={`${name} font`} value={overrides.fontId} inherit onChange={fontId=>settings(i,{fontId})}/></Field>
      <Field label="Style"><select aria-label={`${name} style`} value={overrides.style?currentHookStyle(overrides.style):""} onChange={e=>settings(i,{style:e.target.value?e.target.value as TextSectionSettings["style"]:undefined})}><option value="">Use hook default</option>{HOOK_STYLES.filter(s=>s!=="IMG").map(style=><option key={style} value={style}>{style}</option>)}</select></Field>
      <Field label="Text appearance"><select aria-label={name+' text appearance'} value={overrides.textAppearance||''} onChange={e=>settings(i,{textAppearance:(e.target.value||undefined) as TextSectionSettings['textAppearance']})}><option value="">Use hook default</option>{TEXT_APPEARANCES.map(a=><option key={a} value={a}>{APPEARANCE_LABELS[a]}</option>)}</select></Field>
      <Field label={`Text size - ${current.fontSize}px`}><input aria-label={`${name} size`} type="range" min={20} max={100} value={current.fontSize} onChange={e=>settings(i,{fontSize:Number(e.target.value)})}/></Field>
      <Field label={`Text width - ${current.widthPercent}%`} hint="Changes wrapping only; letter spacing stays unchanged."><input aria-label={`${name} width`} type="range" min={10} max={100} value={current.widthPercent} onChange={e=>settings(i,{widthPercent:Number(e.target.value)})}/></Field>
      <Field label={`Vertical adjustment - ${current.verticalOffset}%`} hint="0 keeps this section at its automatic stacked position."><input aria-label={`${name} vertical adjustment`} type="range" min={-100} max={100} value={current.verticalOffset} onChange={e=>settings(i,{verticalOffset:Number(e.target.value)})}/></Field>
      <Button type="button" onClick={()=>settings(i,undefined)}>Use hook defaults for section {i+1}</Button>
    </details>
   </div>;
  })}
  <Button type="button" disabled={disabled||(hook.sections?.length||0)>=20} onClick={()=>onChange(h=>({...h,sections:[...(h.sections||[]),{id:crypto.randomUUID(),text:""}]}))}>Add text section</Button>
 </div>;
}
