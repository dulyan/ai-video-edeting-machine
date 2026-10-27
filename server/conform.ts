import { rename, stat, unlink } from "node:fs/promises";
import { ffmpeg, probe, run } from "./render.ts";
import { ratioValue } from "../shared/ratios.ts";
export async function conformMedia(
  file: string,
  kind: "image" | "video",
  ratio: string,
  signal?: AbortSignal,
) {
  const meta = await probe(file);
  if (!meta.width || !meta.height)
    throw new Error("Generated media has no valid dimensions");
  const target = ratioValue(ratio),
    current = meta.width / meta.height;
  if (Math.abs(target - current) < 0.002) return undefined;
  const width =
    Math.floor((current > target ? meta.height * target : meta.width) / 2) * 2;
  const height =
    Math.floor((current > target ? meta.height : meta.width / target) / 2) * 2;
  const output = file + (kind === "image" ? ".ratio.png" : ".ratio.mp4");
  try {
    await run(
      ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-i",
        file,
        "-vf",
        `crop=${width}:${height},setsar=1`,
        "-threads",
        "2",
        ...(kind === "image"
          ? ["-frames:v", "1"]
          : [
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "20",
              "-c:a",
              "aac",
              "-movflags",
              "+faststart",
            ]),
        output,
      ],
      undefined,
      undefined,
      signal,
    );
    await rename(output, file);
    return {
      mime: kind === "image" ? "image/png" : "video/mp4",
      size: (await stat(file)).size,
    };
  } finally {
    await unlink(output).catch(() => {});
  }
}
