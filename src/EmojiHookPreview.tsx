import {useEffect,useState} from "react";
import type {Composition,Hook} from "../shared/types.ts";
import {request} from "./api.ts";

export default function EmojiHookPreview({text,composition,fontId,sections,textSettings}:{text:string;composition:Composition;fontId?:Hook["fontId"];sections?:Hook["sections"];textSettings?:Hook["textSettings"]}) {
  const key=JSON.stringify([text,composition.fontId,fontId,composition.fontSize,composition.position,composition.style,composition.aspectRatio,composition.textPosition,composition.textWidth,composition.textAppearance,composition.textLayoutVersion,sections,textSettings]);
  const [image,setImage]=useState<{key:string;url?:string;error?:string}>({key:""});
  useEffect(()=>{const url=image.url;return()=>{if(url)URL.revokeObjectURL(url);};},[image.url]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void request<Blob>("/hook-preview",{method:"POST",signal:controller.signal,body:JSON.stringify({text,composition,fontId,sections,textSettings})}).then(blob=>{
        if(controller.signal.aborted)return;
        const url=URL.createObjectURL(blob);setImage({key,url});
      }).catch(error=>{if(!controller.signal.aborted)setImage(previous=>({...previous,key,error:error.message}));});
    },300);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[key]);
  return <>{image.url&&<img className="preview-emoji-overlay" aria-busy={image.key!==key} decoding="async" src={image.url} alt={[text,...(sections||[]).map(s=>s.text)].filter(Boolean).join("\n")}/>}
    {(!image.url||image.error)&&<span className="emoji-preview-status">{image.key===key && image.error ? `Hook preview: ${image.error}` : "Preparing hook preview…"}</span>}</>;
}
