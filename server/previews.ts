import { createHash } from "node:crypto";
import { mkdir, stat, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { Asset } from "../shared/types.ts";
import { mediaDir, workDir } from "./store.ts";
import { downloadAsset } from "./storage.ts";
import { ffmpeg, run } from "./render.ts";

const inFlight = new Map<string, Promise<string>>();
let chain: Promise<unknown> = Promise.resolve();
// A small H.264 proxy avoids decoding arbitrary original codecs/4K media on the
// operator's GPU. Originals and final renders remain unchanged.
export async function videoPreview(asset: Asset, thumbnail = false): Promise<string> {
  const audio = asset.kind === "music" && asset.mime.startsWith("audio/");
  if ((!asset.mime.startsWith("video/") && !audio) || (audio && thumbnail)) throw new Error("Choose valid media to preview");
  const extension = audio ? ".mp3" : thumbnail ? ".jpg" : ".mp4";
  const name = createHash("sha256").update(JSON.stringify([asset.id, asset.key, asset.size, asset.createdAt])).digest("hex") + extension;
  const key = "_previews/" + name, destination = path.join(mediaDir, key);
  if (await stat(destination).then(() => true, () => false)) return key;
  const existing = inFlight.get(name);
  if (existing) return existing;
  if (inFlight.size >= 32) throw new Error("Preview service is busy. Try again shortly.");
  const task = chain.catch(() => {}).then(async () => {
    const source = path.join(workDir, `preview-${crypto.randomUUID()}.source`);
    const temp = destination + ".tmp" + extension;
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await downloadAsset(asset, source);
      await run(ffmpeg, [
        "-y", "-v", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", source,
        ...(audio ? ["-t", "120", "-map", "0:a:0", "-vn", "-sn", "-dn", "-threads", "1", "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", "-ar", "44100"] : thumbnail ? ["-frames:v", "1", "-vf", "scale=240:240:force_original_aspect_ratio=decrease", "-threads", "1", "-filter_threads", "1", "-q:v", "5"] : [
        "-t", "120", "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale=480:480:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=24",
        "-filter_threads", "1", "-threads", "1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-ac", "2", "-ar", "44100", "-b:a", "96k", "-movflags", "+faststart"]), temp,
      ], undefined, undefined, AbortSignal.timeout(90000));
      await rename(temp, destination);
      return key;
    } finally {
      await unlink(source).catch(() => {});
      await unlink(temp).catch(() => {});
    }
  });
  chain = task;
  inFlight.set(name, task);
  try { return await task; }
  finally { inFlight.delete(name); }
}
