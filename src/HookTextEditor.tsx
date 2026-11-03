import type {Composition,Hook,TextSectionSettings} from "../shared/types.ts";
import {type HookFontId,activeHookFontId,HOOK_FONTS,hookFontCSS} from "../shared/hook-fonts.ts";
import {sectionDefaults} from "../shared/hook-sections.ts";
import {Button,Field} from "./components.tsx";

export function HookFontSelect({label,value,onChange,inherit=false}:{label:string;value?:HookFontId;onChange:(id:HookFontId|undefined)=>void;inherit?:boolean}) {
 return <select aria-label={label} value={inherit&&!value?"":activeHookFontId(value)} onChange={e=>onChange(e.target.value?e.target.value as HookFontId:undefined)}>
  {inherit&&<option value="">Use hook default</option>}
  {["Instagram","TikTok"].map(group=><optgroup key={group} label={group}>{HOOK_FONTS.filter(f=>f.group===group).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>)}
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
      <Field label="Style"><select aria-label={`${name} style`} value={overrides.style||""} onChange={e=>settings(i,{style:e.target.value?e.target.value as TextSectionSettings["style"]:undefined})}><option value="">Use hook default</option>{["Text","Snapchat","Instagram","Text Wall","Green screen"].map(style=><option key={style} value={style}>{style==="Instagram"?"Instagram white":style}</option>)}</select></Field>
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
