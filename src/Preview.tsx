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
import { useMedia } from "./components.tsx";
function KeyedPresenter({ asset, p }: { asset?: Asset; p: Project }) {
  const url = useMedia(asset?.id),
    video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!url) return;
    let frame = 0,
      alive = true;
    const v = video.current!,
      c = canvas.current!,
      ctx = c.getContext("2d", { willReadFrequently: true })!;
    const rgb = [1, 3, 5].map((i) =>
      parseInt(p.composition.keyColor.slice(i, i + 2), 16),
    );
    const draw = () => {
      if (!alive) return;
      if (v.readyState >= 2) {
        c.width = 270;
        c.height = Math.max(
          1,
          Math.round((270 * v.videoHeight) / v.videoWidth),
        );
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
          /* A bucket CORS setting may prevent a canvas preview; actual render still uses FFmpeg. */
        }
      }
      frame = requestAnimationFrame(draw);
    };
    void v.play().catch(() => {});
    draw();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
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
    [playing, setPlaying] = useState(false);
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
    url = useMedia(chosen),
    hookImage = useMedia(hook?.imageId),
    music = useMedia(p.musicMode !== "none" ? p.musicIds[0] : undefined);
  const showHook = c.hookSpan === "whole" || c.hookSpan === part,
    playMusic = c.musicSpan === "whole" || c.musicSpan === part;
  useEffect(() => {
    if (video.current) {
      video.current.volume = Math.min(1, c.sourceVolume);
      if (playing) void video.current.play().catch(() => setPlaying(false));
      else video.current.pause();
    }
    if (audio.current) {
      audio.current.volume = Math.min(1, c.musicVolume);
      if (playing && playMusic) void audio.current.play().catch(() => {});
      else audio.current.pause();
    }
  }, [playing, part, url, music, c.musicVolume, c.sourceVolume, playMusic]);
  return (
    <aside className="preview-panel">
      <div className="preview-heading">
        <span>LIVE PREVIEW</span>
        <span className="preview-format">
          9:16 <span>·</span> 1080p
        </span>
      </div>
      <div
        className={`phone-preview ${c.style === "Text Wall" ? "text-wall" : ""}`}
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
              onEnded={() => {
                if (part === "reaction" && p.demoIds.length) setPart("demo");
                else setPlaying(false);
              }}
            />
          )
        ) : (
          <div className="preview-empty">
            <div className="preview-grid" />
            <strong>Select a clip to preview</strong>
          </div>
        )}
        <span className="preview-top-label">
          {part === "reaction" ? "REACTION CLIP" : "PRODUCT DEMO"}
        </span>
        {showHook && c.style === "Green screen" && (
          <KeyedPresenter
            asset={assets.find((a) => a.id === c.presenterId)}
            p={p}
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
              style={{ fontSize: `${c.fontSize / 3.6}px` }}
            >
              {hook?.text || "Your hook text"}
            </div>
          ))}
        {url && !asset?.mime.startsWith("image/") && (
          <button
            className="preview-play"
            onClick={() => setPlaying(!playing)}
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
      {music && <audio ref={audio} src={music} loop />}
    </aside>
  );
}
