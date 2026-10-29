import { assEmScale } from "./font-metrics.ts";
import { hookPositionFraction } from "../shared/hook-layout.ts";
import { effectiveHookFont } from "../shared/hook-fonts.ts";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import type { Asset, Composition, Hook, RenderRow } from "../shared/types.ts";
import { spanWindow } from "../shared/project.ts";
import { outputResolution } from "../shared/ratios.ts";
import { workDir } from "./store.ts";
import { downloadAsset } from "./storage.ts";
export const ffmpeg = process.env.FFMPEG_PATH || ffmpegStatic!;
export const ffprobe = process.env.FFPROBE_PATH || ffprobeStatic.path;
export async function run(
  binary: string,
  args: string[],
  cwd?: string,
  onProgress?: (seconds: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, windowsHide: true, signal });
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      for (const match of chunk.toString().matchAll(/out_time_us=(\d+)/g))
        onProgress?.(Number(match[1]) / 1000000);
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + chunk).slice(-6000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(errors || `Media process exited with code ${code}`)),
    );
  });
}
export async function probe(file: string) {
  const result = JSON.parse(
    await run(ffprobe, [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_format",
      "-show_streams",
      "-show_entries",
      "format=duration:stream=codec_type,width,height:stream_disposition=attached_pic",
      "-probesize",
      "5000000",
      "-analyzeduration",
      "5000000",
      "-threads",
      "1",
      "-of",
      "json",
      file,
    ], undefined, undefined, AbortSignal.timeout(20000)),
  );
  const video = result.streams.find((s: any) => s.codec_type === "video" && !s.disposition?.attached_pic);
  return {
    duration: Number(result.format.duration) || 0,
    width: video?.width,
    height: video?.height,
    hasVideo: !!video,
    hasAudio: result.streams.some((s: any) => s.codec_type === "audio"),
  };
}
export function wrapText(text: string, columns = 35): string {
  return text
    .split("\n")
    .map((paragraph) => {
      const lines: string[] = [];
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        if ((line + " " + word).trim().length > columns && line) {
          lines.push(line);
          line = word;
        } else line = (line + " " + word).trim();
      }
      lines.push(line);
      return lines.join("\n");
    })
    .join("\n");
}
function assTime(seconds: number) {
  const cs = Math.round(seconds * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
export function subtitleASS(
  text: string,
  c: Composition,
  window: [number, number],
  w = 1080,
  h = 1920,
) {
  const y = h * hookPositionFraction(c.position);
  const face = c.fontId ? effectiveHookFont(c.fontId, text) : undefined;
  const pixelSize = c.fontSize * w / 1080;
  const font = Number((pixelSize * (c.textLayoutVersion === 2 && face ? assEmScale(face.file) : 1)).toFixed(3));
  const escaped = wrapText(text, Math.max(16, Math.floor(w / (pixelSize * 0.58))))
    .replace(/\\/g, "\\\\")
    .replace(/[{}]/g, "")
    .replace(/\n/g, "\\N");
  const snapchat = c.style === "Snapchat";
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${w}\nPlayResY: ${h}\nWrapStyle: 2\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Hook,${face?.family ?? "DejaVu Sans"},${font},&H00FFFFFF,&H00FFFFFF,${snapchat ? "&H80000000" : "&H00101010"},&H80000000,${face ? (face.weight >= 700 ? -1 : 0) : (snapchat ? 0 : -1)},0,0,0,100,100,0,0,${snapchat ? 3 : 1},${snapchat ? 10 : 2},0,5,50,50,50,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,${assTime(window[0])},${assTime(window[1])},Hook,,0,0,0,,{\\an5\\pos(${w / 2},${Math.round(y)})}${escaped}\n`;
}
export interface RenderSpec {
  row: RenderRow;
  hook?: Hook;
  composition: Composition;
  assets: Record<string, Asset>;
}
export async function renderVideo(
  spec: RenderSpec,
  destination: string,
  onProgress: (progress: number) => void = () => {},
  signal?: AbortSignal,
  resolution = outputResolution(spec.composition.aspectRatio),
) {
  const dir = await mkdtemp(path.join(workDir, "render-"));
  const [w, h] = resolution;
  const { row, hook, composition: c, assets } = spec;
  try {
    const local = new Map<string, string>();
    async function source(id: string) {
      if (local.has(id)) return local.get(id)!;
      const asset = assets[id];
      if (!asset) throw new Error("A selected media asset is missing");
      const file = path.join(
        dir,
        `${local.size}${path.extname(asset.key) || ".media"}`,
      );
      await downloadAsset(asset, file);
      local.set(id, file);
      return file;
    }
    const reaction = row.reactionId ? assets[row.reactionId] : undefined,
      demo = row.demoId ? assets[row.demoId] : undefined;
    const reactionTime = reaction
      ? c.style === "Text Wall"
        ? c.textWallDuration
        : reaction.duration || 8
      : !demo && hook?.imageId
        ? c.textWallDuration
        : 0;
    const demoTime = demo?.duration || 0,
      total = reactionTime + demoTime;
    if (total <= 0)
      throw new Error(
        "Select a reaction clip, product demo, or image hook to render",
      );
    const filters = (fit: string) =>
      fit === "contain"
        ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`
        : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p`;
    const segments: string[] = [];
    async function normalize(
      asset: Asset | undefined,
      length: number,
      index: number,
    ) {
      const args = ["-y", "-v", "error"];
      let audioIndex = 0;
      if (asset) {
        const file = await source(asset.id);
        if (asset.mime.startsWith("image/")) args.push("-loop", "1");
        args.push("-i", file);
        const info = await probe(file);
        if (!info.hasAudio) {
          args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
          audioIndex = 1;
        }
      } else {
        args.push(
          "-f",
          "lavfi",
          "-i",
          `color=c=0x222324:s=${w}x${h}:r=30`,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=r=48000:cl=stereo",
        );
        audioIndex = 1;
      }
      const name = `segment-${index}.mp4`;
      segments.push(name);
      args.push(
        "-map",
        "0:v:0",
        "-map",
        `${audioIndex}:a:0`,
        "-vf",
        `${filters(c.fit)},tpad=stop_mode=clone:stop_duration=${length}`,
        "-af",
        `volume=${(index === 0 ? c.reactionVolume : c.demoVolume) ?? c.sourceVolume},apad`,
        "-t",
        String(length),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-threads",
        "2",
        name,
      );
      await run(ffmpeg, args, dir, undefined, signal);
    }
    if (reactionTime)
      await normalize(
        c.style === "Green screen" && c.backgroundId
          ? assets[c.backgroundId]
          : reaction,
        reactionTime,
        0,
      );
    onProgress(15);
    if (demoTime) await normalize(demo, demoTime, 1);
    onProgress(30);
    await writeFile(
      path.join(dir, "concat.txt"),
      segments.map((s) => `file '${s}'`).join("\n"),
    );
    await run(
      ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "concat.txt",
        "-c",
        "copy",
        "base.mp4",
      ],
      dir,
      undefined,
      signal,
    );
    const hookRange = spanWindow(
        row.hookSpan || c.hookSpan,
        reactionTime,
        demoTime,
      ),
      musicRange = spanWindow(
        row.musicSpan || c.musicSpan,
        reactionTime,
        demoTime,
      );
    const args = ["-y", "-v", "error", "-i", "base.mp4"];
    let input = 1;
    const graph: string[] = [];
    let video = "0:v",
      audio = "source";
    const active = hookRange[1] > hookRange[0];
    if (hook && active && c.style === "IMG" && hook.imageId) {
      const img = await source(hook.imageId);
      const i = input++;
      args.push("-loop", "1", "-i", img);
      graph.push(`[${i}:v]scale=${Math.round(w * 0.8)}:-2[hookimage]`);
      const y =
        c.position === "top"
          ? "H*0.1"
          : c.position === "bottom"
            ? "H*0.85-h"
            : c.position === "upper-middle" ? "H*0.32-h/2" : c.position === "lower-middle" ? "H*0.63-h/2" : "(H-h)/2";
      graph.push(
        `[${video}][hookimage]overlay=(W-w)/2:${y}:enable='between(t,${hookRange[0]},${hookRange[1]})'[imgout]`,
      );
      video = "imgout";
    }
    if (hook && active && c.style === "Green screen" && c.presenterId) {
      const i = input++;
      args.push("-stream_loop", "-1", "-i", await source(c.presenterId));
      graph.push(
        `[${i}:v]scale=${Math.round((w * c.presenterScale) / 2) * 2}:-2,format=rgba,colorkey=0x${c.keyColor.slice(1)}:${c.keySimilarity}:${c.keyBlend}[presenter]`,
      );
      graph.push(
        `[${video}][presenter]overlay=(W-w)/2:H-h:enable='between(t,${hookRange[0]},${hookRange[1]})'[keyed]`,
      );
      video = "keyed";
    }
    if (hook?.text && active && c.style !== "IMG") {
      await writeFile(
        path.join(dir, "hook.ass"),
        subtitleASS(hook.text, {...c, fontId: hook.fontId ?? c.fontId}, hookRange, w, h),
      );
      const selectedFont = hook.fontId ?? c.fontId;
      if (selectedFont) {
        const face = effectiveHookFont(selectedFont, hook.text);
        await mkdir(path.join(dir, "fonts"));
        await copyFile(fileURLToPath(new URL(`../public/fonts/${face.file}`, import.meta.url)), path.join(dir, "fonts", face.file));
      }
      graph.push(`[${video}]subtitles=hook.ass${selectedFont ? ":fontsdir=fonts" : ""}[textout]`);
      video = "textout";
    }
    graph.push(`[0:a]anull[source]`);
    if (row.musicId && musicRange[1] > musicRange[0]) {
      const i = input++;
      args.push("-stream_loop", "-1", "-i", await source(row.musicId));
      graph.push(
        `[${i}:a]atrim=duration=${musicRange[1] - musicRange[0]},asetpts=PTS-STARTPTS,volume=${c.musicVolume},adelay=${Math.round(musicRange[0] * 1000)}:all=1[music]`,
      );
      graph.push(
        "[source][music]amix=inputs=2:duration=first:normalize=0[mixed]",
      );
      audio = "mixed";
    }
    if (video === "0:v") {
      graph.push("[0:v]null[videoout]");
      video = "videoout";
    }
    args.push(
      "-filter_complex",
      graph.join(";"),
      "-map",
      `[${video}]`,
      "-map",
      `[${audio}]`,
      "-t",
      String(total),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-threads",
      "2",
      "-progress",
      "pipe:1",
      "-nostats",
      "final.mp4",
    );
    await run(
      ffmpeg,
      args,
      dir,
      (seconds) => onProgress(Math.min(95, 30 + (seconds / total) * 65)),
      signal,
    );
    await copyFile(path.join(dir, "final.mp4"), destination);
    return {
      duration: total,
      width: w,
      height: h,
      reactionDuration: reactionTime,
      demoDuration: demoTime,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
