import { rename, stat, unlink } from "node:fs/promises";
import { ffmpeg, probe, run } from "./render.ts";
export async function limitReactionDuration(
  file: string,
  limit: number,
  signal?: AbortSignal,
) {
  if (!(limit > 0 && limit <= 5))
    throw new Error("Reaction duration must be between one and five seconds");
  if ((await probe(file)).duration <= limit)
    return { size: (await stat(file)).size };
  const output = file + ".trimmed.mp4";
  try {
    await run(
      ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-i",
        file,
        "-t",
        String(limit),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
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
        output,
      ],
      undefined,
      undefined,
      signal,
    );
    if ((await probe(output)).duration > limit + 0.001)
      throw new Error("Reaction output exceeded the requested duration");
    await rename(output, file);
    return { size: (await stat(file)).size };
  } finally {
    await unlink(output).catch(() => {});
  }
}
