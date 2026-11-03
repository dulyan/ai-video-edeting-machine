import {hookSections,textPosition} from "../shared/hook-sections.ts";
import {createCanvas,GlobalFonts,loadImage,type Image,type SKRSContext2D} from "@napi-rs/canvas";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import type {Composition,Hook} from "../shared/types.ts";
import {effectiveHookFont} from "../shared/hook-fonts.ts";
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

function registerFont(fontId:Hook["fontId"],text:string) {
 const face=effectiveHookFont(fontId,text);
 if(!fonts.has(face.id)){
  if(!GlobalFonts.registerFromPath(fileURLToPath(new URL(`../public/fonts/${face.file}`,import.meta.url)),`AVEM ${face.family}`))throw new Error("Could not load hook font");
  fonts.add(face.id);
 }
 return face;
}
function wrappedLines(ctx:SKRSContext2D,text:string,maxWidth:number,emojiSize:number) {
 const source=appleEmojiRuns(text);
 const tokens=source.flatMap(run=>run.image?[run]:run.text.split(/(\n|[^\S\n]+)/).filter(Boolean).map(text=>({text} as Run)));
 const merge=(runs:Run[])=>runs.reduce<Run[]>((all,run)=>{const last=all.at(-1);if(last&&!last.image&&!run.image)last.text+=run.text;else all.push({...run});return all;},[]);
 const width=(runs:Run[])=>merge(runs).reduce((sum,run)=>sum+(run.image?emojiSize:ctx.measureText(run.text).width),0);
 const trim=(runs:Run[])=>{const copy=merge(runs);if(copy[0]&&!copy[0].image)copy[0].text=copy[0].text.trimStart();if(copy.at(-1)&&!copy.at(-1)!.image)copy.at(-1)!.text=copy.at(-1)!.text.trimEnd();return copy.filter(run=>run.text);};
 const lines:Run[][]=[];let line:Run[]=[];
 for(const token of tokens){
  if(token.text==="\n"){lines.push(trim(line));line=[];continue;}
  if(width([...line,token])>maxWidth&&trim(line).length){lines.push(trim(line));line=[];}
  if(!token.image&&width([token])>maxWidth){for(const {segment} of segmenter.segment(token.text)){if(width([...line,{text:segment}])>maxWidth&&line.length){lines.push(trim(line));line=[];}line.push({text:segment});}}
  else if(line.length||token.image||token.text.trim())line.push(token);
 }
 if(line.length||!lines.length)lines.push(trim(line));
 return lines.map(runs=>({runs,width:width(runs)}));
}
export function layoutHookSections(hook:Hook,c:Composition,w:number,h:number,ctx=createCanvas(1,1).getContext("2d")) {
 let nextTop:number|undefined;
 return hookSections(hook,c).map(section=>{
  const face=registerFont(section.settings.fontId,section.text),size=section.settings.fontSize*w/1080;
  const font=`${face.weight} ${size}px "AVEM ${face.family}"`;
  ctx.font=font;
  const emojiSize=size*1.15,lineHeight=size*1.3;
  const padding=section.settings.style==="Instagram"?size*.28:0;
  const maxWidth=Math.max(size,w*section.settings.widthPercent/100-padding*2);
  const lines=wrappedLines(ctx,section.text,maxWidth,emojiSize).map(line=>({...line,x:(w-line.width)/2}));
  const height=lines.length*lineHeight;
  const nominalTop=nextTop ?? h*textPosition(c)/100-height/2;
  nextTop=nominalTop+height+size*.35;
  return {...section,font,size,emojiSize,lineHeight,lines,top:nominalTop+h*section.settings.verticalOffset/100,height};
 });
}
/** Both preview and export use this layout; width wraps lines without scaling glyphs. */
export async function renderHookPNG(hook:Hook,c:Composition,w:number,h:number) {
 const canvas=createCanvas(w,h),ctx=canvas.getContext("2d"),layout=layoutHookSections(hook,c,w,h,ctx);
 const sprites=new Map<string,Image>();
 for(const section of layout)for(const line of section.lines)for(const run of line.runs)if(run.image&&!sprites.has(run.image))sprites.set(run.image,await image(run.image));
 for(const section of layout){
  const {size,font,lineHeight,emojiSize,top,height,settings}=section;
  ctx.font=font;ctx.textBaseline="alphabetic";ctx.lineJoin="round";ctx.lineWidth=Math.max(.5,size*.09);
  if(settings.style==="Snapchat"){ctx.fillStyle="rgba(0,0,0,0.5)";ctx.fillRect(0,top-size*.25,w,height+size*.5);}
  const metrics=ctx.measureText("Hg"),ascent=metrics.actualBoundingBoxAscent,descent=metrics.actualBoundingBoxDescent;
  section.lines.forEach((line,i)=>{
   let x=line.x;const y=top+i*lineHeight;
   if(settings.style==="Instagram"){
    ctx.fillStyle="#fff";ctx.beginPath();ctx.roundRect(x-size*.28,y-size*.08,line.width+size*.56,lineHeight+size*.16,size*.18);ctx.fill();
   }
   ctx.fillStyle=settings.style==="Instagram"?"#111":"#fff";ctx.strokeStyle="#222";
   for(const run of line.runs){
    if(run.image){ctx.drawImage(sprites.get(run.image)!,x,y+(lineHeight-emojiSize)/2,emojiSize,emojiSize);x+=emojiSize;}
    else{const baseline=y+(lineHeight-ascent-descent)/2+ascent;if(!["Snapchat","Instagram"].includes(settings.style))ctx.strokeText(run.text,x,baseline);ctx.fillText(run.text,x,baseline);x+=ctx.measureText(run.text).width;}
   }
  });
 }
 return canvas.toBuffer("image/png");
}
export async function emojiHookPNG(text:string,c:Composition,w:number,h:number,fontId?:Hook["fontId"]) {
 return renderHookPNG({id:"preview",text,fontId,createdAt:""},c,w,h);
}
