import {useEffect,useState} from 'react';
import {Button,Field} from './components.tsx';
import {request} from './api.ts';
import type {Workspace} from './workspace.tsx';
export default function R2Settings({w}:{w:Workspace}){
 const [accountId,setAccount]=useState(''),[bucket,setBucket]=useState(''),[accessKeyId,setAccess]=useState(''),[secretAccessKey,setSecret]=useState(''),[status,setStatus]=useState<{configured:boolean;pendingCopies:number}>();
 const refresh=async()=>{const d=await request('/r2/settings');setStatus(d);setAccount(d.accountId);setBucket(d.bucket);};
 useEffect(()=>{if(w.connected)void refresh().catch(()=>{});},[w.connected]);
 return <section className="card settings-card"><h3>Private R2 storage for Wan references</h3><p>Choose/upload originals in VidGen. Only when you generate, the app copies the original bytes to a private R2 bucket and sends Wan API a 24-hour download link. Images and videos are never resized or re-encoded for upload.</p>
 <p>Create a Standard R2 bucket with public access disabled, then a bucket-scoped <strong>Object Read &amp; Write</strong> token. Enter its S3 Access Key ID and Secret Access Key here, not your Cloudflare global API key. Credentials are encrypted and are never returned by the app.</p>
 <a href="https://dash.cloudflare.com/?to=/:account/r2" target="_blank" rel="noreferrer">Open Cloudflare R2</a>
 <Field label="R2 Account ID"><input value={accountId} autoComplete="off" onChange={e=>setAccount(e.target.value)}/></Field>
 <Field label="R2 private bucket name"><input value={bucket} autoComplete="off" onChange={e=>setBucket(e.target.value)}/></Field>
 <Field label="R2 Access Key ID"><input type="password" autoComplete="off" spellCheck={false} value={accessKeyId} placeholder={status?.configured?'Saved; leave blank to keep':''} onChange={e=>setAccess(e.target.value)}/></Field>
 <Field label="R2 Secret Access Key"><input type="password" autoComplete="off" spellCheck={false} value={secretAccessKey} placeholder={status?.configured?'Saved; leave blank to keep':''} onChange={e=>setSecret(e.target.value)}/></Field>
 <Button disabled={!w.connected||!!w.busy||!accountId||!bucket||(!status?.configured&&(!accessKeyId||!secretAccessKey))} onClick={()=>void w.act('Saving R2 settings',async()=>{await request('/r2/settings',{method:'PUT',body:JSON.stringify({accountId:accountId.trim(),bucket:bucket.trim(),...(accessKeyId.trim()?{accessKeyId:accessKeyId.trim()}:{}),...(secretAccessKey.trim()?{secretAccessKey:secretAccessKey.trim()}:{})})});setAccess('');setSecret('');await refresh();w.notify('R2 settings saved securely. Use Test R2 to check upload and range download.');})}>Save R2 settings</Button>
 <Button disabled={!w.connected||!status?.configured||!!w.busy} onClick={()=>void w.act('Testing R2',async()=>{await request('/r2/test',{method:'POST'});await refresh();w.notify('R2 upload, signed download, byte-range read and deletion passed.');})}>Test R2 connection</Button>
 <p>{status?.configured?'R2 settings saved.':'R2 is not configured.'} Temporary cloud copies: {status?.pendingCopies??0}. Local originals always stay in your library.</p>
 <p>While the app runs, completed-job copies are removed after one hour; canceled/uncertain tasks are retained up to 48 hours. Active jobs keep their copies. Add a 7-day R2 lifecycle rule for <code>wan-inputs/</code> as a fallback when this PC is off. Storage operations can incur R2 charges.</p>
 <Button disabled={!w.connected||!!w.busy} onClick={()=>void w.act('Cleaning expired Wan references',async()=>{const r=await request('/r2/cleanup',{method:'POST'});await refresh();w.notify(`${r.deleted} expired copies removed; ${r.failed} pending retry.`);})}>Clean expired cloud copies</Button>
 </section>;
}
