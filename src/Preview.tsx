import { hookFontCSS } from "../shared/hook-fonts.ts";
import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  ArrowRight,
  Volume2,
  Image as ImageIcon,
} from "lucide-react";
import type { Asset, Project } from "../shared/types.ts";
import { activeHooks } from "../shared/project.ts";
import { outputResolution } from "../shared/ratios.ts";
import { useMedia } from "./components.tsx";
function KeyedPresenter({ asset, p, playing }: { asset?: Asset; p: Project; playing: boolean }) {
  const url = useMedia(playing ? asset?.id : undefined),
    video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setTimeout>,
      alive = true;
    const v = video.current!,
      c = canvas.current!,
      ctx = c.getContext("2d", { willReadFrequently: true })!;
    if (!ctx) return;
    const rgb = [1, 3, 5].map((i) =>
      parseInt(p.composition.keyColor.slice(i, i + 2), 16),
    );
    const draw = () => {
      if (!alive) return;
      if (document.hidden) { v.pause(); return; }
      if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
        // Bound BOTH dimensions; extreme portrait footage must not allocate an
        // enormous canvas. Process at most 15 frames/s, only during playback.
        const scale = Math.min(1, 320 / Math.max(v.videoWidth, v.videoHeight));
        const width = Math.max(1, Math.round(v.videoWidth * scale));
        const height = Math.max(1, Math.round(v.videoHeight * scale));
        if (c.width !== width || c.height !== height) { c.width = width; c.height = height; }
        ctx.drawImage(v, 0, 0, c.width, c.height);
        try {
          const pixels = ctx.getImageData(0, 0, c.width, c.height);
          for (let i = 0; i < pixels.data.length; i += 4) {
            const distance =
              Math.hypot(
                pixels.data[i] - rgb[0],
                pixels.data[i + 1] - rgb[1],
                pixels.data[i + 2] - rgb[2],
              ) / 441.67;
            pixels.data[i + 3] = Math.round(
              255 *
                Math.min(
                  1,
                  Math.max(
                    0,
                    (distance - p.composition.keySimilarity) /
                      Math.max(0.01, p.composition.keyBlend),
                  ),
                ),
            );
          }
          ctx.putImageData(pixels, 0, 0);
        } catch {
          // Stop retrying expensive readbacks if canvas access is unavailable.
          return;
        }
      }
      timer = setTimeout(draw, 1000 / 15);
    };
    void v.play().catch(() => {});
    draw();
    return () => {
      alive = false;
      clearTimeout(timer);
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [
    url,
    p.composition.keyColor,
    p.composition.keySimilarity,
    p.composition.keyBlend,
  ]);
  return url ? (
    <>
      <video
        ref={video}
        src={url}
        crossOrigin="anonymous"
        loop
        muted
        playsInline
        preload="none"
        className="canvas-source"
      />
      <canvas
        ref={canvas}
        style={{ width: `${p.composition.presenterScale * 100}%` }}
        className="keyed-presenter"
      />
    </>
  ) : null;
}
export default function Preview({
  p,
  assets,
  hookIndex = 0,
}: {
  p: Project;
  assets: Asset[];
  hookIndex?: number;
}) {
  const [part, setPart] = useState<"reaction" | "demo">("reaction"),
    [playing, setPlaying] = useState(false),
    [loaded, setLoaded] = useState(false),
    [mediaError, setMediaError] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    audio = useRef<HTMLAudioElement>(null);
  const c = p.composition,
    hooks = activeHooks({ ...p, skipped: p.skipped.filter((n) => n !== 3) }),
    hook = hooks[hookIndex] || hooks[0];
  const chosen =
    part === "reaction"
      ? c.style === "Green screen" && c.backgroundId
        ? c.backgroundId
        : p.reactionIds[0] || p.frameIds[0]
      : p.demoIds[0];
  const asset = assets.find((a) => a.id === chosen),
    url = useMedia(asset?.mime.startsWith("image/") || loaded ? chosen : undefined),
    hookImage = useMedia(hook?.imageId),
    music = useMedia(loaded && p.musicMode !== "none" ? p.musicIds[0] : undefined);
  const showHook = c.hookSpan === "whole" || c.hookSpan === part,
    playMusic = c.musicSpan === "whole" || c.musicSpan === part;
  useEffect(() => { setPlaying(false); setLoaded(false); setMediaError(""); }, [chosen]);
  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  useEffect(() => {
    let active = true;
    const v = video.current, a = audio.current;
    if (v) {
      v.volume = Math.min(1, Math.max(0, c.sourceVolume));
      if (playing) void v.play().catch(() => { if (active) setPlaying(false); });
      else v.pause();
    }
    if (a) {
      a.volume = Math.min(1, Math.max(0, c.musicVolume));
      if (playing && playMusic) void a.play().catch(() => {});
      else a.pause();
    }
    return () => { active = false; v?.pause(); a?.pause(); };
  }, [playing, part, url, music, c.musicVolume, c.sourceVolume, playMusic]);
  return (
    <aside className="preview-panel">
      <div className="preview-heading">
        <span>LIVE PREVIEW</span>
        <span className="preview-format">
          {c.aspectRatio || "9:16"} <span>·</span>{" "}
          {outputResolution(c.aspectRatio).join(" × ")}
        </span>
      </div>
      <div
        className={`phone-preview ${c.style === "Text Wall" ? "text-wall" : ""}`}
        style={{ aspectRatio: (c.aspectRatio || "9:16").replace(":", " / ") }}
      >
        {url ? (
          asset?.mime.startsWith("image/") ? (
            <img
              src={url}
              alt="Selected first frame"
              className="preview-media"
              style={{ objectFit: c.fit }}
            />
          ) : (
            <video
              ref={video}
              src={url}
              className="preview-media"
              style={{ objectFit: c.fit }}
              playsInline
              preload="none"
              onError={() => { setPlaying(false); setMediaError("Preview unavailable. Try again or inspect the original from the library."); }}
              onEnded={() => {
                if (part === "reaction" && p.demoIds.length) setPart("demo");
                else setPlaying(false);
              }}
            />
          )
        ) : (
          <div className="preview-empty">
            <div className="preview-grid" />
            <strong>{asset ? loaded ? "Loading original…" : "Press Play to preview" : "Select a clip to preview"}</strong>
          </div>
        )}
        <span className="preview-top-label">
          {part === "reaction" ? "REACTION CLIP" : "PRODUCT DEMO"}
        </span>
        {showHook && c.style === "Green screen" && (
          <KeyedPresenter
            asset={assets.find((a) => a.id === c.presenterId)}
            p={p}
            playing={playing}
          />
        )}
        {showHook &&
          (c.style === "IMG" ? (
            hookImage && (
              <img
                className={`preview-hook-image pos-${c.position}`}
                src={hookImage}
                alt="Image hook"
              />
            )
          ) : (
            <div
              className={`preview-hook pos-${c.position} style-${c.style.replace(" ", "-")}`}
              style={{ ...hookFontCSS(hook?.fontId ?? c.fontId, hook?.text || ""), fontSize: `${c.fontSize / 3.6}px` }}
            >
              {hook?.text || "Your hook text"}
            </div>
          ))}
        {asset && !asset.mime.startsWith("image/") && (
          <button
            className="preview-play"
            onClick={() => { setLoaded(true); setMediaError(""); setPlaying(!playing); }}
            aria-label={playing ? "Pause preview" : "Play preview"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
        )}
        <div className="preview-bottom">
          <span>
            {part === "reaction"
              ? asset?.duration || p.videoDuration
              : asset?.duration || 0}
            s
          </span>
          <span>
            {hookIndex + 1} / {Math.max(1, hooks.length)}
          </span>
        </div>
      </div>
      <div className="preview-timeline">
        <button
          className={part === "reaction" ? "active" : ""}
          onClick={() => {
            setPart("reaction");
            setPlaying(false);
          }}
        >
          Reaction
        </button>
        <ArrowRight size={13} />
        <button
          className={part === "demo" ? "active" : ""}
          onClick={() => {
            setPart("demo");
            setPlaying(false);
          }}
        >
          Demo
        </button>
      </div>
      <div className="preview-note">
        <Volume2 size={13} />
        <span>
          Hook: {c.hookSpan === "whole" ? "whole video" : `${c.hookSpan} only`}
          <br />
          Music:{" "}
          {c.musicSpan === "whole" ? "whole video" : `${c.musicSpan} only`}
        </span>
      </div>
      <small className="muted-text">Playback uses the original file at its original quality.</small>
      {mediaError && <p role="status" className="inline-error">{mediaError}</p>}
      {music && <audio ref={audio} src={music} loop preload="none" />}
    </aside>
  );
}
