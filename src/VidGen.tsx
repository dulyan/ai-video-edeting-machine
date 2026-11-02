import {useEffect, useRef, useState} from "react";
import {Download, RefreshCw, Sparkles} from "lucide-react";
import type {Asset, ModelField, Project} from "../shared/types.ts";
import {vidGenDefault, vidGenInitialInputs, vidGenPayload, vidGenMediaType} from "../shared/vidgen.ts";
import {ModelPicker, useModels} from "./ModelPicker.tsx";
import {AssetCard, Button, Field} from "./components.tsx";
import {request} from "./api.ts";
import type {Workspace} from "./workspace.tsx";
import type {ProjectUpdate} from "./workspace-sync.ts";

function Parameter({name,field,value,required,onChange,w,projectId}: {
  name:string;field:ModelField;value:unknown;required:boolean;onChange:(value:unknown)=>void;w:Workspace;projectId:string;
}) {
  const properties=(field.properties || {}) as Record<string,ModelField>;
  const requiredKeys=(field.required || []) as string[];
  const type=field.type;
  const mediaType=vidGenMediaType(name,field);
  const media=type === "string" && !field.enum && !!mediaType;
  const hint=[field.description,field.default !== undefined ? `Provider default: ${JSON.stringify(field.default)}` : "",field.minimum !== undefined ? `Minimum: ${field.minimum}` : "",field.maximum !== undefined ? `Maximum: ${field.maximum}` : ""].filter(Boolean).join(" · ");
  if(type === "object" || type === "array") {
    const values=Array.isArray(value)?value:[];
    return <fieldset className="vidgen-complex"><legend>{name}{required?" *":""}</legend>
      {hint && <p className="field-hint">{hint}</p>}
      {type === "object" ? Object.entries(properties).map(([key,child])=><Parameter key={key} name={`${name}.${key}`} field={child} required={requiredKeys.includes(key)} value={(value as any)?.[key]} onChange={next=>onChange({...((value || {}) as object),[key]:next})} w={w} projectId={projectId}/>) : <>
        <p className="field-hint">{field.minItems !== undefined?`Minimum ${field.minItems}. `:""}{field.maxItems !== undefined?`Maximum ${field.maxItems}.`:""}</p>
        {values.map((item,i)=><div className="vidgen-array-item" key={i}>
          <Parameter name={`${name}[${i}]`} field={field.items || {type:"string"}} value={item} required onChange={next=>onChange(values.map((v,index)=>index===i?next:v))} w={w} projectId={projectId}/>
          <div className="vidgen-item-actions">
            <Button type="button" aria-label={`Move ${name}[${i}] up`} disabled={!i} onClick={()=>{const next=[...values];[next[i-1],next[i]]=[next[i],next[i-1]];onChange(next);}}>Move up</Button>
            <Button type="button" aria-label={`Remove ${name}[${i}]`} onClick={()=>onChange(values.filter((_,index)=>index!==i))}>Remove</Button>
          </div>
        </div>)}
        <Button type="button" disabled={field.maxItems !== undefined && values.length >= field.maxItems} onClick={()=>onChange([...values,vidGenDefault(field.items || {type:"string"})])}>Add {name} item</Button>
        {field.items?.["x-format"] && <input type="file" aria-label={`Upload ${name}`} accept={`${field.items["x-format"]}/*`} multiple disabled={!!w.busy} onChange={e=>{
          const files=e.target.files;if(!files?.length)return;
          void w.act(`Uploading ${name}`,async()=>{const assets=await w.upload(files,field.items!["x-format"] === "video"?"reaction":field.items!["x-format"] === "audio"?"music":"image",projectId);onChange([...values,...assets.map(a=>`asset:${a.id}`)]);});e.target.value="";
        }}/>}
      </>}
      {value !== undefined && !required && <Button type="button" onClick={()=>onChange(undefined)}>Use provider default for {name}</Button>}
    </fieldset>;
  }
  return <div className="vidgen-parameter"><Field label={`${name}${required?" *":""}`} hint={hint}>
    {field.enum ? <select aria-label={name} value={value===undefined?"":String(value)} onChange={e=>onChange(field.enum!.find(v=>String(v)===e.target.value))}>
      <option value="">{required?"Choose a value":"Provider default"}</option>{field.enum.map(v=><option key={String(v)} value={String(v)}>{String(v)}</option>)}
    </select> : type === "boolean" ? <select aria-label={name} value={value===undefined?"":String(value)} onChange={e=>onChange(e.target.value===""?undefined:e.target.value==="true")}><option value="">Provider default</option><option value="true">true</option><option value="false">false</option></select>
    : type === "integer" || type === "number" ? <input aria-label={name} type="number" min={field.minimum} max={field.maximum} step={type==="integer"?1:"any"} value={value===undefined?"":String(value)} onChange={e=>onChange(e.target.value===""?undefined:Number(e.target.value))}/>
    : <textarea aria-label={name} rows={name==="prompt"?6:2} value={String(value??"")} placeholder={media?"Public URL or library reference":""} onChange={e=>onChange(e.target.value)}/>}
    </Field>
    {media && <div className="model-reference">
      <select aria-label={`Choose ${name} from library`} value="" onChange={e=>{if(e.target.value)onChange(e.target.value);}}><option value="">Choose from library</option>{w.data.assets.filter(a=>a.mime.startsWith(mediaType+"/")).map(a=><option key={a.id} value={`asset:${a.id}`}>{a.name}</option>)}</select>
      <input type="file" aria-label={`Upload ${name}`} accept={`${mediaType}/*`} disabled={!!w.busy} onChange={e=>{const files=e.target.files;if(!files?.length)return;void w.act(`Uploading ${name}`,async()=>{const assets=await w.upload(files,mediaType==="video"?"reaction":mediaType==="audio"?"music":"image",projectId);if(assets[0])onChange(`asset:${assets[0].id}`);});e.target.value="";}}/>
      {typeof value === "string" && value.startsWith("asset:") && <small>{w.data.assets.find(a=>a.id===value.slice(6))?.name || "Library reference"}</small>}
    </div>}
    {!required && value !== undefined && <button type="button" className="text-button" onClick={()=>onChange(undefined)}>Use provider default</button>}
  </div>;
}

function RawSettings({inputs,onChange,onError}: {inputs:Record<string,unknown>;onChange:(value:Record<string,unknown>)=>void;onError:(error:string)=>void}) {
  const [text,setText]=useState(JSON.stringify(inputs,null,2));
  return <Field label="Model settings (JSON)" hint="Siray has not published a parameter schema for this model. Enter its documented settings here."><textarea rows={12} value={text} onChange={e=>{setText(e.target.value);try{const next=JSON.parse(e.target.value);if(!next || typeof next!=="object" || Array.isArray(next))throw new Error();onChange(next);onError("");}catch{onError("Enter a valid JSON settings object.");}}}/></Field>;
}

export default function VidGen({p,w,update,inspect}: {p:Project;w:Workspace;update:(patch:ProjectUpdate)=>void;inspect:(asset:Asset)=>void}) {
  const {models,setModels}=useModels(w.connected);
  const videoModels=models.filter(m=>m.kind==="video");
  const selectedId=p.vidGen?.modelId || videoModels.find(m=>m.active!==false)?.id || "";
  const model=videoModels.find(m=>m.id===selectedId);
  const inputs=p.vidGen?.inputsByModel?.[selectedId] || (model?vidGenInitialInputs(model):{});
  const [error,setError]=useState("");
  const [page,setPage]=useState(0);
  const requestToken=useRef<{signature:string;id:string}|undefined>(undefined);
  useEffect(()=>{setError("");setPage(0);},[p.id,selectedId]);
  function patchInputs(next:Record<string,unknown>) {update(latest=>({vidGen:{modelId:selectedId,inputsByModel:{...latest.vidGen?.inputsByModel,[selectedId]:next}}}));requestToken.current=undefined;}
  function patch(name:string,value:unknown) {
    update(latest=>({vidGen:{modelId:selectedId,inputsByModel:{...latest.vidGen?.inputsByModel,[selectedId]:{...(latest.vidGen?.inputsByModel?.[selectedId] || (model?vidGenInitialInputs(model):{})),[name]:value}}}}));
    requestToken.current=undefined;
  }
  let validation="",payload:Record<string,unknown>|undefined;
  try {if(model)payload=vidGenPayload(model,inputs);}catch(e){validation=(e as Error).message;}
  const jobs=w.data.jobs.filter(j=>j.projectId===p.id && j.tool==="vidgen").sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const visible=jobs.slice(page*10,page*10+10);
  async function generate() {
    if(!model)return;
    const signature=JSON.stringify([p.id,model.id,inputs]);
    requestToken.current ??={signature,id:crypto.randomUUID()};
    if(requestToken.current.signature!==signature)requestToken.current={signature,id:crypto.randomUUID()};
    const result=await request("/vidgen",{method:"POST",body:JSON.stringify({projectId:p.id,modelId:model.id,inputs,requestId:requestToken.current.id})});
    requestToken.current=undefined;setPage(0);w.notify(`Video generation queued: ${result.label}`);
  }
  return <div className="vidgen-layout">
    <section className="card vidgen-form">
      <div className="section-heading"><h2>Generate a video</h2><Button disabled={!w.connected || !!w.busy} onClick={()=>void w.act("Refreshing models",async()=>{const result=await request("/models?refresh=1");setModels(result.models);window.dispatchEvent(new Event("models-changed"));})}><RefreshCw size={15}/>Refresh models</Button></div>
      <p>Choose any Siray video model. All published settings are shown below; optional settings can stay on provider defaults.</p>
      <p className="muted-text">Saved to: <strong>{p.name || "Untitled project"}</strong>. Generation keeps the model's original duration, framing, and audio.</p>
      <ModelPicker label="model" models={videoModels} value={selectedId} onChange={modelId=>update(latest=>({vidGen:{modelId,inputsByModel:latest.vidGen?.inputsByModel || {}}}))}/>
      <small className="vidgen-model-id">{model?.id}</small>
      {model && <div className="vidgen-fields" key={`${p.id}:${selectedId}`}>{Object.keys(model.schema?.properties || {}).length ? Object.entries(model.schema!.properties!).filter(([name])=>name!=="model").map(([name,field])=><Parameter key={name} name={name} field={field} required={model.schema?.required?.includes(name) || false} value={inputs[name]} onChange={value=>patch(name,value)} w={w} projectId={p.id}/>) : <RawSettings inputs={inputs} onChange={patchInputs} onError={setError}/>}</div>}
      {(error || validation) && <p className="inline-error" role="status">{error || validation}</p>}
      <Button variant="primary" disabled={!w.connected || !!w.busy || !model || model.active===false || !!validation || !!error} onClick={()=>void w.act("Queueing VidGen",generate)}><Sparkles size={16}/>Generate video</Button>
      <details className="vidgen-request"><summary>Request settings</summary><p className="field-hint">Library references are replaced with their media data on the backend. Other values are sent as shown.</p><pre>{JSON.stringify(payload || {model:selectedId,...inputs},null,2)}</pre></details>
    </section>
    <section className="vidgen-results"><h2>Generations</h2>{!jobs.length && <p className="muted-text">Your video jobs and completed originals appear here and in the Video Library.</p>}
      {visible.map(job=><article className="card vidgen-job" key={job.id}>
        <strong>{job.label}</strong><p>{job.status}{job.status==="running"?` - ${Math.round(job.progress)}%`:""}</p>
        {job.error && <p className="inline-error">{job.error}</p>}
        {["queued","running"].includes(job.status) && <Button onClick={()=>void w.act("Canceling job",()=>request(`/jobs/${job.id}/cancel`,{method:"POST"}))}>Cancel</Button>}
        {["failed","canceled","uncertain"].includes(job.status) && <Button onClick={()=>void w.act("Retrying job",()=>request(`/jobs/${job.id}/retry`,{method:"POST"}))}>{job.status === "uncertain" ? "Retry after checking Siray" : "Retry saved request"}</Button>}
        {job.status==="uncertain" && <p>Check Siray for this request before retrying to avoid a duplicate charge.</p>}
        {w.data.assets.filter(a=>a.jobId===job.id).map(asset=><div key={asset.id}><AssetCard asset={asset} onInspect={inspect}/><Button onClick={()=>void w.act("Downloading video",async()=>{const r=await request(`/assets/${asset.id}/url`);const a=document.createElement("a");a.href=r.url;a.download=asset.name+".mp4";a.click();})}><Download size={14}/>Download original</Button></div>)}
        <details><summary>Saved request</summary><pre>{JSON.stringify(job.requestSettings || {},null,2)}</pre></details>
      </article>)}
      {jobs.length>10 && <div className="vidgen-item-actions"><Button disabled={!page} onClick={()=>setPage(page-1)}>Previous</Button><span>Page {page+1} of {Math.ceil(jobs.length/10)}</span><Button disabled={(page+1)*10>=jobs.length} onClick={()=>setPage(page+1)}>Next</Button></div>}
    </section>
  </div>;
}
