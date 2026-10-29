import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

export function rotatingLog(file: string, maxBytes = 5 * 1024 * 1024) {
  mkdirSync(path.dirname(file), {recursive:true});
  let bytes = existsSync(file) ? statSync(file).size : 0;
  return {write(text: string) {
    if (bytes + Buffer.byteLength(text) > maxBytes) {
      if (existsSync(file+".3")) unlinkSync(file+".3");
      for (let i=2;i>=1;i--) if (existsSync(file+"."+i)) renameSync(file+"."+i,file+"."+(i+1));
      if (existsSync(file)) renameSync(file,file+".1");
      bytes=0;
    }
    appendFileSync(file,text,{mode:0o600});
    bytes+=Buffer.byteLength(text);
  }};
}
