import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  Plus,
  Upload,
  Play,
  Music2,
  Image as ImageIcon,
  Film,
  X,
  Loader2,
  Download,
  CheckCircle2,
} from "lucide-react";
import type { Asset, Span } from "../shared/types.ts";
import { SPANS } from "../shared/project.ts";
import { mediaURL } from "./api.ts";
import PromptContent from "./PromptContent.tsx";
export function Button({
  children,
  variant = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "black" | "ghost" | "danger";
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
export function SpanControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Span;
  onChange: (s: Span) => void;
}) {
  return (
    <Field label={label}>
      <div className="segmented span-control">
        {SPANS.map((s) => (
          <button
            key={s.value}
            className={s.value === value ? "active" : ""}
            onClick={() => onChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </Field>
  );
}
export function Quantity({
  value,
  onChange,
  max = 1000,
  label = "How many",
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  label?: string;
}) {
  return (
    <Field label={label}>
      <div className="quantity">
        {[4, 10, 25, 50]
          .filter((n) => n <= max)
          .map((n) => (
            <button
              className={value === n ? "active" : ""}
              onClick={() => onChange(n)}
              key={n}
            >
              {n}
            </button>
          ))}
        <input
          type="number"
          aria-label={label}
          min="1"
          max={max}
          value={value}
          onChange={(e) =>
            onChange(Math.min(max, Math.max(1, Number(e.target.value) || 1)))
          }
        />
      </div>
    </Field>
  );
}
export function UploadZone({
  kind,
  onFiles,
  compact = false,
  label = "Upload media",
  description = "Drop files here, or click to browse",
}: {
  kind: string;
  onFiles: (files: FileList) => void;
  compact?: boolean;
  label?: string;
  description?: string;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <label
      className={`upload-zone ${compact ? "compact" : ""} ${drag ? "drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept={
          kind === "image"
            ? "image/png,image/jpeg,image/webp"
            : kind === "music"
              ? "audio/mpeg,audio/mp3"
              : "video/mp4,video/webm,video/quicktime"
        }
        multiple
        onChange={(e) => {
          if (e.target.files) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <span className="upload-icon">
        <Upload size={22} />
      </span>
      <strong>{label}</strong>
      <small>{description}</small>
      <span className="file-limit">
        {kind === "image"
          ? "PNG, JPG, WEBP"
          : kind === "music"
            ? "MP3 audio"
            : "MP4, MOV, WEBM"}{" "}
        · up to 100 MB each
      </span>
    </label>
  );
}
export function useMedia(id?: string) {
  const [url, setURL] = useState("");
  useEffect(() => {
    setURL("");
    if (!id) return;
    let active = true;
    void mediaURL(id)
      .then((url) => {
        if (active) setURL(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  return url;
}
export function AssetMedia({
  asset,
  controls = false,
  className = "",
  muted = true,
}: {
  asset: Asset;
  controls?: boolean;
  className?: string;
  muted?: boolean;
}) {
  const url = useMedia(asset.id);
  if (!url)
    return (
      <div className={`media-placeholder ${className}`}>
        <Loader2 className="spin" size={20} />
      </div>
    );
  return asset.mime.startsWith("image/") ? (
    <img src={url} alt={asset.name} className={className} loading="lazy" />
  ) : asset.kind === "music" ? (
    <audio src={url} controls />
  ) : (
    <video
      src={url}
      className={className}
      controls={controls}
      muted={muted}
      playsInline
      preload="metadata"
    />
  );
}
export function AssetCard({
  asset,
  selected,
  onSelect,
  onInspect,
}: {
  asset: Asset;
  selected?: boolean;
  onSelect?: () => void;
  onInspect?: (a: Asset) => void;
}) {
  return (
    <article className={`asset-card ${selected ? "selected" : ""}`}>
      <button
        className="asset-visual"
        onClick={() => onInspect?.(asset)}
        aria-label={`Preview ${asset.name}`}
      >
        {asset.kind === "music" ? (
          <div className="music-art">
            <Music2 size={32} />
            <div className="waveform">
              {Array.from({ length: 19 }, (_, i) => (
                <i key={i} style={{ height: `${14 + ((i * 23) % 40)}px` }} />
              ))}
            </div>
          </div>
        ) : (
          <AssetMedia asset={asset} />
        )}
        <span className="play-badge">
          {asset.mime.startsWith("image/") ? (
            <ImageIcon size={15} />
          ) : (
            <Play size={15} />
          )}
        </span>
        {asset.duration ? (
          <span className="duration">{asset.duration.toFixed(0)}s</span>
        ) : null}
      </button>
      {onSelect && (
        <button
          className="asset-check"
          aria-label={`${selected ? "Deselect" : "Select"} ${asset.name}`}
          onClick={onSelect}
        >
          {selected ? <Check size={15} /> : <Plus size={15} />}
        </button>
      )}
      <div className="asset-caption">
        <strong title={asset.name}>{asset.name}</strong>
        <small>
          {new Date(asset.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          <span>·</span> {asset.model?.split("/")[1] || asset.kind}
        </small>
      </div>
    </article>
  );
}
export function EmptyState({
  title,
  description,
  icon = "film",
  children,
}: {
  title: string;
  description: string;
  icon?: string;
  children?: ReactNode;
}) {
  const Icon = icon === "image" ? ImageIcon : icon === "music" ? Music2 : Film;
  return (
    <div className="empty-state">
      <div className="empty-symbol">
        <Icon size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Inspector({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const url = useMedia(asset.id);
  return (
    <Modal title={asset.name} onClose={onClose}>
      <div className="inspector">
        <AssetMedia asset={asset} controls muted={false} />
      </div>
      <dl className="metadata">
        <dt>Created</dt>
        <dd>{new Date(asset.createdAt).toLocaleString()}</dd>
        <dt>Model</dt>
        <dd>{asset.model || "Uploaded media"}</dd>
        <dt>File size</dt>
        <dd>{(asset.size / 1048576).toFixed(1)} MB</dd>
        {asset.prompt && !asset.promptParts && (
          <>
            <dt>Resolved prompt</dt>
            <dd>{asset.prompt}</dd>
          </>
        )}
      </dl>
      {asset.prompt && asset.promptParts && (
        <details className="asset-prompt-details">
          <summary>
            View full {asset.kind === "reaction" ? "video" : "image"} prompt
          </summary>
          <PromptContent prompt={asset.prompt} parts={asset.promptParts} />
        </details>
      )}
      <a href={url} target="_blank" rel="noreferrer" className="button black">
        <Download size={16} /> Open / download original
      </a>
    </Modal>
  );
}
export function SuccessPill({ children }: { children: ReactNode }) {
  return (
    <span className="success-pill">
      <CheckCircle2 size={14} />
      {children}
    </span>
  );
}
