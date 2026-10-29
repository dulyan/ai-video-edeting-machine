import {readFile,writeFile,mkdir,open,unlink,stat,cp} from 'node:fs/promises';
import {existsSync,openSync,closeSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {createConnection} from 'node:net';
import {parse} from 'dotenv';

export const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const appName='AI Video Edeting Machine';
export function paths(home=process.env.LOCAL_APP_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData','Local'),appName)) {
 return {home,config:path.join(home,'config.env'),profile:path.join(home,'profile.json'),data:path.join(home,'workspace'),logs:path.join(home,'logs'),pid:path.join(home,'runtime.json'),lock:path.join(home,'launch.lock')};
}
export async function setup({home,archive,fresh=false,shortcuts=false}={}) {
 const p=paths(home);
 if(!existsSync(p.profile)&&!fresh)throw new Error('No initialized workspace. Set up a fresh workspace explicitly before starting.');
 await mkdir(p.home,{recursive:true});
 if(process.platform==='win32') {
  const user=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
  execFileSync('icacls.exe',[p.home,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'pipe'});
 }
 if(!existsSync(p.profile)) {
  if(existsSync(path.join(p.data,'workspace.sqlite'))) throw new Error('An existing database needs inspection; setup will not replace it.');
  let previous={};
  if(archive) previous=parse(execFileSync('tar',['-xOzf',path.resolve(archive),'etc/ai-video-edeting-machine/app.env'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));
  const profile={version:1,id:randomUUID(),createdAt:new Date().toISOString(),mode:'fresh-local-workspace'};
  const config={APP_PASSWORD:previous.APP_PASSWORD || randomBytes(24).toString('base64url'),ENCRYPTION_KEY:previous.ENCRYPTION_KEY || randomBytes(32).toString('hex'),LOCAL_CONTROL_TOKEN:randomBytes(32).toString('hex')};
  await writeFile(p.config,Object.entries(config).map(([key,value])=>key+'='+JSON.stringify(value)).join('\n')+'\n',{mode:0o600,flag:'wx'});
  await writeFile(p.profile,JSON.stringify(profile,null,2),{mode:0o600,flag:'wx'});
  await writeFile(path.join(p.home,'Workspace access.txt'),appName+'\nAddress: http://127.0.0.1:3001\nWorkspace password: '+config.APP_PASSWORD+'\n\nEnter the Siray API key separately in Settings.\n',{mode:0o600});
  // Preserve the previous checkout-local database and files, even when empty.
  if(existsSync(path.join(repoRoot,'data'))) await cp(path.join(repoRoot,'data'),path.join(p.home,'backups','before-local-setup','checkout-data'),{recursive:true,errorOnExist:true,force:false});
 }
 await mkdir(p.data,{recursive:true});await mkdir(p.logs,{recursive:true});
 if(shortcuts&&process.platform==='win32') execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(repoRoot,'scripts','install-shortcuts.ps1'),'-RepoRoot',repoRoot],{windowsHide:true,stdio:'pipe'});
 return p;
}
async function settings(p) {
 const profile=JSON.parse(await readFile(p.profile,'utf8')),config=parse(await readFile(p.config,'utf8'));
 if(!profile.id||!config.APP_PASSWORD||!config.ENCRYPTION_KEY||!config.LOCAL_CONTROL_TOKEN)throw new Error('Local configuration is incomplete. Keep existing data and repair the private configuration.');
 return {profile,config};
}
async function portOpen(port) {
 return new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});const done=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.setTimeout(1000,()=>done(true));});
}
async function inspect(base,profileId) {
 try {
  const response=await fetch(base+'/api/health',{signal:AbortSignal.timeout(1500)}),data=await response.json();
  if(data.app=== 'ai-video-edeting-machine' && data.local===true && data.profileId===profileId)return data;
 }catch{}
 if(await portOpen(Number(new URL(base).port)))throw new Error('Port '+new URL(base).port+' is occupied by another service. Nothing was stopped.');
 return null;
}
export async function start({home,browser=true,port=3001,queue=true,uiDir=path.join(repoRoot,'dist')}={}) {
 const p=paths(home),{profile,config}=await settings(p),base='http://127.0.0.1:'+port;
 const existing=await inspect(base,profile.id);
 if(existing){if(browser)openBrowser(base);return {...existing,reused:true};}
 let lock;
 try {lock=await open(p.lock,'wx',0o600);await lock.writeFile(JSON.stringify({pid:process.pid}));}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  const owner=JSON.parse(await readFile(p.lock,'utf8'));
  let alive=true;try{process.kill(owner.pid,0);}catch{alive=false;}
  if(!alive){await unlink(p.lock);return start({home,browser,port,queue,uiDir});}
  for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,250));const status=await inspect(base,profile.id).catch(()=>null);if(status){if(browser)openBrowser(base);return {...status,reused:true};}}
  throw new Error('Another launch is still in progress. Try again shortly.');
 }
 try {
  if(!existsSync(path.join(uiDir,'index.html')))throw new Error('Build the interface with npm run build before starting the local app.');
  await mkdir(p.logs,{recursive:true});
  const boot=path.join(p.logs,'startup.log');
  if(existsSync(boot)&&(await stat(boot)).size>1024*1024){await cp(boot,boot+'.previous');await writeFile(boot,'');}
  const output=openSync(boot,'a',0o600),instanceId=randomUUID();
  let child;
  try {
   child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:repoRoot,windowsHide:true,detached:true,stdio:['ignore','ignore',output],env:{...process.env,...config,NODE_ENV:'production',LOCAL_APP:'1',LOCAL_PROFILE_ID:profile.id,LOCAL_INSTANCE_ID:instanceId,LOCAL_LOG_FILE:path.join(p.logs,'app.log'),LOCAL_UI_DIR:uiDir,DATA_DIR:p.data,HOST:'127.0.0.1',PORT:String(port),PUBLIC_API_URL:base,FRONTEND_ORIGIN:base,QUEUE_ENABLED:queue?'1':'0',S3_BUCKET:'',S3_ENDPOINT:''}});
  }finally{closeSync(output);}
  let spawnError;child.on('error',error=>{spawnError=error;});child.unref();
  await writeFile(p.pid,JSON.stringify({pid:child.pid,instanceId,profileId:profile.id,port,startedAt:new Date().toISOString()}),{mode:0o600});
  for(let i=0;i<100;i++) {
   if(spawnError)throw spawnError;
   await new Promise(r=>setTimeout(r,200));
   const status=await inspect(base,profile.id).catch(()=>null);
   if(status){if(browser)openBrowser(base);return {...status,reused:false};}
   if(child.exitCode!==null)break;
  }
  throw new Error('The local backend did not start. Inspect '+boot+' and '+path.join(p.logs,'app.log')+'.');
 }finally{await lock.close();await unlink(p.lock).catch(()=>{});}
}
export async function stop({home,port=3001}={}) {
 const p=paths(home),{profile,config}=await settings(p),base='http://127.0.0.1:'+port;
 const status=await inspect(base,profile.id);if(!status)return {stopped:false};
 const response=await fetch(base+'/api/local/shutdown',{method:'POST',headers:{'X-Local-Control':config.LOCAL_CONTROL_TOKEN},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw new Error('The backend refused the shutdown request. No process was killed.');
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));if(!await portOpen(port)){await unlink(p.pid).catch(()=>{});return {stopped:true};}}
 throw new Error('Shutdown is still waiting for active requests. No unrelated process was killed.');
}
function openBrowser(base) {
 const child=process.platform==='win32'
  ? spawn('powershell.exe',['-NoProfile','-Command',"Start-Process -FilePath '"+base+"'"],{windowsHide:true,detached:true,stdio:'ignore'})
  : spawn(process.platform==='darwin'?'open':'xdg-open',[base],{detached:true,stdio:'ignore'});
 child.on('error',()=>{});child.unref();
}
