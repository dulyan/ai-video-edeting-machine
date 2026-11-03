import {test} from "node:test";
import assert from "node:assert/strict";
import {newProject,combinationCount,activeHooks} from "../shared/project.ts";
import {hookSections} from "../shared/hook-sections.ts";
import {layoutHookSections,renderHookPNG} from "../server/emoji-hook.ts";
import {projectSchema} from "../shared/schema.ts";
import {createCanvas,loadImage} from "@napi-rs/canvas";

test("sections inherit live defaults, preserve overrides, and remain one hook",()=>{
 const p=newProject();p.reactionIds=["r"];
 p.hooks=[{id:"h",text:"First",createdAt:"",sections:[{id:"s",text:"Second"},{id:"custom",text:"Third",settings:{fontId:"tiktok-default",fontSize:80,widthPercent:35,verticalOffset:10,style:"Instagram"}}]}];
 let sections=hookSections(p.hooks[0],p.composition);assert.equal(sections[1].settings.fontSize,p.composition.fontSize);
 p.composition.fontSize=65;p.composition.textWidth=55;
 sections=hookSections(p.hooks[0],p.composition);assert.equal(sections[1].settings.fontSize,65);assert.equal(sections[1].settings.widthPercent,55);assert.equal(sections[2].settings.fontSize,80);assert.equal(sections[2].settings.widthPercent,35);
 assert.equal(combinationCount(p),1);assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))).hooks,p.hooks);
 p.hooks[0].text="";assert.equal(activeHooks(p).length,1);p.hooks[0].enabled=false;assert.equal(activeHooks(p).length,0);
 assert(!projectSchema.safeParse({...p,composition:{...p.composition,textWidth:5}}).success);
 assert(!projectSchema.safeParse({...p,hooks:[{...p.hooks[0],sections:[{id:"bad",text:"Bad",settings:{verticalOffset:101}}]}]}).success);
});
test("section width wraps without changing glyph advances and position stays centered",()=>{
 const p=newProject(),hook={id:"h",text:"Spacing",createdAt:"",sections:[{id:"s",text:"Second line"}]};
 p.composition.fontSize=90;p.composition.textPosition=30;p.composition.textWidth=90;
 const wide=layoutHookSections(hook,p.composition,1080,1920);
 p.composition.textWidth=40;const narrow=layoutHookSections(hook,p.composition,1080,1920);
 assert.equal(wide[0].lines[0].width,narrow[0].lines[0].width);
 assert.equal(wide[1].settings.fontSize,90);assert(wide[1].top>wide[0].top+wide[0].height);
 p.composition.textPosition=50;const moved=layoutHookSections(hook,p.composition,1080,1920);
 assert(Math.abs(moved[0].top-narrow[0].top-384)<.001);
 assert(Math.abs(moved[1].top-narrow[1].top-384)<.001);
 for(const section of moved)for(const line of section.lines)assert(Math.abs(line.x+line.width/2-540)<.001);
 const adjusted=layoutHookSections({...hook,sections:[{id:"s",text:"Second line",settings:{verticalOffset:10}}]},p.composition,1080,1920);
 assert(Math.abs(adjusted[1].top-moved[1].top-192)<.001);
});
test("Instagram white background and colored Apple emoji render together",async()=>{
 const p=newProject();p.composition.style="Instagram";p.composition.fontSize=100;
 const png=await renderHookPNG({id:"h",text:"\u{1f602}",createdAt:"",sections:[{id:"s",text:"Second"}]},p.composition,216,384);
 const canvas=createCanvas(216,384),ctx=canvas.getContext("2d");ctx.drawImage(await loadImage(png),0,0);
 const data=ctx.getImageData(0,0,216,384).data;let white=0,colored=0,dark=0;
 for(let i=0;i<data.length;i+=4)if(data[i+3]>240){if(data[i]>240&&data[i+1]>240&&data[i+2]>240)white++;if(data[i]>140&&data[i+1]>70&&data[i+2]<100)colored++;if(data[i]<60&&data[i+1]<60&&data[i+2]<60)dark++;}
 assert(white>100);assert(colored>20);assert(dark>10);
});
