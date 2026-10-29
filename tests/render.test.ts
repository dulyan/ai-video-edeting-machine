import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { newProject } from "../shared/project.ts";
import type { Asset, Span } from "../shared/types.ts";
const testDir = await mkdtemp(path.join(os.tmpdir(), "avem-render-"));
process.env.DATA_DIR = testDir;
const { ffmpeg, run, probe, renderVideo, subtitleASS } =
  await import("../server/render.ts");
const { mediaDir } = await import("../server/store.ts");
const assets: Record<string, Asset> = {};
async function asset(
  id: string,
  kind: Asset["kind"],
  args: string[],
  duration: number,
  mime = "video/mp4",
) {
  const key = id + (kind === "music" ? ".mp3" : ".mp4"),
    file = path.join(mediaDir, key);
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    ...args,
    "-t",
    String(duration),
    file,
  ]);
  assets[id] = {
    id,
    key,
    kind,
    name: id,
    projectId: "test",
    mime,
    createdAt: new Date().toISOString(),
    size: (await stat(file)).size,
    duration,
  };
}
await asset(
  "reaction",
  "reaction",
  [
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=216x384:r=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ],
  1,
);
await asset(
  "demo",
  "demo",
  [
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=216x384:r=30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ],
  1,
);
await asset(
  "track",
  "music",
  [
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-c:a",
    "libmp3lame",
  ],
  1,
  "audio/mpeg",
);
async function rms(file: string, time: number) {
  const samples = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-v",
        "error",
        "-ss",
        String(time),
        "-i",
        file,
        "-t",
        "0.15",
        "-f",
        "f32le",
        "-ac",
        "1",
        "-ar",
        "8000",
        "pipe:1",
      ],
      { windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let error = "";
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => {
      error += c;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(error || "Audio decode failed")),
    );
  });
  let total = 0;
  for (let i = 0; i + 4 <= samples.length; i += 4)
    total += samples.readFloatLE(i) ** 2;
  return Math.sqrt(total / (samples.length / 4));
}
for (const span of ["whole", "reaction", "demo"] as Span[])
  test(`real FFmpeg render: music spans ${span}, hook timing independent`, async () => {
    const p = newProject(),
      file = path.join(testDir, `${span}.mp4`);
    p.composition.musicSpan = span;
    p.composition.hookSpan = "demo";
    p.composition.musicVolume = 0.7;
    p.composition.sourceVolume = 0;
    await renderVideo(
      {
        row: {
          id: "test",
          hookId: "h",
          reactionId: "reaction",
          demoId: "demo",
          musicId: "track",
        },
        hook: { id: "h", text: "Привет, новый мир!", createdAt: "" },
        composition: p.composition,
        assets,
      },
      file,
      () => {},
      undefined,
      [216, 384],
    );
    const info = await probe(file);
    assert(Math.abs(info.duration - 2) < 0.1);
    assert.equal(info.width, 216);
    assert(info.hasAudio);
    const first = await rms(file, 0.3),
      second = await rms(file, 1.3);
    assert.equal(first > 0.01, span !== "demo", `first segment RMS ${first}`);
    assert.equal(
      second > 0.01,
      span !== "reaction",
      `second segment RMS ${second}`,
    );
  });
test("subtitle windows support whole video, reaction, and demo boundaries", () => {
  const c = newProject().composition;
  assert(subtitleASS("Hello", c, [1, 2]).includes("0:00:01.00,0:00:02.00"));
  assert(subtitleASS("Hello", c, [0, 2]).includes("0:00:00.00,0:00:02.00"));
});
test("reaction and demo omission preserve valid single-segment renders", async () => {
  const p = newProject();
  const file = path.join(testDir, "demo-only.mp4");
  await renderVideo(
    {
      row: {
        id: "single",
        hookId: null,
        reactionId: null,
        demoId: "demo",
        musicId: null,
      },
      composition: p.composition,
      assets,
    },
    file,
    () => {},
    undefined,
    [216, 384],
  );
  assert(Math.abs((await probe(file)).duration - 1) < 0.1);
});
test("render rejects an empty visual timeline", async () => {
  await assert.rejects(
    () =>
      renderVideo(
        {
          row: {
            id: "empty",
            hookId: null,
            reactionId: null,
            demoId: null,
            musicId: null,
          },
          composition: newProject().composition,
          assets,
        },
        path.join(testDir, "empty.mp4"),
      ),
    /Select a reaction/,
  );
});
test("rendered video honors the selected square output ratio by default", async () => {
  const p = newProject();
  p.composition.aspectRatio = "1:1";
  const file = path.join(testDir, "square-output.mp4");
  await renderVideo(
    {
      row: {
        id: "square",
        hookId: null,
        reactionId: "reaction",
        demoId: null,
        musicId: null,
      },
      composition: p.composition,
      assets,
    },
    file,
  );
  const info = await probe(file);
  assert.equal(info.width, 1080);
  assert.equal(info.height, 1080);
});
async function pixels(file: string, time: number) {
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-v",
        "error",
        "-ss",
        String(time),
        "-i",
        file,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      { windowsHide: true },
    );
    const chunks: Buffer[] = [];
    let error = "";
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => {
      error += c;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(error)),
    );
  });
}
test("burned text appears only inside the selected demo segment", async () => {
  const file = path.join(testDir, "demo.mp4");
  const first = await pixels(file, 0.3),
    second = await pixels(file, 1.3);
  function whiteCount(buffer: Buffer) {
    let count = 0;
    for (let i = 0; i < buffer.length; i += 3)
      if (buffer[i] > 180 && buffer[i + 1] > 180 && buffer[i + 2] > 180)
        count++;
    return count;
  }
  assert.equal(whiteCount(first), 0);
  assert(
    whiteCount(second) > 10,
    "The demo frame must contain visible white subtitle pixels",
  );
});
for (const style of ["Snapchat", "Text Wall"] as const)
  test(`real ${style} composition renders`, async () => {
    const c = newProject().composition;
    c.style = style;
    c.textWallDuration = 1;
    const file = path.join(testDir, `${style.replace(" ", "-")}.mp4`);
    await renderVideo(
      {
        row: {
          id: style,
          hookId: "h",
          reactionId: "reaction",
          demoId: "demo",
          musicId: null,
        },
        hook: { id: "h", text: "A new perspective", createdAt: "" },
        composition: c,
        assets,
      },
      file,
      () => {},
      undefined,
      [216, 384],
    );
    assert.equal((await probe(file)).width, 216);
  });
test("image hook can span the demo while green-screen footage is keyed over it", async () => {
  const imageFile = path.join(mediaDir, "hook.png");
  await run(ffmpeg, [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=yellow:s=80x80",
    "-frames:v",
    "1",
    imageFile,
  ]);
  assets.image = {
    id: "image",
    key: "hook.png",
    kind: "hook-image",
    name: "Image hook",
    projectId: "test",
    mime: "image/png",
    createdAt: "",
    size: (await stat(imageFile)).size,
  };
  const p = newProject(),
    imageOutput = path.join(testDir, "image-style.mp4");
  p.composition.style = "IMG";
  p.composition.hookSpan = "demo";
  await renderVideo(
    {
      row: {
        id: "image",
        hookId: "h",
        reactionId: "reaction",
        demoId: "demo",
        musicId: null,
      },
      hook: { id: "h", text: "", imageId: "image", createdAt: "" },
      composition: p.composition,
      assets,
    },
    imageOutput,
    () => {},
    undefined,
    [216, 384],
  );
  const rgb = await pixels(imageOutput, 1.3),
    center = (Math.floor(384 / 2) * 216 + 108) * 3;
  assert(
    rgb[center] > 180 && rgb[center + 1] > 180 && rgb[center + 2] < 100,
    "Image hook must be visible on the demo",
  );
  await asset(
    "presenter",
    "presenter",
    [
      "-f",
      "lavfi",
      "-i",
      "color=c=0x00ff00:s=216x384:r=30",
      "-vf",
      "drawbox=x=70:y=240:w=80:h=140:color=red:t=fill",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ],
    1,
  );
  const greenOutput = path.join(testDir, "green-screen.mp4");
  p.composition.style = "Green screen";
  p.composition.presenterId = "presenter";
  p.composition.hookSpan = "demo";
  await renderVideo(
    {
      row: {
        id: "green",
        hookId: "h",
        reactionId: "reaction",
        demoId: "demo",
        musicId: null,
      },
      hook: { id: "h", text: "", createdAt: "" },
      composition: p.composition,
      assets,
    },
    greenOutput,
    () => {},
    undefined,
    [216, 384],
  );
  const keyed = await pixels(greenOutput, 1.3),
    background = (200 * 216 + 108) * 3,
    foreground = (340 * 216 + 108) * 3;
  assert(
    keyed[background + 2] > 180 && keyed[background + 1] < 100,
    "Green must be transparent over the blue demo",
  );
  assert(
    keyed[foreground] > 180 && keyed[foreground + 2] < 100,
    "Presenter foreground must remain visible",
  );
});

test("bundled fonts render Cyrillic text and per-hook overrides",async()=>{
 const p=newProject();p.composition.fontId="anton";
 assert.match(subtitleASS("\u041f\u0440\u0438\u0432\u0435\u0442",p.composition,[0,1]),/Style: Hook,Oswald,/);
 const legacy={...p.composition};delete legacy.fontId;
 assert.match(subtitleASS("Legacy",legacy,[0,1]),/Style: Hook,DejaVu Sans,/);
 for(const fontId of ["caveat","playfair-display"] as const){
   const output=path.join(testDir,fontId+".mp4");
   await renderVideo({row:{id:fontId,hookId:"h",reactionId:"reaction",demoId:null,musicId:null},hook:{id:"h",text:"\u041f\u0440\u0438\u0432\u0435\u0442",fontId,createdAt:""},composition:p.composition,assets},output,()=>{},undefined,[216,384]);
   assert((await stat(output)).size>1000);
 }
});

test("independent source volumes mute only their selected segment",async()=>{
 for(const id of ["reaction-tone","demo-tone"]){await asset(id,id.startsWith("reaction")?"reaction":"demo",["-f","lavfi","-i","color=c=black:s=216x384:r=30","-f","lavfi","-i","sine=frequency=440:sample_rate=48000","-c:v","libx264","-c:a","aac","-pix_fmt","yuv420p"],1);}
 for(const muted of ["reaction","demo"] as const){
  const p=newProject();p.composition.reactionVolume=muted==="reaction"?0:1;p.composition.demoVolume=muted==="demo"?0:1;
  const file=path.join(testDir,"mute-"+muted+".mp4");
  await renderVideo({row:{id:muted,hookId:null,reactionId:"reaction-tone",demoId:"demo-tone",musicId:null},composition:p.composition,assets},file,()=>{},undefined,[216,384]);
  const reaction=await rms(file,.4),demo=await rms(file,1.4);
  assert(muted==="reaction"?reaction<.001&&demo>.02:demo<.001&&reaction>.02);
 }
});
test("text size is scaled from CSS em units rather than shrunk by ASS metrics",async()=>{
 const {assEmScale}=await import("../server/font-metrics.ts");
 const p=newProject();p.composition.fontId="montserrat";p.composition.fontSize=100;
 const ass=subtitleASS("MMMM",p.composition,[0,1],216,384);
 const match=ass.match(/Style: Hook,Montserrat,([\d.]+),/)!;
 assert(Math.abs(Number(match[1])-20*assEmScale("montserrat.ttf"))<.001);
 const legacy={...p.composition};delete legacy.textLayoutVersion;
 assert.match(subtitleASS("MMMM",legacy,[0,1],216,384),/Style: Hook,Montserrat,20,/);
 for(const position of ["upper-middle","lower-middle"] as const){
   p.composition.position=position;const file=path.join(testDir,"position-"+position+".mp4");
   await renderVideo({row:{id:position,hookId:"h",reactionId:"reaction",demoId:null,musicId:null},hook:{id:"h",text:"MMMM",createdAt:""},composition:p.composition,assets},file,()=>{},undefined,[216,384]);
   assert((await stat(file)).size>1000);
 }
});

test("music seeking changes the audible source while preserving the music span",async()=>{
 await asset("offset-track","music",["-f","lavfi","-t","1","-i","anullsrc=r=48000:cl=mono","-f","lavfi","-t","1","-i","sine=frequency=440:sample_rate=48000","-filter_complex","[0:a][1:a]concat=n=2:v=0:a=1[a]","-map","[a]","-c:a","libmp3lame"],2,"audio/mpeg");
 for(const offset of [undefined,1]){
  const p=newProject();p.composition.sourceVolume=0;p.composition.musicVolume=1;p.composition.musicSpan="demo";
  const file=path.join(testDir,"seek-"+(offset??0)+".mp4");
  await renderVideo({row:{id:"seek",hookId:null,reactionId:"reaction",demoId:"demo",musicId:"offset-track"},musicStartOffset:offset,composition:p.composition,assets},file,()=>{},undefined,[216,384]);
  assert((await rms(file,.4))<.001);const demo=await rms(file,1.4);assert(offset===undefined?demo<.001:demo>.02);
 }
});
