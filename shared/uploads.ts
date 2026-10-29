import type { AssetKind } from "./types.ts";
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MUSIC_ACCEPT = ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a";
export interface UploadProgress {
  active: boolean;
  total: number;
  completed: number;
  saved: number;
  failed: number;
  currentFile: string;
  stopped: boolean;
  errors: {name: string; message: string}[];
}
type UploadFile = { name: string; size: number };
export function uploadProblem(file: UploadFile, kind: AssetKind): string | undefined {
  if (!file.size) return "The file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "The file exceeds 100 MB.";
  if (kind === "music" && !/\.(mp3|wav|m4a)$/i.test(file.name)) return "Choose an MP3, WAV, or M4A audio file.";
}
export async function runUploadBatch<F extends UploadFile, A>(files: F[], kind: AssetKind, uploadOne: (file: F) => Promise<A>, options: {
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
  onSaved?: (asset: A) => void;
  yieldBetween?: () => Promise<void>;
}) {
  const assets: A[] = [], progress: UploadProgress = {active:true,total:files.length,completed:0,saved:0,failed:0,currentFile:"",stopped:false,errors:[]};
  const publish = () => options.onProgress({...progress,errors:[...progress.errors]});
  publish();
  for (const file of files) {
    if (options.signal.aborted) { progress.stopped = true; break; }
    progress.currentFile = file.name; publish();
    try {
      const problem = uploadProblem(file,kind);
      if (problem) throw new Error(problem);
      const asset = await uploadOne(file);
      assets.push(asset); progress.saved++;
      options.onSaved?.(asset);
    } catch (error) {
      if (options.signal.aborted) { progress.stopped=true; break; }
      const e = error as Error & {status?:number};
      progress.failed++; progress.errors.push({name:file.name,message:e.message || "Upload failed."});
      // Stop on connection/auth/storage/rate-limit errors instead of hammering
      // an unavailable backend once for every remaining file. Never auto-retry
      // an ambiguous POST; it may already have saved the file.
      if ([401,403,404,408,429].includes(e.status || 0) || (e.status || 0)>=500 || ["TypeError","TimeoutError"].includes(e.name)) progress.stopped=true;
    }
    progress.completed++; publish();
    if (progress.stopped) break;
    if (options.yieldBetween) await options.yieldBetween();
    else await new Promise<void>(resolve=>setTimeout(resolve,75));
  }
  progress.active=false; progress.currentFile="";
  if (options.signal.aborted) progress.stopped=true;
  publish();
  return assets;
}
