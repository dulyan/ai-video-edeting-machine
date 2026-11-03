import {useEffect,useState} from "react";
import type {Composition,Hook} from "../shared/types.ts";
import {request} from "./api.ts";

export default function EmojiHookPreview({text,composition,fontId,sections,textSettings}:{text:string;composition:Composition;fontId?:Hook["fontId"];sections?:Hook["sections"];textSettings?:Hook["textSettings"]}) {
  const key=JSON.stringify([text,composition.fontId,fontId,composition.fontSize,composition.position,composition.style,composition.aspectRatio,composition.textPosition,composition.textWidth,sections,textSettings]);
  const [image,setImage]=useState<{key:string;url?:string;error?:string}>({key:""});
  useEffect(()=>{
    const controller=new AbortController();let url:string|undefined;
    const timer=setTimeout(()=>{
      void request<Blob>("/hook-preview",{method:"POST",signal:controller.signal,body:JSON.stringify({text,composition,fontId,sections,textSettings})}).then(blob=>{
        if(controller.signal.aborted)return;
        url=URL.createObjectURL(blob);setImage({key,url});
      }).catch(error=>{if(!controller.signal.aborted)setImage({key,error:error.message});});
    },150);
    return ()=>{clearTimeout(timer);controller.abort();if(url)URL.revokeObjectURL(url);};
  },[key]);
  return image.key===key && image.url ? <img className="preview-emoji-overlay" src={image.url} alt={[text,...(sections||[]).map(s=>s.text)].filter(Boolean).join("\n")}/>
    : <span className="emoji-preview-status">{image.key===key && image.error ? `Hook preview: ${image.error}` : "Preparing hook preview…"}</span>;
}
