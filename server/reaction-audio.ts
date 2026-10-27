import { rename, stat, unlink } from "node:fs/promises";
import { ffmpeg, probe, run } from "./render.ts";
export async function removeReactionAudio(file: string, signal?: AbortSignal) {
  if (!(await probe(file)).hasAudio) return { size: (await stat(file)).size };
  const output = file + ".silent.mp4";
  try {
    await run(
      ffmpeg,
      [
        "-y",
        "-v",
        "error",
        "-i",
        file,
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-an",
        "-movflags",
        "+faststart",
        output,
      ],
      undefined,
      undefined,
      signal,
    );
    if ((await probe(output)).hasAudio)
      throw new Error("Silent reaction still contains audio");
    await rename(output, file);
    return { size: (await stat(file)).size };
  } finally {
    await unlink(output).catch(() => {});
  }
}
