import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const revision='2b90b9f5ceec907a1c18123530e92e794ad901a4',destination=process.argv[2];
if(!destination)throw new Error('Supply the private SAM runtime directory.');
async function request(url){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`SAM download returned ${r.status}`);return r;}
const tree=await(await request(`https://api.github.com/repos/facebookresearch/sam2/git/trees/${revision}?recursive=1`)).json();
if(tree.truncated||!Array.isArray(tree.tree))throw new Error('Incomplete SAM source manifest.');
// Only inference code/configs and upstream licenses; omit sample videos/training data.
const files=tree.tree.filter(f=>f.type==='blob'&&(f.path.startsWith('sam2/')||['setup.py','pyproject.toml','MANIFEST.in','README.md','LICENSE','LICENSE_cctorch'].includes(f.path)));
const digest=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
let next=0;
await Promise.all(Array.from({length:4},async()=>{while(next<files.length){const f=files[next++],output=path.resolve(destination,f.path);if(!output.startsWith(path.resolve(destination)+path.sep))throw new Error('Invalid upstream file path.');const previous=await readFile(output).catch(()=>null);if(previous&&digest(previous)===f.sha)continue;const b=Buffer.from(await(await request(`https://raw.githubusercontent.com/facebookresearch/sam2/${revision}/${f.path}`)).arrayBuffer());if(digest(b)!==f.sha)throw new Error(`SAM integrity check failed: ${f.path}`);await mkdir(path.dirname(output),{recursive:true});await writeFile(output,b);}}));
console.log(`Verified ${files.length} official SAM runtime files at ${revision}.`);
