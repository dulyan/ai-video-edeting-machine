import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,copyFile,stat,writeFile,readFile,access} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export async function backupLocal(p) {
 const db=new DatabaseSync(path.join(p.data,'workspace.sqlite'),{readOnly:true});
 let target;
 try {
  const active=db.prepare("SELECT body FROM records WHERE kind='jobs'").all().some(row=>['queued','running'].includes(JSON.parse(row.body).status));
  if(active)throw new Error('Wait for active jobs to finish or stop the backend before backing up.');
  target=path.join(p.home,'backups',new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(path.join(target,'workspace','media'),{recursive:true});
  await backup(db,path.join(target,'workspace','workspace.sqlite'));
 }finally{db.close();}
 const fontFiles=[];
 for(const name of ['proxima-nova-semibold.otf','helvetica-roman.otf']){const source=path.join(p.data,'fonts',name);if(await access(source).then(()=>true,()=>false)){const relative='workspace/fonts/'+name;await mkdir(path.join(target,'workspace','fonts'),{recursive:true});await copyFile(source,path.join(target,relative));fontFiles.push(relative);}}
 const snapshot=new DatabaseSync(path.join(target,'workspace','workspace.sqlite'),{readOnly:true});
 const manifest={createdAt:new Date().toISOString(),files:[]},demoFiles=[];
 try{
  if(snapshot.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('Backup integrity check failed.');
  for(const {body} of snapshot.prepare("SELECT body FROM records WHERE kind='assets'").all()){
   const asset=JSON.parse(body),relative=path.join('workspace','media',asset.key),destination=path.resolve(target,relative);
   if(!destination.startsWith(path.resolve(target,'workspace','media')+path.sep))throw new Error('Unsafe asset path in backup.');
   await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(p.data,'media',asset.key),destination);
  }
  for(const {body} of snapshot.prepare("SELECT body FROM records WHERE kind='jobs'").all()){
   const job=JSON.parse(body);if(job.status!=='completed'||job.kind!=='demo'||job.input?.phase!=='track')continue;
   if(!/^[\w-]{1,200}$/.test(job.id))throw new Error('Unsafe demo job path in backup.');
   const directory=path.join(p.data,'work','demo',job.id),tracks=JSON.parse(await readFile(path.join(directory,'tracks.json'),'utf8')),names=['tracks.json'];
   for(const prefix of ['source','candidate']){const frames=tracks[prefix]?.frames;if(!Array.isArray(frames)||frames.length>900)throw new Error('Invalid demo tracking sidecars.');for(let i=0;i<frames.length;i++)for(const kind of ['hand','hold'])names.push(`${prefix}-${kind}-${String(i).padStart(5,'0')}.png`);}
   for(const name of names){const relative=`workspace/work/demo/${job.id}/${name}`;await mkdir(path.dirname(path.join(target,relative)),{recursive:true});await copyFile(path.join(directory,name),path.join(target,relative));demoFiles.push(relative);}
  }
 }finally{snapshot.close();}
 for(const [source,name] of [[p.config,'config.env'],[p.profile,'profile.json']])await copyFile(source,path.join(target,name));
 // Originals and completed correction sidecars are durable; preview caches rebuild.
 const check=new DatabaseSync(path.join(target,'workspace','workspace.sqlite'),{readOnly:true});
 const names=['workspace/workspace.sqlite','config.env','profile.json',...fontFiles,...demoFiles,...check.prepare("SELECT body FROM records WHERE kind='assets'").all().map(({body})=>'workspace/media/'+JSON.parse(body).key)];check.close();
 for(const name of names){const file=path.join(target,name),hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);manifest.files.push({name,size:(await stat(file)).size,sha256:hash.digest('hex')});}
 await writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 return target;
}
