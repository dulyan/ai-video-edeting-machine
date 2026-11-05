import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../public/fonts/',import.meta.url));
// Pinned upstream; retain historical files/checksums for immutable job snapshots.
const upstream='https://raw.githubusercontent.com/ArtifexSoftware/urw-base35-fonts/3c0ba3b5687632dfc66526544a4e811fe0ec0cd9/';
async function download(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Font download failed: '+r.status);return Buffer.from(await r.arrayBuffer());}
const source=upstream+'fonts/NimbusSans-Regular.otf',bytes=await download(source);
if(bytes.toString('ascii',0,4)!=='OTTO')throw new Error('Invalid Nimbus font');
await writeFile(dir+'nimbus-classic.otf',bytes);
for(const file of ['LICENSE','COPYING'])await writeFile(dir+'nimbus-classic-'+file+'.txt',await download(upstream+file));
const entry={id:'nimbus-classic',family:'Nimbus Sans',weight:400,source,license:upstream+'LICENSE',licenseFile:'nimbus-classic-LICENSE.txt',file:'nimbus-classic.otf',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
const old=JSON.parse(await readFile(dir+'manifest.json','utf8')),all=[...old.fonts.filter(f=>f.id!==entry.id),entry];
await writeFile(dir+'manifest.json',JSON.stringify({retrievedAt:new Date().toISOString(),fonts:all},null,2)+'\n');
await writeFile(dir+'fonts.css',all.map(f=>`@font-face { font-family: "AVEM ${f.family}"; font-style: normal; font-weight: ${f.weight}; font-display: swap; src: url("./${f.file||f.id+'.ttf'}") format("${f.file?.endsWith('.otf')?'opentype':'truetype'}"); }`).join('\n')+'\n');
console.log('Bundled Nimbus Sans, '+bytes.length+' bytes, with upstream licenses.');
