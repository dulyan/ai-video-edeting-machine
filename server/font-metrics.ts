import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const cache=new Map<string,number>();
// libass uses OS/2 Win ascent + descent for REAL_DIM sizing, whereas CSS
// font-size scales the em square. Convert to retain the browser's glyph size.
export function assEmScale(file:string) {
  if(cache.has(file))return cache.get(file)!;
  const data=readFileSync(fileURLToPath(new URL(`../public/fonts/${file}`,import.meta.url)));
  const tables=new Map<string,number>();
  for(let i=0;i<data.readUInt16BE(4);i++){const offset=12+i*16;tables.set(data.toString("ascii",offset,offset+4),data.readUInt32BE(offset+8));}
  const head=tables.get("head")!,os2=tables.get("OS/2")!;
  const ratio=(data.readUInt16BE(os2+74)+data.readUInt16BE(os2+76))/data.readUInt16BE(head+18);
  if(!Number.isFinite(ratio)||ratio<=0)throw new Error("Invalid bundled font metrics");
  cache.set(file,ratio);return ratio;
}
