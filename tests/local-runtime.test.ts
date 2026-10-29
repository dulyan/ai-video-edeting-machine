import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createServer,request as httpRequest} from "node:http";
import {parse} from "dotenv";
import {initialBackend} from "../shared/backend.ts";
import {newProject} from "../shared/project.ts";
const launcherModule="../scripts/local-runtime.mjs",backupModule="../scripts/local-backup.mjs";
const {setup,start,stop}=await import(launcherModule);
const {backupLocal}=await import(backupModule);
async function unusedPort() {
 const server=createServer();await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const port=(server.address() as {port:number}).port;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;
}
test("local launcher serves UI and authenticated API, reuses its instance, backs up, and stops safely",async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),"avem-local-")),port=await unusedPort(),base=`http://127.0.0.1:${port}`;
 const p=await setup({home,fresh:true}),uiDir=path.join(home,"fixture-ui");
 await mkdir(uiDir);await writeFile(path.join(uiDir,"index.html"),"<!doctype html><title>Local fixture</title><h1>Local interface</h1>");
 await writeFile(path.join(uiDir,"fixture.css"),"body{color:black}");
 const config=parse(await readFile(p.config,"utf8"));
 try {
  const status=await start({home,port,browser:false,queue:false,uiDir});
  assert.equal(status.queueEnabled,false);assert.equal(status.local,true);
  const html=await fetch(base);assert.equal(html.status,200);assert((await html.text()).includes("Local interface"));
  assert.equal((await fetch(base+"/fixture.css")).status,200);
  assert.equal((await fetch(base+"/api/state")).status,401);
  assert.notEqual((await fetch(base+"/%61pi/state")).status,200);
  const hostileHost = await new Promise<number|undefined>(resolve=>{const request=httpRequest(base+"/api/health",{headers:{Host:"evil.example"}},response=>{response.resume();resolve(response.statusCode);});request.end();});
  assert.equal(hostileHost,403);
  assert.equal((await fetch(base+"/api/health",{headers:{Origin:"https://evil.example"}})).status,403);
  assert.equal((await fetch(base+"/api/local/shutdown",{method:"POST"})).status,403);
  assert.equal((await fetch(base+"/config.env")).status,404);
  const login=await fetch(base+"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:config.APP_PASSWORD})});
  const {token}=await login.json() as {token:string};assert(token);
  const headers={Authorization:"Bearer "+token,"Content-Type":"application/json"};
  const project=newProject();project.name="Local backup test";
  assert.equal((await fetch(base+"/api/projects/"+project.id,{method:"PUT",headers,body:JSON.stringify(project)})).status,200);
  assert.equal((await (await fetch(base+"/api/state",{headers})).json() as any).projects[0].name,project.name);
  const reused=await start({home,port,browser:false,queue:false,uiDir});
  assert.equal(reused.reused,true);assert.equal(reused.instanceId,status.instanceId);
  const backup=await backupLocal(p),manifest=JSON.parse(await readFile(path.join(backup,"manifest.json"),"utf8"));assert(manifest.files.some((file:any)=>file.name==="config.env"));
  assert.equal((await stop({home,port})).stopped,true);
  const log=await readFile(path.join(p.logs,"app.log"),"utf8");
  assert(!log.includes(config.LOCAL_CONTROL_TOKEN));assert(!log.includes(config.APP_PASSWORD));
  assert.equal((await stop({home,port})).stopped,false);
 }finally{await stop({home,port}).catch(()=>{});}
});
test("launcher refuses an unrelated service without stopping it",async()=>{
 const home=await mkdtemp(path.join(os.tmpdir(),"avem-conflict-"));await setup({home,fresh:true});
 const other=createServer((_req,res)=>{res.setHeader("Content-Type","application/json");res.end('{"other":true}');});
 await new Promise<void>(resolve=>other.listen(0,"127.0.0.1",resolve));const port=(other.address() as {port:number}).port;
 try{await assert.rejects(start({home,port,browser:false}),/occupied by another service/);await assert.rejects(stop({home,port}),/occupied by another service/);assert.equal((await fetch(`http://127.0.0.1:${port}`)).status,200);}
 finally{await new Promise<void>(resolve=>other.close(()=>resolve()));}
});
test("built local frontend ignores stale VPS settings while hosted/dev interfaces preserve configuration",()=>{
 assert.equal(initialBackend("http://127.0.0.1:3001","https://old-vps","https://pages-default",false),"http://127.0.0.1:3001");
 assert.equal(initialBackend("https://dulyan.github.io","https://saved","https://default",false),"https://saved");
 assert.equal(initialBackend("http://127.0.0.1:5173",null,undefined,true),"http://127.0.0.1:3001");
});
