import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {TEXT_APPEARANCES,currentHookComposition} from '../shared/hook-appearance.ts';
import {newProject} from '../shared/project.ts';
import {hookSections} from '../shared/hook-sections.ts';
import {layoutHookSections,renderHookPNG} from '../server/emoji-hook.ts';
import {inspectClassicFont} from '../server/local-hook-font.ts';
import {projectSchema} from '../shared/schema.ts';

test('four text treatments preserve natural letter geometry, Apple emoji, centering and section inheritance',async()=>{
 const c=newProject().composition;c.fontSize=100;c.textWidth=80;
 const hook={id:'h',text:'\u041f\u0440\u0438\u0432\u0435\u0442 \u{1f602}',createdAt:'',sections:[{id:'s',text:'Second',settings:{textAppearance:'plain' as const}}]};
 const widths:number[]=[];const counts:Record<string,{black:number,white:number,grey:number,colored:number,visible:number}>={};
 for(const textAppearance of TEXT_APPEARANCES){
  c.textAppearance=textAppearance;const layout=layoutHookSections(hook,c,1080,1920);widths.push(layout[0].lines[0].width);
  assert.equal(hookSections(hook,c)[0].settings.textAppearance,textAppearance);assert.equal(hookSections(hook,c)[1].settings.textAppearance,'plain');
  for(const s of layout)for(const line of s.lines)assert(Math.abs(line.x+line.width/2-540)<.001);
  const png=await renderHookPNG(hook,c,216,384),ctx=createCanvas(216,384).getContext('2d');ctx.drawImage(await loadImage(png),0,0);
  const data=ctx.getImageData(0,0,216,384).data,n={black:0,white:0,grey:0,colored:0,visible:0};
  for(let i=0;i<data.length;i+=4)if(data[i+3]>150){const [r,g,b]=data.subarray(i,i+3);n.visible++;if(r<40&&g<40&&b<40)n.black++;if(r>235&&g>235&&b>235)n.white++;if(Math.abs(r-96)<3&&Math.abs(g-96)<3&&Math.abs(b-96)<3)n.grey++;if(r>140&&g>70&&b<100)n.colored++;}
  assert(n.colored>20);counts[textAppearance]=n;
 }
 assert(widths.every(w=>w===widths[0]));assert(counts.outline.black>counts.plain.black+10);
 assert(counts['white-box'].white>counts.plain.white+100);assert(counts['white-box'].black>20);
 assert(counts['grey-box'].grey>100);assert(counts['grey-box'].white>20);
});

test('legacy snapshots keep original fonts while the live editor uses Classic and saves appearances',()=>{
 const p=newProject();assert.equal(p.language,'Russian');
 const hook={id:'h',text:'Text',createdAt:''};
 const old={...p.composition,textLayoutVersion:3 as const,fontId:'instagram-default' as const,style:'Instagram' as const};
 assert.equal(hookSections(hook,old)[0].settings.fontId,'instagram-default');
 const current=currentHookComposition(old);assert.equal(current.style,'Text');assert.equal(current.fontId,'tiktok-classic-ru');
 current.textAppearance='grey-box';p.composition=current;p.hooks=[{...hook,sections:[{id:'s',text:'Extra',settings:{fontId:'tiktok-classic-legacy',textAppearance:'plain'}}]}];
 assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(p))).composition,p.composition);
 assert.equal(hookSections(p.hooks[0],p.composition)[1].settings.fontId,'tiktok-classic-legacy');
});

test('legacy font import rejects invalid files and other fonts instead of relabeling them',async()=>{
 assert.throws(()=>inspectClassicFont(Buffer.from('not a font')),/Proxima Nova Semibold/);
 assert.throws(()=>inspectClassicFont(Buffer.alloc(6*1024*1024)),/Proxima Nova Semibold/);
 const current=await readFile('public/fonts/tiktok-default.ttf');assert.throws(()=>inspectClassicFont(current),/Proxima Nova Semibold/);
});

function classicMetadata(includeYo=true){
 const nameText=Buffer.from('Proxima Nova','utf16le').swap16(),name=Buffer.alloc(18+nameText.length);name.writeUInt16BE(1,2);name.writeUInt16BE(18,4);name.writeUInt16BE(3,6);name.writeUInt16BE(1,8);name.writeUInt16BE(0x409,10);name.writeUInt16BE(1,12);name.writeUInt16BE(nameText.length,14);nameText.copy(name,18);
 const os2=Buffer.alloc(6);os2.writeUInt16BE(600,4);
 const groups=includeYo?[[1025,1025],[1040,1103],[1105,1105]]:[[1040,1103]];
 const sub=Buffer.alloc(16+groups.length*12);sub.writeUInt16BE(12);sub.writeUInt32BE(sub.length,4);sub.writeUInt32BE(groups.length,12);groups.forEach(([start,end],i)=>{sub.writeUInt32BE(start,16+i*12);sub.writeUInt32BE(end,20+i*12);sub.writeUInt32BE(1,24+i*12);});
 const cmap=Buffer.alloc(12+sub.length);cmap.writeUInt16BE(1,2);cmap.writeUInt16BE(3,4);cmap.writeUInt16BE(10,6);cmap.writeUInt32BE(12,8);sub.copy(cmap,12);
 const tables=[['name',name],['OS/2',os2],['cmap',cmap]] as const,header=Buffer.alloc(12+tables.length*16);header.writeUInt32BE(0x00010000);header.writeUInt16BE(tables.length,4);let at=header.length;tables.forEach(([tag,bytes],i)=>{header.write(tag,12+i*16);header.writeUInt32BE(at,20+i*16);header.writeUInt32BE(bytes.length,24+i*16);at+=bytes.length;});return Buffer.concat([header,...tables.map(t=>t[1])]);
}
test('legacy font validation requires the complete Russian alphabet including Yo',()=>{
 assert.equal(inspectClassicFont(classicMetadata()).weight,600);assert.throws(()=>inspectClassicFont(classicMetadata(false)),/Russian alphabet/);
});
