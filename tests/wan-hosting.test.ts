import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import Fastify from 'fastify';
import {Readable} from 'node:stream';
import {createReadStream} from 'node:fs';
import {PutObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
process.env.DATA_DIR=await mkdtemp(path.join(os.tmpdir(),'wan-hosting-'));
const {db,put,get,addJob,mediaDir,setSecret}=await import('../server/store.ts');
const {WanMediaHost,saveCloudStorageConfig,registerWanHosting,createHostingClient,wanStorageConfigured}=await import('../server/wan-hosting.ts');
const {providerModels,validateExternal}=await import('../server/providers.ts');
const {externalEstimate}=await import('../server/provider-pricing.ts');
const fixture=Buffer.from([0,255,1,254,12,145,0,9,84]);
const config={bucket:'private-wan-fixture',accessKeyId:'fixture-r2-access',secretAccessKey:'fixture-r2-secret'};
const objects=new Map<string,{body:Buffer;metadata:any}>();let puts=0,failPut=false,failDelete=false;
const deletions:string[]=[],buckets:string[]=[];let beforeDelete:((key:string)=>void)|undefined;
const host=new WanMediaHost(c=>({destroy(){},async send(command:any){const p=command.input;assert(!p.ACL,'Must never publish a public ACL');buckets.push(c.bucket);if(command.constructor.name==='PutObjectCommand'){const chunks=[];for await(const b of p.Body)chunks.push(b);const body=Buffer.concat(chunks);assert.equal(p.ContentLength,body.length);objects.set(p.Key,{body,metadata:p.Metadata});puts++;if(failPut)throw new Error(config.secretAccessKey);return {};}if(command.constructor.name==='HeadObjectCommand'){const item=objects.get(p.Key);if(!item)throw Object.assign(new Error('missing'),{name:'NotFound'});return {ContentLength:item.body.length};}if(command.constructor.name==='DeleteObjectCommand'){beforeDelete?.(p.Key);if(failDelete)throw new Error('temporary connection failure');deletions.push(p.Key);objects.delete(p.Key);return {};}throw new Error('Unexpected command');}}),async(_client:any,command:any,options:any)=>{assert.equal(options.expiresIn,86400);return 'https://signed.example/'+command.input.Key+'?temporary=capability';});
async function source(id:string){await writeFile(path.join(mediaDir,id+'.png'),fixture);return put('assets',{id,key:id+'.png',name:id,projectId:'p',mime:'image/png',kind:'image',size:fixture.length,createdAt:''});}
const job=()=>addJob('p','video','Wan fixture',{tool:'vidgen',model:'wanapi/wan3.0-video'});
test('Google credentials are validated, encrypted and never returned; partial settings preserve saved keys',async()=>{
 assert.throws(()=>saveCloudStorageConfig({bucket:'https://evil.test'}));saveCloudStorageConfig(config);saveCloudStorageConfig({bucket:config.bucket});
 const app=Fastify();registerWanHosting(app);const r=await app.inject({url:'/api/wan-storage/settings'});assert.equal(r.statusCode,200);assert.equal(r.json().configured,true);assert(!r.body.includes(config.accessKeyId));assert(!r.body.includes(config.secretAccessKey));assert(!String((db.prepare("SELECT value FROM secrets WHERE name='wan-storage-current'").get() as any).value).includes(config.secretAccessKey));await app.close();
});
test('hosting streams exact original bytes, signs privately and reuses one object per job/reference',async()=>{
 const a=await source('original'),j=job(),before=puts;const [url]=await Promise.all([host.publish(a,j.id),host.publish(a,j.id)]);assert(url.startsWith('https://signed.example/wan-inputs/'));const row=db.prepare('SELECT * FROM wan_uploads WHERE job_id=?').get(j.id) as any;const item=objects.get(row.object_key)!;assert(item.body.equals(fixture));assert.equal(item.metadata.sha256,createHash('sha256').update(fixture).digest('hex'));await host.publish(a,j.id);assert.equal(puts,before+1);assert(!JSON.stringify(get('jobs',j.id)).includes('temporary=capability'));assert((await readFile(path.join(mediaDir,a.key))).equals(fixture));
 objects.delete(row.object_key);await host.publish(a,j.id);assert.equal(puts,before+2,'A deleted cloud copy must be rebuilt from the original');
});
test('failed uploads retain durable cleanup records, hide secrets and retry with the same object key',async()=>{
 const a=await source('failure'),j=job();failPut=true;await assert.rejects(host.publish(a,j.id),e=>!String(e).includes(config.secretAccessKey));failPut=false;const row=db.prepare('SELECT * FROM wan_uploads WHERE job_id=?').get(j.id) as any;assert.equal(row.uploaded,0);await host.publish(a,j.id);assert.equal((db.prepare('SELECT * FROM wan_uploads WHERE job_id=?').get(j.id) as any).object_key,row.object_key);
});
test('cleanup retains active/canceled work, retries deletion and uses archived encrypted settings after rotation',async()=>{
 const a=await source('cleanup'),done=job(),running=job(),canceled=job();await host.publish(a,done.id);await host.publish(a,running.id);await host.publish(a,canceled.id);const then=Date.now();put('jobs',{...done,status:'completed',updatedAt:new Date(then).toISOString()});put('jobs',{...running,status:'running'});put('jobs',{...canceled,status:'canceled'});
 saveCloudStorageConfig({...config,bucket:'new-private-bucket'});failDelete=true;assert((await host.cleanup(then+2*3600000)).failed>0);assert(db.prepare('SELECT id FROM wan_uploads WHERE job_id=?').get(done.id));failDelete=false;await host.cleanup(then+2*3600000);assert.equal(db.prepare('SELECT id FROM wan_uploads WHERE job_id=?').get(done.id),undefined);assert(db.prepare('SELECT id FROM wan_uploads WHERE job_id=?').get(canceled.id));await host.cleanup(then+3*86400000);assert.equal(db.prepare('SELECT id FROM wan_uploads WHERE job_id=?').get(canceled.id),undefined);assert(db.prepare('SELECT id FROM wan_uploads WHERE job_id=?').get(running.id));assert(buckets.includes(config.bucket));assert(deletions.every(k=>/^wan-inputs\/[0-9a-f-]{36}(?:\.[a-z0-9]{1,5})?$/.test(k)));assert((await readFile(path.join(mediaDir,a.key))).equals(fixture));
});
test('Wan library references validate storage/type/duration and yield honest input-plus-output estimates',async()=>{
 saveCloudStorageConfig(config);const a=await source('image-ref'),m=providerModels[0];validateExternal(m,{first_frame:'asset:'+a.id,prompt:'Animate'});put('assets',{...a,id:'video-ref',mime:'video/mp4',duration:5});validateExternal(m,{reference_videos:['asset:video-ref'],duration:5});assert.equal(externalEstimate(m,{reference_videos:['asset:video-ref'],duration:5,resolution:'720p'},1).total,.55);assert.throws(()=>validateExternal(m,{reference_videos:['asset:video-ref'],duration:30}),/30 seconds/);setSecret('wan-storage-current','');assert.throws(()=>validateExternal(m,{first_frame:'asset:'+a.id}),/Configure private Google Cloud Storage/);saveCloudStorageConfig(config);
});

test('a retry racing cleanup gets a fresh cloud object instead of a deleted signed reference',async()=>{
 saveCloudStorageConfig(config);const a=await source('retry-race'),j=job();await host.publish(a,j.id);const old=db.prepare('SELECT * FROM wan_uploads WHERE job_id=?').get(j.id) as any;put('jobs',{...j,status:'failed',updatedAt:new Date(Date.now()-7200000).toISOString()});let retried:Promise<string>|undefined;
 beforeDelete=key=>{if(key===old.object_key){put('jobs',{...j,status:'queued'});retried=host.publish(a,j.id);}};
 try{await host.cleanup();assert(retried);await retried;const next=db.prepare('SELECT * FROM wan_uploads WHERE job_id=?').get(j.id) as any;assert.notEqual(next.object_key,old.object_key);assert(objects.has(next.object_key));assert.equal(next.uploaded,1);}finally{beforeDelete=undefined;}
});

test('Google XML transport sends unmodified bytes without AWS chunk trailers and signs a 24-hour private GET',async()=>{
 const a=await source('google-transport'),api=createHostingClient({...config,provider:'gcs'});let requests=0;
 (api.config as any).requestHandler={async handle(r:any){requests++;assert.equal(r.hostname,'storage.googleapis.com');assert(r.path.includes(config.bucket));assert.notEqual(r.headers['content-encoding'],'aws-chunked');assert.equal(r.headers['x-amz-sdk-checksum-algorithm'],undefined);assert.equal(Number(r.headers['content-length']),fixture.length);const chunks=[];for await(const c of r.body)chunks.push(c);assert(Buffer.concat(chunks).equals(fixture));return {response:{statusCode:200,headers:{etag:'fixture-etag'},body:Readable.from([])}};}};
 try{await api.send(new PutObjectCommand({Bucket:config.bucket,Key:'wan-inputs/transport.png',Body:createReadStream(path.join(mediaDir,a.key)),ContentLength:fixture.length,ContentType:a.mime}));const url=new URL(await getSignedUrl(api,new GetObjectCommand({Bucket:config.bucket,Key:'wan-inputs/transport.png'}),{expiresIn:86400}));assert.equal(url.origin,'https://storage.googleapis.com');assert.equal(url.searchParams.get('X-Amz-Expires'),'86400');assert.equal(url.searchParams.get('X-Amz-Algorithm'),'AWS4-HMAC-SHA256');assert.equal(requests,1);}finally{api.destroy();}
});
test('legacy R2 credentials only clean archived copies; they never configure new Google uploads',async()=>{
 setSecret('wan-storage-current','');const legacy={accountId:'a'.repeat(32),bucket:'legacy-private-bucket',accessKeyId:'legacy-access',secretAccessKey:'legacy-secret'};setSecret('r2-current',JSON.stringify(legacy));assert.equal(wanStorageConfigured(),false);
 const profile=createHash('sha256').update(JSON.stringify(legacy)).digest('hex'),id=crypto.randomUUID(),key='wan-inputs/'+id+'.png',j=job();put('jobs',{...j,status:'completed',updatedAt:new Date(Date.now()-7200000).toISOString()});setSecret('r2-profile-'+profile,JSON.stringify(legacy));db.prepare('INSERT INTO wan_uploads VALUES(?,?,?,?,?,?,?)').run(id,j.id,'legacy',profile,key,1,Date.now());objects.set(key,{body:fixture,metadata:{}});await host.cleanup();assert.equal(db.prepare('SELECT id FROM wan_uploads WHERE id=?').get(id),undefined);assert(buckets.includes(legacy.bucket));const api=createHostingClient(legacy);try{const url=new URL(await getSignedUrl(api,new GetObjectCommand({Bucket:legacy.bucket,Key:key}),{expiresIn:60}));assert.equal(url.hostname,legacy.accountId+'.r2.cloudflarestorage.com');}finally{api.destroy();}saveCloudStorageConfig(config);
});
