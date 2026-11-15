import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {createReadStream} from 'node:fs';
import {stat,unlink} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {FastifyInstance} from 'fastify';
import type {Asset} from '../shared/types.ts';
import {db,get,getSecret,setSecret,workDir} from './store.ts';
import {downloadAsset} from './storage.ts';

const configSchema=z.object({accountId:z.string().regex(/^[a-f0-9]{32}$/i),bucket:z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),accessKeyId:z.string().min(1).max(1000),secretAccessKey:z.string().min(1).max(1000)});
type Config=z.infer<typeof configSchema>;
type Upload={id:string;job_id:string;asset_id:string;profile:string;object_key:string;uploaded:number;expires_at:number};
db.exec('CREATE TABLE IF NOT EXISTS wan_uploads(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,asset_id TEXT NOT NULL,profile TEXT NOT NULL,object_key TEXT NOT NULL,uploaded INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL,UNIQUE(job_id,asset_id,profile))');
const current=():Config|undefined=>{const value=getSecret('r2-current');return value?configSchema.parse(JSON.parse(value)):undefined;};
export const r2Configured=()=>!!getSecret('r2-current');
export function saveR2Config(input:unknown){
 const patch=configSchema.partial().parse(input),old=current();const c=configSchema.parse({...old,...patch});
 setSecret('r2-current',JSON.stringify(c));return c;
}
const profileOf=(c:Config)=>createHash('sha256').update(JSON.stringify(c)).digest('hex');
const client=(c:Config)=>new S3Client({endpoint:`https://${c.accountId}.r2.cloudflarestorage.com`,region:'auto',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:c.accessKeyId,secretAccessKey:c.secretAccessKey}});
const locks=new Map<string,Promise<void>>();
async function locked<T>(key:string,action:()=>Promise<T>):Promise<T>{const before=locks.get(key)||Promise.resolve();let release!:()=>void;const next=new Promise<void>(r=>{release=r;});locks.set(key,next);await before;try{return await action();}finally{release();if(locks.get(key)===next)locks.delete(key);}}
const lockKey=(job:string,asset:string,profile:string)=>JSON.stringify([job,asset,profile]);

/** Separate from workspace storage: only explicitly submitted Wan inputs leave the PC. */
export class WanMediaHost{
 constructor(private connect:(c:Config)=>any=client,private sign:typeof getSignedUrl=getSignedUrl){}
 async publish(asset:Asset,jobId:string,signal?:AbortSignal){
  const c=current();if(!c)throw new Error('Configure private R2 storage in Settings before using library media with Wan API.');
  const profile=profileOf(c);return locked(lockKey(jobId,asset.id,profile),()=>this.publishLocked(asset,jobId,c,profile,signal));
 }
 private async publishLocked(asset:Asset,jobId:string,c:Config,profile:string,signal?:AbortSignal){
  setSecret('r2-profile-'+profile,JSON.stringify(c));
  let row=db.prepare('SELECT * FROM wan_uploads WHERE job_id=? AND asset_id=? AND profile=?').get(jobId,asset.id,profile) as Upload|undefined;
  if(!row){const id=crypto.randomUUID(),ext=({"image/jpeg":'jpg',"image/png":'png',"image/webp":'webp',"video/mp4":'mp4',"audio/mpeg":'mp3',"audio/wav":'wav',"audio/mp4":'m4a'} as Record<string,string>)[asset.mime]||'bin';row={id,job_id:jobId,asset_id:asset.id,profile,object_key:'wan-inputs/'+id+'.'+ext,uploaded:0,expires_at:Date.now()+48*3600000};db.prepare('INSERT INTO wan_uploads(id,job_id,asset_id,profile,object_key,uploaded,expires_at) VALUES(?,?,?,?,?,?,?)').run(row.id,row.job_id,row.asset_id,row.profile,row.object_key,row.uploaded,row.expires_at);}
  const api=this.connect(c),file=path.join(workDir,crypto.randomUUID()+'.wan-original');
  try{
   const abort=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(10*60*1000)]);
   if(row.uploaded){try{const info=await api.send(new HeadObjectCommand({Bucket:c.bucket,Key:row.object_key}),{abortSignal:abort});if(info.ContentLength!==asset.size)row.uploaded=0;}catch(e:any){if(e.$metadata?.httpStatusCode===404||['NotFound','NoSuchKey'].includes(e.name))row.uploaded=0;else throw e;}}
   if(!row.uploaded){await downloadAsset(asset,file);abort.throwIfAborted();const size=(await stat(file)).size,hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);const checksum=hash.digest('hex');
    await api.send(new PutObjectCommand({Bucket:c.bucket,Key:row.object_key,Body:createReadStream(file),ContentLength:size,ContentType:asset.mime,Metadata:{sha256:checksum}}),{abortSignal:abort});
    db.prepare('UPDATE wan_uploads SET uploaded=1 WHERE id=?').run(row.id);
   }
   // Sign only at submission time, never put this capability URL in project drafts/SSE.
   const url=await this.sign(api,new GetObjectCommand({Bucket:c.bucket,Key:row.object_key}),{expiresIn:24*3600});
   db.prepare('UPDATE wan_uploads SET expires_at=? WHERE id=?').run(Date.now()+48*3600000,row.id);return url;
  }catch{if(signal?.aborted)signal.throwIfAborted();throw new Error('R2 reference upload/signing failed. Check the private bucket, credentials and connection. No new Wan request was submitted by this upload.');}
  finally{await unlink(file).catch(()=>{});api.destroy?.();}
 }
 async cleanup(now=Date.now()){
  const rows=db.prepare('SELECT * FROM wan_uploads ORDER BY expires_at LIMIT 500').all() as Upload[];let deleted=0,failed=0;
  let attempted=0;
  for(const row of rows){if(attempted>=20)break;await locked(lockKey(row.job_id,row.asset_id,row.profile),async()=>{
   const fresh=db.prepare('SELECT * FROM wan_uploads WHERE id=?').get(row.id) as Upload|undefined;if(!fresh)return;
   const job=get('jobs',row.job_id),terminal=job&&(job.status==='completed'||job.status==='failed'&&!job.taskId);
   if(job&&['queued','running'].includes(job.status))return;
   if(terminal?now-Date.parse(job.updatedAt)<3600000:now<fresh.expires_at)return;
   attempted++;
   const value=getSecret('r2-profile-'+row.profile);if(!value){failed++;return;}
   const c=configSchema.parse(JSON.parse(value)),api=this.connect(c);
   try{if(!/^wan-inputs\/[0-9a-f-]{36}(?:\.[a-z0-9]{1,5})?$/.test(row.object_key))throw new Error('Invalid temporary key');await api.send(new DeleteObjectCommand({Bucket:c.bucket,Key:row.object_key}),{abortSignal:AbortSignal.timeout(30000)});db.prepare('DELETE FROM wan_uploads WHERE id=?').run(row.id);deleted++;}catch{failed++;}finally{api.destroy?.();}
  });
  }
  db.exec("DELETE FROM secrets WHERE name LIKE 'r2-profile-%' AND substr(name,12) NOT IN (SELECT DISTINCT profile FROM wan_uploads)");
  return {deleted,failed};
 }
}
export const wanMediaHost=new WanMediaHost();
let cleaning=false;
export async function cleanupWanInputs(){if(cleaning)return;cleaning=true;try{await wanMediaHost.cleanup();}finally{cleaning=false;}}
export function registerWanHosting(app:FastifyInstance){
 app.get('/api/r2/settings',()=>{const c=current();return {configured:!!c,accountId:c?.accountId||'',bucket:c?.bucket||'',pendingCopies:(db.prepare('SELECT count(*) AS n FROM wan_uploads').get() as {n:number}).n};});
 app.put('/api/r2/settings',async req=>{saveR2Config(req.body);return {ok:true};});
 app.post('/api/r2/test',async()=>{
  const c=current();if(!c)throw new Error('Save R2 settings first.');const api=client(c),id=crypto.randomUUID(),assetId='r2-test-'+id,profile=profileOf(c),key='wan-inputs/'+id;
  setSecret('r2-profile-'+profile,JSON.stringify(c));db.prepare('INSERT INTO wan_uploads VALUES(?,?,?,?,?,?,?)').run(id,assetId,assetId,profile,key,0,Date.now());
  try{await api.send(new PutObjectCommand({Bucket:c.bucket,Key:key,Body:Buffer.from('wan-original-test'),ContentType:'application/octet-stream'}),{abortSignal:AbortSignal.timeout(20000)});const url=await getSignedUrl(api,new GetObjectCommand({Bucket:c.bucket,Key:key}),{expiresIn:60});const response=await fetch(url,{headers:{Range:'bytes=0-3'},redirect:'error',signal:AbortSignal.timeout(20000)});if(response.status!==206||(await response.text())!=='wan-')throw new Error('Range test failed');return {ok:true};}
  catch{throw new Error('R2 test failed. Check bucket-scoped Object Read & Write credentials and network access.');}
  finally{try{await api.send(new DeleteObjectCommand({Bucket:c.bucket,Key:key}),{abortSignal:AbortSignal.timeout(20000)});db.prepare('DELETE FROM wan_uploads WHERE id=?').run(id);}catch{throw new Error('R2 test cleanup failed. Check Object Read & Write permissions; the temporary test copy remains tracked for cleanup.');}finally{api.destroy();}}
 });
 app.post('/api/r2/cleanup',async()=>wanMediaHost.cleanup());
}
