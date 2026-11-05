import {existsSync} from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
export function softwareBrowserArgs(base,home){
 const url=new URL(base);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw new Error('The local browser requires a loopback app address.');
 return ['--user-data-dir='+path.join(home,'browser-software'),'--disable-gpu','--disable-gpu-compositing','--disable-gpu-rasterization','--disable-accelerated-video-decode','--disable-accelerated-2d-canvas','--disable-webgl','--no-first-run','--no-default-browser-check','--disable-background-mode','--disk-cache-size=33554432','--media-cache-size=16777216','--app='+base];
}
export async function openLocalBrowser(base,home){
 let child;
 if(process.platform==='win32'){
  const candidates=[
   path.join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
   path.join(process.env.LOCALAPPDATA||'','Google','Chrome','Application','chrome.exe'),
   path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
   path.join(process.env.PROGRAMFILES||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe'),
  ];
  const executable=candidates.find(file=>existsSync(file));
  if(!executable)throw new Error('Install Chrome or Edge to open the app with software graphics. The backend is running at '+base);
  child=spawn(executable,softwareBrowserArgs(base,home),{windowsHide:true,detached:true,stdio:'ignore'});
 }else child=spawn(process.platform==='darwin'?'open':'xdg-open',[base],{detached:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
}
