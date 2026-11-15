import {useEffect,useState} from 'react';
import {Button,Field} from './components.tsx';
import {request} from './api.ts';
import type {Workspace} from './workspace.tsx';
export default function CloudStorageSettings({w}:{w:Workspace}){
 const [bucket,setBucket]=useState(''),[accessKeyId,setAccess]=useState(''),[secretAccessKey,setSecret]=useState(''),[status,setStatus]=useState<{configured:boolean;pendingCopies:number}>();
 const refresh=async()=>{const d=await request('/wan-storage/settings');setStatus(d);setBucket(d.bucket);};
 useEffect(()=>{if(w.connected)void refresh().catch(()=>{});},[w.connected]);
 return <section className="card settings-card"><h3>Google Cloud Storage for Wan references</h3><p>When you generate, the app copies selected originals unchanged to a private Google bucket and sends Wan API a 24-hour download link. Local originals stay in your library.</p>
 <details><summary>One-time Google setup</summary><ol>
 <li>Create a Google Cloud project with an active billing account. Create a dedicated <strong>Standard</strong> bucket in <code>us-central1</code>, <code>us-east1</code> or <code>us-west1</code> for free-tier eligibility.</li>
 <li>Use uniform bucket-level access and enforce public access prevention. For this temporary-only bucket, turn off Soft Delete and Object Versioning so deleted copies do not accumulate retention charges. Keep Autoclass and retention locks off.</li>
 <li>Create a service account and give it <strong>Storage Object Admin</strong> on this bucket only. In Cloud Storage Settings → Interoperability, create an HMAC key for that service account.</li>
 <li>Enter the bucket name and HMAC access ID/secret below. These are Cloud Storage interoperability credentials, not a Gemini API key or a service-account JSON file. Save, then test the connection.</li>
 <li>Add a lifecycle rule deleting objects with prefix <code>wan-inputs/</code> after seven days as an offline cleanup fallback.</li>
 </ol><a href="https://docs.cloud.google.com/storage/docs/authentication/managing-hmackeys" target="_blank" rel="noreferrer">Google HMAC setup instructions</a></details>
 <a href="https://console.cloud.google.com/storage/browser" target="_blank" rel="noreferrer">Open Google Cloud Storage</a>
 <Field label="Google Cloud bucket name"><input autoComplete="off" value={bucket} onChange={e=>setBucket(e.target.value)}/></Field>
 <Field label="Google HMAC access ID"><input type="password" autoComplete="off" spellCheck={false} value={accessKeyId} placeholder={status?.configured?'Saved; leave blank to keep':''} onChange={e=>setAccess(e.target.value)}/></Field>
 <Field label="Google HMAC secret"><input type="password" autoComplete="off" spellCheck={false} value={secretAccessKey} placeholder={status?.configured?'Saved; leave blank to keep':''} onChange={e=>setSecret(e.target.value)}/></Field>
 <p>Credentials are encrypted, never returned by the API, and retained across restarts and app updates.</p>
 <Button disabled={!w.connected||!!w.busy||!bucket||(!status?.configured&&(!accessKeyId||!secretAccessKey))} onClick={()=>void w.act('Saving Google storage settings',async()=>{await request('/wan-storage/settings',{method:'PUT',body:JSON.stringify({bucket:bucket.trim(),...(accessKeyId.trim()?{accessKeyId:accessKeyId.trim()}:{}),...(secretAccessKey.trim()?{secretAccessKey:secretAccessKey.trim()}:{})})});setAccess('');setSecret('');await refresh();w.notify('Google Cloud Storage settings saved securely. Test the connection before generating.');})}>Save Google storage settings</Button>
 <Button disabled={!w.connected||!status?.configured||!!w.busy} onClick={()=>void w.act('Testing Google storage',async()=>{await request('/wan-storage/test',{method:'POST'});await refresh();w.notify('Google upload, signed download, byte-range read and deletion passed.');})}>Test Google storage connection</Button>
 <p>{status?.configured?'Google storage settings saved.':'Google storage is not configured.'} Temporary cloud copies pending cleanup: {status?.pendingCopies??0}.</p>
 <p>Cleanup runs while the app is open or running in the background. Completed-job copies expire after one hour; canceled/uncertain tasks are retained up to 48 hours. Active jobs keep their copies. Links expire after 24 hours.</p>
 <p>Google has a limited free tier, not a hard spending cap. Billing is required; storage, operations and outbound transfer can be charged. Free transfer excludes China and Australia, and Wan's download location is unverified. Budget alerts do not stop charges.</p>
 <a href="https://cloud.google.com/storage/pricing#cloud-storage-always-free" target="_blank" rel="noreferrer">Google pricing and free-tier limits</a>
 <Button disabled={!w.connected||!!w.busy} onClick={()=>void w.act('Cleaning expired references',async()=>{const r=await request('/wan-storage/cleanup',{method:'POST'});await refresh();w.notify(`${r.deleted} expired copies removed; ${r.failed} pending retry.`);})}>Clean expired cloud copies</Button>
 </section>;
}
