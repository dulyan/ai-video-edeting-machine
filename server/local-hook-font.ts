import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {GlobalFonts} from '@napi-rs/canvas';
const fontSpec=(id:string)=>{
 if(id==='classic-iphone-helvetica')return {name:'Helvetica Pro Roman',family:'Helvetica Reference',file:'helvetica-roman.otf',weight:400,match:(values:string[])=>values.some(v=>/Helvetica/i.test(v))&&!values.some(v=>/Neue|World|Condensed|Narrow|Rounded|Textbook|Oblique|Italic/i.test(v))};
 if(id==='tiktok-classic-legacy')return {name:'Proxima Nova Semibold',family:'Proxima Nova',file:'proxima-nova-semibold.otf',weight:600,match:(values:string[])=>values.some(v=>/Proxima\s*Nova/i.test(v))};
 throw new Error('Choose a supported local hook font');
};
export const localClassicFontPath=(id='tiktok-classic-legacy')=>path.resolve(process.env.DATA_DIR||'./data','fonts',fontSpec(id).file);
/** Validate the actual SFNT identity and Russian character coverage, not the filename. */
export function inspectClassicFont(b:Buffer,id="tiktok-classic-legacy") {
 const spec=fontSpec(id);
 try {
  if(b.length<12||b.length>5*1024*1024||![0x00010000,0x4f54544f].includes(b.readUInt32BE()))throw Error();
  const tables=new Map<string,Buffer>();
  for(let n=0;n<b.readUInt16BE(4);n++){const at=12+n*16,start=b.readUInt32BE(at+8),length=b.readUInt32BE(at+12);if(start+length>b.length)throw Error();tables.set(b.toString('ascii',at,at+4),b.subarray(start,start+length));}
  const names=tables.get('name')!,base=names.readUInt16BE(4),values:string[]=[];
  for(let n=0;n<names.readUInt16BE(2);n++) {const at=6+n*12,id=names.readUInt16BE(at+6);if(![1,2,4,6,16,17].includes(id))continue;const start=base+names.readUInt16BE(at+10),length=names.readUInt16BE(at+8),v=names.subarray(start,start+length);values.push([0,3].includes(names.readUInt16BE(at))?Buffer.from(v).swap16().toString('utf16le'):v.toString('latin1'));}
  if(!spec.match(values)||tables.get('OS/2')!.readUInt16BE(4)!==spec.weight)throw Error();
  const cmap=tables.get('cmap')!,subtables:Buffer[]=[];
  for(let n=0;n<cmap.readUInt16BE(2);n++){const at=4+n*8,platform=cmap.readUInt16BE(at),encoding=cmap.readUInt16BE(at+2);if(platform===0||(platform===3&&[1,10].includes(encoding)))subtables.push(cmap.subarray(cmap.readUInt32BE(at+4)));}
  const glyph=(s:Buffer,cp:number)=>{
   const format=s.readUInt16BE();
   if(format===12){for(let n=0;n<s.readUInt32BE(12);n++){const at=16+n*12,start=s.readUInt32BE(at),end=s.readUInt32BE(at+4);if(cp>=start&&cp<=end)return s.readUInt32BE(at+8)+cp-start;}return 0;}
   if(format!==4)return 0;const count=s.readUInt16BE(6)/2;
   for(let n=0;n<count;n++){if(cp>s.readUInt16BE(14+n*2)||cp<s.readUInt16BE(16+count*2+n*2))continue;const delta=s.readInt16BE(16+count*4+n*2),at=16+count*6+n*2,offset=s.readUInt16BE(at);if(!offset)return(cp+delta)&65535;const g=s.readUInt16BE(at+offset+(cp-s.readUInt16BE(16+count*2+n*2))*2);return g?(g+delta)&65535:0;}return 0;
  };
  for(const cp of [...Array.from({length:64},(_,i)=>1040+i),1025,1105])if(!subtables.some(s=>glyph(s,cp)>0))throw Error();
  return {family:spec.family,weight:spec.weight,sha256:createHash('sha256').update(b).digest('hex')};
 } catch {throw new Error('Choose a valid '+spec.name+' TTF/OTF with the full Russian alphabet (including \u0401/\u0451).');}
}
export function localClassicInstalled(id="tiktok-classic-legacy"){return existsSync(localClassicFontPath(id));}
export async function installClassicFont(bytes:Buffer,id="tiktok-classic-legacy") {
 const spec=fontSpec(id),info=inspectClassicFont(bytes,id),file=localClassicFontPath(id);
 if(localClassicInstalled(id)){
  if(createHash('sha256').update(await readFile(file)).digest('hex')!==info.sha256)throw new Error(spec.name+' is already installed. Keep its original file for existing render snapshots.');
  return info;
 }
 const key=GlobalFonts.register(bytes,'AVEM Classic validation');if(!key)throw new Error('The renderer could not load this font.');GlobalFonts.remove(key);
 await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes,{flag:'wx',mode:0o600});return info;
}
export function requireLocalClassicFont(id='tiktok-classic-legacy'){if(!localClassicInstalled(id))throw new Error('Import a licensed '+fontSpec(id).name+' font file to use this font in previews and renders.');return localClassicFontPath(id);}
