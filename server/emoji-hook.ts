import {createCanvas,GlobalFonts,loadImage,type Image} from "@napi-rs/canvas";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {Composition,Hook} from "../shared/types.ts";
import {effectiveHookFont} from "../shared/hook-fonts.ts";
import {hookPositionFraction} from "../shared/hook-layout.ts";
import {hasHookEmoji} from "../shared/emoji.ts";

const require=createRequire(import.meta.url);
const root=path.dirname(require.resolve("emoji-datasource-apple/package.json"));
const data=JSON.parse(readFileSync(path.join(root,"emoji.json"),"utf8"));
const images=new Map<string,string>(),loaded=new Map<string,Promise<Image>>(),fonts=new Set<string>();
const normalize=(value:string)=>value.toUpperCase().split("-").filter(part=>part!=="FE0F").join("-");
for(const emoji of data)for(const item of [emoji,...Object.values(emoji.skin_variations || {})] as any[]) {
  if(!item.has_img_apple)continue;
  images.set(normalize(item.unified),item.image || item.unified.toLowerCase()+".png");
}
const segmenter=new Intl.Segmenter(undefined,{granularity:"grapheme"});
type Run={text:string;image?:string};
export function appleEmojiRuns(text:string):Run[] {
  const runs:Run[]=[];
  for(const {segment} of segmenter.segment(text)) {
    const key=Array.from(segment).map(c=>c.codePointAt(0)!.toString(16).toUpperCase().padStart(4,"0")).join("-");
    const image=images.get(normalize(key));
    if(image)runs.push({text:segment,image});
    else {
      if(hasHookEmoji(segment))throw new Error(`This emoji is not available in the installed Apple emoji set: ${segment}`);
      const last=runs.at(-1);
      if(last && !last.image)last.text+=segment;
      else runs.push({text:segment});
    }
  }
  return runs;
}
async function image(file:string) {
  let promise=loaded.get(file);
  if(!promise) {
    if(loaded.size>=128)loaded.delete(loaded.keys().next().value!);
    promise=loadImage(path.join(root,"img","apple","64",file));loaded.set(file,promise);
    promise.catch(()=>loaded.delete(file));
  }
  return promise;
}
/** One PNG path for both authenticated browser previews and FFmpeg output. */
export async function emojiHookPNG(text:string,c:Composition,w:number,h:number,fontId?:Hook["fontId"]) {
  const face=effectiveHookFont(fontId ?? c.fontId,text);
  if(!fonts.has(face.id)) {
    if(!GlobalFonts.registerFromPath(fileURLToPath(new URL(`../public/fonts/${face.file}`,import.meta.url)),`AVEM ${face.family}`))throw new Error("Could not load hook font");
    fonts.add(face.id);
  }
  const canvas=createCanvas(w,h),ctx=canvas.getContext("2d");
  const size=c.fontSize*w/1080,emojiSize=size*1.15,lineHeight=size*1.3;
  ctx.font=`${face.weight} ${size}px "AVEM ${face.family}"`;
  const source=appleEmojiRuns(text),sprites=new Map<string,Image>();
  for(const run of source)if(run.image&&!sprites.has(run.image))sprites.set(run.image,await image(run.image));
  const tokens=source.flatMap(run=>run.image?[run]:run.text.split(/(\n|[^\S\n]+)/).filter(Boolean).map(text=>({text} as Run)));
  const maxWidth=w*(c.style==="Text Wall"?.62:.9);
  const merge=(runs:Run[])=>runs.reduce<Run[]>((all,run)=>{const last=all.at(-1);if(last&&!last.image&&!run.image)last.text+=run.text;else all.push({...run});return all;},[]);
  const width=(runs:Run[])=>merge(runs).reduce((sum,run)=>sum+(run.image?emojiSize:ctx.measureText(run.text).width),0);
  const trim=(runs:Run[])=>{const copy=merge(runs);if(copy[0]&&!copy[0].image)copy[0].text=copy[0].text.trimStart();if(copy.at(-1)&&!copy.at(-1)!.image)copy.at(-1)!.text=copy.at(-1)!.text.trimEnd();return copy.filter(run=>run.text);};
  const lines:Run[][]=[];let line:Run[]=[];
  for(const token of tokens) {
    if(token.text==="\n"){lines.push(trim(line));line=[];continue;}
    if(width([...line,token])>maxWidth && trim(line).length){lines.push(trim(line));line=[];}
    if(!token.image && width([token])>maxWidth) {
      for(const {segment} of segmenter.segment(token.text)) {
        if(width([...line,{text:segment}])>maxWidth && line.length){lines.push(trim(line));line=[];}
        line.push({text:segment});
      }
    } else if(line.length || token.image || token.text.trim())line.push(token);
  }
  if(line.length || !lines.length)lines.push(trim(line));
  const top=h*hookPositionFraction(c.position)-lines.length*lineHeight/2;
  if(c.style==="Snapchat") {ctx.fillStyle="rgba(0,0,0,0.5)";ctx.fillRect(0,top-size*.25,w,lines.length*lineHeight+size*.5);}
  ctx.fillStyle="#fff";ctx.strokeStyle="#222";ctx.lineWidth=Math.max(.5,size*.09);ctx.lineJoin="round";ctx.textBaseline="alphabetic";
  const metrics=ctx.measureText("Hg"),ascent=metrics.actualBoundingBoxAscent,descent=metrics.actualBoundingBoxDescent;
  lines.forEach((runs,i)=>{
    let x=(w-width(runs))/2;const y=top+i*lineHeight;
    for(const run of runs) {
      if(run.image){ctx.drawImage(sprites.get(run.image)!,x,y+(lineHeight-emojiSize)/2,emojiSize,emojiSize);x+=emojiSize;}
      else {const baseline=y+(lineHeight-ascent-descent)/2+ascent;if(c.style!=="Snapchat")ctx.strokeText(run.text,x,baseline);ctx.fillText(run.text,x,baseline);x+=ctx.measureText(run.text).width;}
    }
  });
  return canvas.toBuffer("image/png");
}
