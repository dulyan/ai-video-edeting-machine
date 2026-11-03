import {test} from "node:test";
import assert from "node:assert/strict";
import {loadImage,createCanvas} from "@napi-rs/canvas";
import {hasHookEmoji} from "../shared/emoji.ts";
import {appleEmojiRuns,emojiHookPNG} from "../server/emoji-hook.ts";
import {newProject} from "../shared/project.ts";

test("Apple emoji matching preserves skin tones, flags, keycaps and joined sequences",()=>{
 const text="\u{1f602}\u{1f44d}\u{1f3fd}\u{1f1f7}\u{1f1fa}\u{1f469}\u{1f3fd}\u200d\u2695\ufe0f1\ufe0f\u20e3";
 const runs=appleEmojiRuns(text);assert.equal(runs.length,5);assert(runs.every(r=>r.image));
 assert.equal(runs[1].image,"1f44d-1f3fd.png");assert.equal(runs[2].image,"1f1f7-1f1fa.png");
 assert.equal(runs[3].image,"1f469-1f3fd-200d-2695-fe0f.png");
 assert(hasHookEmoji(text));assert(!hasHookEmoji("Plain text 123"));
 assert.deepEqual(appleEmojiRuns("Hello world"),[{text:"Hello world"}]);
});
test("shared emoji overlay retains color, transparency, font size, style and positions",async()=>{
 const p=newProject();p.composition.fontSize=100;
 const text="Hello \u{1f602}";
 for(const position of ["top","upper-middle","middle","lower-middle","bottom"] as const){
  p.composition.position=position;delete p.composition.textPosition;
  const png=await emojiHookPNG(text,p.composition,216,384);
  assert.deepEqual(png,await emojiHookPNG(text,p.composition,216,384));
  const image=await loadImage(png),canvas=createCanvas(216,384),ctx=canvas.getContext("2d");ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,216,384).data;let colored=0,sumY=0,visible=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>128){visible++;sumY+=Math.floor(i/4/216);if(pixels[i]>140&&pixels[i+1]>70&&pixels[i+2]<100)colored++;}
  assert(colored>10);assert(visible>100);assert.equal(pixels[3],0);
  const expected={top:.18,"upper-middle":.32,middle:.46,"lower-middle":.63,bottom:.8}[position]*384;
  assert(Math.abs(sumY/visible-expected)<10);
 }
 for(const style of ["Snapchat","Text Wall","Green screen"] as const){p.composition.style=style;assert((await emojiHookPNG(text,p.composition,216,384)).length>1000);}
});
