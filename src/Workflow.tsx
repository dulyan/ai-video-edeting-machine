import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  Film,
  Image as ImageIcon,
  Music2,
  Layers,
  SlidersHorizontal,
  Trash2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  X,
  Link2,
  Clock3,
} from "lucide-react";
import type {
  Asset,
  AssetKind,
  Composition,
  Product,
  Project,
  RenderRow,
} from "../shared/types.ts";
import {
  activeHooks,
  combinationAt,
  combinationCount,
  excludedCount,
  effectiveProject,
  IMAGE_PROMPT,
  VIDEO_FIXED_INSTRUCTIONS,
  IMAGE_FIXED_INSTRUCTIONS,
  VIDEO_PROMPT,
  SPANS,
} from "../shared/project.ts";
import { ModelPicker, ModelOptions, useModels } from "./ModelPicker.tsx";
import GenerationProgress from "./GenerationProgress.tsx";
import { RatioPicker } from "./RatioPicker.tsx";
import { isTextToImage, isImageToVideo } from "../shared/ratios.ts";
import { isAutoFrameField } from "../shared/catalog.ts";
import type { Workspace } from "./workspace.tsx";
import {
  AssetCard,
  Button,
  EmptyState,
  Field,
  Modal,
  Quantity,
  SpanControl,
  UploadZone,
  AssetMedia,
} from "./components.tsx";
import Preview from "./Preview.tsx";
import { request } from "./api.ts";
import VariationControl from "./VariationControl.tsx";
type Props = {
  p: Project;
  w: Workspace;
  update: (patch: Partial<Project>) => void;
  inspect: (a: Asset) => void;
};
const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
export function Naming({ p, update }: Props) {
  return (
    <section className="card naming-card">
      <Field
        label="Project name"
        hint="Projects keep your prompts, assets, and finished videos together."
      >
        <input
          className="name-input"
          autoFocus
          placeholder="e.g. Autumn skincare launch"
          value={p.name}
          onChange={(e) => update({ name: e.target.value })}
          maxLength={200}
        />
      </Field>
      <Button variant="black" onClick={() => update({ step: 1 })}>
        Continue to first frames <ArrowRight size={18} />
      </Button>
    </section>
  );
}
export function Generation({
  p,
  w,
  update,
  inspect,
  mode,
}: { mode: "image" | "video" } & Props) {
  const { models, setModels } = useModels(w.connected);
  const [presetName, setPresetName] = useState("");
  const [frameScope, setFrameScope] = useState("project");
  const image = mode === "image",
    assets = w.data.assets.filter(
      (a) => a.projectId === p.id && a.kind === (image ? "image" : "reaction"),
    ),
    frames = w.data.assets.filter((a) => a.kind === "image"),
    chosenFrames =
      p.frameSelectionExplicit || p.frameIds.length
        ? p.frameIds
        : frames.filter((a) => a.projectId === p.id).map((a) => a.id);
  const batch = w.data.jobs.find(
    (j) =>
      j.projectId === p.id &&
      j.kind === "prepare" &&
      (j.mode === mode ||
        (!j.mode &&
          j.label.toLowerCase().includes(image ? "frames" : "reactions"))),
  );
  const jobs = w.data.jobs.filter(
    (j) =>
      j.projectId === p.id &&
      ["running", "queued"].includes(j.status) &&
      (j.kind === mode || (j.kind === "prepare" && j.mode === mode)),
  );
  const previousAssets = batch
    ? assets.filter(
        (a) =>
          !w.data.jobs.some(
            (j) => j.batchId === batch.batchId && j.outputId === a.id,
          ),
      )
    : assets;
  const model = models.find(
    (m) => m.id === (image ? p.imageModel : p.videoModel),
  );
  const needsFrames =
    !image &&
    Object.keys(model?.schema?.properties || {}).some(isAutoFrameField);
  const amount = image
    ? p.imageCount
    : p.videoCount * (needsFrames ? chosenFrames.length : 1);
  return (
    <div className="generation-layout">
      <section className="card generation-form">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {image ? "01 / THE STARTING POINT" : "02 / BRING IT TO LIFE"}
            </span>
            <h3>
              {image ? "Generate first frames" : "Generate reaction videos"}
            </h3>
          </div>
          <span className="icon-disc">
            {image ? <ImageIcon size={20} /> : <Film size={20} />}
          </span>
        </div>
        <div className="prompt-presets">
          <span>START WITH A PROMPT</span>
          <button
            onClick={() =>
              update(
                image
                  ? {
                      imagePrompt: IMAGE_PROMPT,
                      imageFixedInstructions: IMAGE_FIXED_INSTRUCTIONS,
                      imageVariation: 50,
                    }
                  : {
                      videoPrompt: VIDEO_PROMPT,
                      videoFixedInstructions: VIDEO_FIXED_INSTRUCTIONS,
                      videoVariation: 50,
                    },
              )
            }
          >
            UGC {image ? "portrait" : "reaction"}
          </button>
          <button
            onClick={() =>
              update(
                image
                  ? {
                      imagePrompt:
                        "Invent a different, highly specific everyday adult and lived-in setting for each output. Describe their natural appearance, casually chosen clothing, ordinary personal details, and plausible surroundings in rich detail. Choose all details yourself and keep the scene coherent with the fixed image instructions.",
                      imageFixedInstructions: IMAGE_FIXED_INSTRUCTIONS,
                      imageVariation: 50,
                    }
                  : {
                      videoPrompt:
                        "Describe a slow, silent progression from curious disbelief to delighted surprise and a warm excited smile. Specify subtle natural gestures and timing compatible with the starting frame. Respect the fixed video instructions.",
                      videoFixedInstructions: VIDEO_FIXED_INSTRUCTIONS,
                      videoVariation: 50,
                    },
              )
            }
          >
            {image ? "Surprised creator" : "Slow reveal"}
          </button>
        </div>
        {(w.data.presets || []).filter((p) => p.mode === mode).length > 0 && (
          <Field label="Saved prompts">
            <select
              aria-label="Choose a saved prompt"
              defaultValue=""
              onChange={(e) => {
                const preset = w.data.presets?.find(
                  (p) => p.id === e.target.value,
                );
                if (preset)
                  update(
                    image
                      ? {
                          imagePrompt: preset.prompt,
                          imageFixedInstructions:
                            preset.fixedInstructions ?? "",
                          imageVariation: preset.variation ?? 50,
                        }
                      : {
                          videoPrompt: preset.prompt,
                          videoFixedInstructions:
                            preset.fixedInstructions ?? "",
                          videoVariation: preset.variation ?? 50,
                        },
                  );
              }}
            >
              <option value="">Choose a saved prompt</option>
              {(w.data.presets || [])
                .filter((p) => p.mode === mode)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field
          label={image ? "Text-model instructions" : "Movement guidance"}
          hint={
            image
              ? "Tell the text model what to invent, how detailed it should be, and what should differ between outputs."
              : "Sent directly to the image-to-video model with each selected starting frame. Describe movements and expressions without redescribing the person."
          }
        >
          <textarea
            className="prompt-input"
            value={image ? p.imagePrompt : p.videoPrompt}
            onChange={(e) =>
              update(
                image
                  ? { imagePrompt: e.target.value }
                  : { videoPrompt: e.target.value },
              )
            }
            rows={6}
          />
        </Field>
        {
          <>
            {image && (
              <VariationControl
                value={(image ? p.imageVariation : p.videoVariation) ?? 50}
                onChange={(variation) =>
                  update(
                    image
                      ? { imageVariation: variation }
                      : { videoVariation: variation },
                  )
                }
              />
            )}
            <Field
              label={
                image ? "Fixed image instructions" : "Fixed video instructions"
              }
              hint="This wording is copied exactly into every final prompt, including its spacing and line breaks."
            >
              <textarea
                rows={7}
                value={
                  (image
                    ? p.imageFixedInstructions
                    : p.videoFixedInstructions) ?? ""
                }
                placeholder="Paste the image instructions that should stay identical in every output…"
                onChange={(e) =>
                  update(
                    image
                      ? { imageFixedInstructions: e.target.value }
                      : { videoFixedInstructions: e.target.value },
                  )
                }
              />
            </Field>
            <p className="prompt-assembly-note">
              {image
                ? "The text model generates the unique description. The app combines it with your fixed instructions without rewriting them."
                : "Each selected starting frame is animated directly by the image-to-video model. Fixed video instructions and movement guidance are sent together without a text-model pass."}
            </p>
            {(image ? p.imageFixedInstructions : p.videoFixedInstructions) ===
              undefined && (
              <p className="info-note">
                Your previous generic prompt is preserved above. Move any
                wording you want copied verbatim into the fixed instructions
                field.
              </p>
            )}
          </>
        }
        <div className="save-prompt-row">
          <input
            aria-label="Prompt preset name"
            placeholder="Save this prompt as?"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            maxLength={100}
          />
          <Button
            variant="ghost"
            disabled={!presetName.trim()}
            onClick={() =>
              void w.act("Saving prompt", async () => {
                await w.savePreset({
                  id: crypto.randomUUID(),
                  name: presetName.trim(),
                  mode,
                  prompt: image ? p.imagePrompt : p.videoPrompt,
                  fixedInstructions:
                    (image
                      ? p.imageFixedInstructions
                      : p.videoFixedInstructions) ?? "",
                  variation:
                    (image ? p.imageVariation : p.videoVariation) ?? 50,
                });
                setPresetName("");
              })
            }
          >
            Save preset
          </Button>
        </div>
        {image && (
          <ModelPicker
            label="Text model for unique prompts"
            models={models.filter((m) => m.kind === "text")}
            value={
              (image ? p.imagePromptModel : p.videoPromptModel) ||
              "openai/gpt-4.1-mini"
            }
            onChange={(id) =>
              update(
                image ? { imagePromptModel: id } : { videoPromptModel: id },
              )
            }
          />
        )}
        <h3 className="generation-phase-heading">
          2. Generate {image ? "first frames" : "reaction clips"}
        </h3>
        <div className="form-columns">
          <ModelPicker
            label={image ? "Text-to-image model" : "Image-to-video model"}
            models={models.filter(
              image
                ? isTextToImage
                : (m) =>
                    isImageToVideo(m) &&
                    Object.keys(m.schema?.properties || {}).some(
                      isAutoFrameField,
                    ),
            )}
            value={image ? p.imageModel : p.videoModel}
            onChange={(id) => {
              const next = models.find((m) => m.id === id);
              update(
                image
                  ? { imageModel: id }
                  : {
                      videoModel: id,
                      videoDuration: next?.durations?.includes(p.videoDuration)
                        ? p.videoDuration
                        : next?.durations?.[0] || 8,
                    },
              );
            }}
          />
          {!image &&
            (model?.schema?.properties?.duration ||
              model?.schema?.properties?.seconds) && (
              <Field label="Clip duration">
                <select
                  value={p.videoDuration}
                  onChange={(e) =>
                    update({ videoDuration: Number(e.target.value) })
                  }
                >
                  {(model?.durations || [p.videoDuration]).map((n) => (
                    <option key={n} value={n}>
                      {n === -1 ? "Auto duration" : `${n} seconds`}
                    </option>
                  ))}
                </select>
              </Field>
            )}
        </div>
        <RatioPicker
          model={model}
          value={(image ? p.imageAspectRatio : p.videoAspectRatio) || "9:16"}
          onChange={(ratio) =>
            update(
              image ? { imageAspectRatio: ratio } : { videoAspectRatio: ratio },
            )
          }
        />
        <ModelOptions
          model={model}
          p={p}
          w={w}
          update={update}
          autoFrame={needsFrames}
          managedRatio
        />
        <Quantity
          label={
            image
              ? "How many first frames"
              : needsFrames
                ? "Videos per first frame"
                : "How many videos"
          }
          value={image ? p.imageCount : p.videoCount}
          max={image ? 1000 : 100}
          onChange={(value) =>
            update(image ? { imageCount: value } : { videoCount: value })
          }
        />
        {!image && (
          <section className="starting-frame-library">
            <h3>
              Choose starting frames{" "}
              <span className="count-badge">
                {chosenFrames.length} selected
              </span>
            </h3>
            <p>
              Each selected image becomes the starting frame of {p.videoCount}{" "}
              reaction {p.videoCount === 1 ? "video" : "videos"}.
            </p>
            <Field label="Starting-frame library">
              <select
                value={frameScope}
                onChange={(e) => setFrameScope(e.target.value)}
              >
                <option value="project">This project</option>
                <option value="all">All projects</option>
              </select>
            </Field>
            <div className="frame-selection-actions">
              <Button
                variant="ghost"
                onClick={() =>
                  update({
                    frameIds: [
                      ...new Set([
                        ...chosenFrames,
                        ...frames
                          .filter(
                            (a) => frameScope === "all" || a.projectId === p.id,
                          )
                          .map((a) => a.id),
                      ]),
                    ],
                    frameSelectionExplicit: true,
                  })
                }
              >
                Select all starting frames
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  update({ frameIds: [], frameSelectionExplicit: true })
                }
              >
                Clear selection
              </Button>
            </div>
            <div className="starting-frame-grid">
              {frames
                .filter((a) => frameScope === "all" || a.projectId === p.id)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    selected={chosenFrames.includes(a.id)}
                    onSelect={() =>
                      update({
                        frameIds: toggle(chosenFrames, a.id),
                        frameSelectionExplicit: true,
                      })
                    }
                    onInspect={inspect}
                  />
                ))}
            </div>
            {!frames.some(
              (a) => frameScope === "all" || a.projectId === p.id,
            ) && (
              <p>
                No starting frames here yet. Generate them in First frames or
                choose All projects.
              </p>
            )}
            <p className="source-summary">
              {chosenFrames.length} selected starting frames ? {p.videoCount}{" "}
              videos per frame = {amount} reaction clips
            </p>
          </section>
        )}
        <Button
          variant="primary"
          disabled={!!w.busy || jobs.length > 0 || amount === 0}
          onClick={() =>
            void w.act("Starting generation", () => w.generate(p.id, mode))
          }
        >
          <Sparkles size={17} />
          {w.busy ||
            (jobs.length > 0
              ? "Batch in progress"
              : `Generate ${amount} ${image ? "first frames" : "reaction clips"}`)}
          <ArrowUpRight size={17} />
        </Button>
        <button
          className="text-button"
          disabled={!w.connected}
          onClick={() =>
            void w.act("Refreshing models", async () => {
              const result = await request("/models?refresh=1");
              setModels(result.models);
              w.notify("Model availability refreshed from Siray.");
            })
          }
        >
          <RefreshCw size={12} /> Refresh model availability
        </button>
      </section>
      <section className="generation-results">
        <div className="section-heading">
          <h3>
            {image ? "Your first frames" : "Reaction clips"}{" "}
            <span className="count-badge">{assets.length}</span>
          </h3>
          {assets.length > 0 && (
            <button
              className="text-button"
              onClick={() =>
                update(
                  image
                    ? {
                        frameIds: assets.map((a) => a.id),
                        frameSelectionExplicit: true,
                      }
                    : { reactionIds: assets.map((a) => a.id) },
                )
              }
            >
              Select all
            </button>
          )}
        </div>
        {batch && (
          <GenerationProgress
            key={batch.id}
            batch={batch}
            w={w}
            inspect={inspect}
            selectedIds={image ? p.frameIds : p.reactionIds}
            toggleAsset={(id) =>
              update(
                image
                  ? {
                      frameIds: toggle(p.frameIds, id),
                      frameSelectionExplicit: true,
                    }
                  : { reactionIds: toggle(p.reactionIds, id) },
              )
            }
          />
        )}
        {previousAssets.length ? (
          <div className="asset-grid">
            {previousAssets.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                selected={(image ? p.frameIds : p.reactionIds).includes(a.id)}
                onSelect={() =>
                  update(
                    image
                      ? {
                          frameIds: toggle(p.frameIds, a.id),
                          frameSelectionExplicit: true,
                        }
                      : { reactionIds: toggle(p.reactionIds, a.id) },
                  )
                }
                onInspect={inspect}
              />
            ))}
          </div>
        ) : !batch ? (
          <EmptyState
            title={image ? "No first frames yet" : "No reaction clips yet"}
            description={
              image
                ? "Unique prompts and frame previews will appear here as the batch runs. Completed frames are saved to this project and the Image Library."
                : "Turn your first frames into expressive reaction clips. Each result is saved to this project and your Video Library."
            }
            icon={image ? "image" : "film"}
          />
        ) : null}
        <UploadZone
          compact
          kind={image ? "image" : "video"}
          label={image ? "Or upload first frames" : "Or upload reaction clips"}
          onFiles={(files) =>
            void w.act("Uploading", () =>
              w.upload(files, image ? "image" : "reaction", p.id),
            )
          }
        />
      </section>
    </div>
  );
}
function ProductModal({
  product,
  w,
  onSave,
  onClose,
}: {
  product?: Product;
  w: Workspace;
  onSave: (p: Product) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Product>(
      product || {
        id: crypto.randomUUID(),
        internalName: "",
        externalName: "",
        url: "",
        painPoints: "",
        costOfInaction: "",
        solution: "",
        proof: "",
      },
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const patch = (key: keyof Product, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  async function importProduct() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/products/import", {
        method: "POST",
        body: JSON.stringify({ url: form.url }),
      });
      setForm((p) => ({
        ...p,
        ...Object.fromEntries(
          Object.entries(data).filter(
            ([key, value]) =>
              [
                "internalName",
                "externalName",
                "painPoints",
                "costOfInaction",
                "solution",
                "proof",
              ].includes(key) && typeof value === "string",
          ),
        ),
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal
      title={product ? "Edit product" : "A little about your product"}
      onClose={onClose}
    >
      <p className="modal-description">
        Save the details once. Find a fresh angle whenever you need it.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void w.act("Saving product", async () => {
            await w.saveProduct(form);
            onSave(form);
            onClose();
          });
        }}
      >
        <Field
          label="Fill from your website"
          hint="We’ll suggest details for you to review."
        >
          <div className="input-action">
            <input
              value={form.url}
              placeholder="yourbrand.com or App Store link"
              onChange={(e) => patch("url", e.target.value)}
            />
            <Button
              type="button"
              disabled={loading || !w.connected || !form.url}
              onClick={() => void importProduct()}
            >
              {loading ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Link2 size={15} />
              )}{" "}
              Fill
            </Button>
          </div>
        </Field>
        {error && <p className="inline-error">{error}</p>}
        <div className="form-columns">
          <Field label="Internal name">
            <input
              required
              value={form.internalName}
              placeholder="e.g. Summer launch"
              onChange={(e) => patch("internalName", e.target.value)}
            />
          </Field>
          <Field label="External name">
            <input
              required
              value={form.externalName}
              placeholder="Your product name"
              onChange={(e) => patch("externalName", e.target.value)}
            />
          </Field>
        </div>
        {(
          [
            [
              "painPoints",
              "Pain points",
              "What is your customer struggling with?",
            ],
            [
              "costOfInaction",
              "Cost of inaction",
              "What happens if they don’t solve it?",
            ],
            ["solution", "Solution", "How does your product help?"],
            [
              "proof",
              "Proof",
              "Real reviews, evidence, and results you can support.",
            ],
          ] as const
        ).map(([key, label, placeholder]) => (
          <Field label={label} key={key}>
            <textarea
              rows={2}
              value={form[key]}
              placeholder={placeholder}
              onChange={(e) => patch(key, e.target.value)}
            />
          </Field>
        ))}
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save product <Check size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function Hooks({ p, w, update, inspect }: Props) {
  const { models } = useModels(w.connected);
  const [productModal, setProductModal] = useState<false | "new" | "edit">(
      false,
    ),
    [selected, setSelected] = useState(0),
    [next, setNext] = useState("");
  const c = p.composition,
    patch = (value: Partial<Composition>) =>
      update({ composition: { ...c, ...value } }),
    product = w.data.products.find((x) => x.id === p.productId),
    hooks = p.hooks.filter((h) =>
      c.style === "IMG" ? h.imageId : h.text.trim(),
    ),
    active = w.data.jobs.some(
      (j) =>
        j.projectId === p.id &&
        j.kind === "hooks" &&
        ["queued", "running"].includes(j.status),
    );
  async function imageHooks(files: FileList) {
    const assets = await w.upload(files, "hook-image", p.id);
    update({
      hooks: [
        ...p.hooks,
        ...assets.map((a) => ({
          id: crypto.randomUUID(),
          text: "",
          imageId: a.id,
          createdAt: new Date().toISOString(),
        })),
      ],
    });
  }
  return (
    <>
      <div className="hooks-layout">
        <div className="hooks-main">
          <section className="card hook-generator">
            <div className="section-heading">
              <div>
                <span className="eyebrow">A SCROLL-STOPPING START</span>
                <h3>
                  <Sparkles size={20} className="coral-text" /> Generate viral
                  hooks
                </h3>
              </div>
            </div>
            <div className="product-select-row">
              <Field label="Product">
                <select
                  value={p.productId}
                  onChange={(e) => update({ productId: e.target.value })}
                >
                  <option value="">Choose a saved product</option>
                  {w.data.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.internalName} · {product.externalName}
                    </option>
                  ))}
                </select>
              </Field>
              <Button onClick={() => setProductModal("new")}>
                <Plus size={16} /> Add product
              </Button>
              {product && (
                <button
                  className="text-button"
                  onClick={() => setProductModal("edit")}
                >
                  Edit details
                </button>
              )}
            </div>
            <div className="hook-generator-bottom">
              <ModelPicker
                label="Hook generation model"
                models={models.filter((m) => m.kind === "text")}
                value={p.hookModel || ""}
                onChange={(hookModel) => update({ hookModel })}
                allowDefault
              />
              <Quantity
                label="How many hooks"
                value={p.hookCount}
                onChange={(hookCount) => update({ hookCount })}
              />
              <Field label="Language">
                <select
                  value={p.language}
                  onChange={(e) => update({ language: e.target.value })}
                >
                  {[
                    "English",
                    "Russian",
                    "Spanish",
                    "French",
                    "German",
                    "Portuguese",
                    "Italian",
                    "Arabic",
                    "Hindi",
                    "Japanese",
                  ].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <Button
                variant="primary"
                disabled={active || !!w.busy}
                onClick={() =>
                  void w.act("Writing hooks", () => w.generate(p.id, "hooks"))
                }
              >
                {active ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}{" "}
                {active
                  ? "Writing your hooks…"
                  : `Generate ${p.hookCount} hooks`}
              </Button>
            </div>
          </section>
          <section className="hook-editor">
            <div className="section-heading">
              <h3>Hook style and timing</h3>
              <span className="muted-text">{hooks.length} unique hooks</span>
            </div>
            <div className="style-tabs" role="tablist" aria-label="Hook style">
              {(
                [
                  "Text",
                  "Snapchat",
                  "IMG",
                  "Text Wall",
                  "Green screen",
                ] as const
              ).map((style) => (
                <button
                  role="tab"
                  aria-selected={c.style === style}
                  key={style}
                  className={c.style === style ? "active" : ""}
                  onClick={() => {
                    patch({ style });
                    setSelected(0);
                  }}
                >
                  {style}
                </button>
              ))}
            </div>
            <div className="style-settings">
              <Field label="Hook position">
                <div className="segmented">
                  {(["top", "middle", "bottom"] as const).map((position) => (
                    <button
                      key={position}
                      className={c.position === position ? "active" : ""}
                      onClick={() => patch({ position })}
                    >
                      {position}
                    </button>
                  ))}
                </div>
              </Field>
              {c.style === "Text Wall" ? (
                <Field label="Clip duration">
                  <select
                    value={c.textWallDuration}
                    onChange={(e) =>
                      patch({ textWallDuration: Number(e.target.value) })
                    }
                  >
                    <option value={7}>Short · 7 seconds</option>
                    <option value={14}>Long · 14 seconds</option>
                  </select>
                </Field>
              ) : (
                <Field label="Text size">
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={c.fontSize}
                    onChange={(e) =>
                      patch({ fontSize: Number(e.target.value) })
                    }
                  />
                </Field>
              )}
            </div>
            <SpanControl
              label="Show hook on"
              value={c.hookSpan}
              onChange={(hookSpan) => patch({ hookSpan })}
            />
            {c.style === "Green screen" && (
              <div className="card green-controls">
                <Field label="Green-screen presenter">
                  <select
                    value={c.presenterId}
                    onChange={(e) => patch({ presenterId: e.target.value })}
                  >
                    <option value="">Choose a presenter clip</option>
                    {w.data.assets
                      .filter((a) => a.kind === "presenter")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <UploadZone
                  compact
                  kind="video"
                  label="Upload presenter"
                  onFiles={(files) =>
                    void w.act("Uploading presenter", async () => {
                      const a = await w.upload(files, "presenter", p.id);
                      patch({ presenterId: a[0].id });
                    })
                  }
                />
                <Field label="Background">
                  <select
                    value={c.backgroundId}
                    onChange={(e) => patch({ backgroundId: e.target.value })}
                  >
                    <option value="">Use the selected reaction clip</option>
                    {w.data.assets
                      .filter((a) =>
                        ["image", "reaction", "demo"].includes(a.kind),
                      )
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="form-columns">
                  <Field label="Key color">
                    <input
                      type="color"
                      value={c.keyColor}
                      onChange={(e) => patch({ keyColor: e.target.value })}
                    />
                  </Field>
                  <Field label="Presenter scale">
                    <input
                      type="range"
                      min="0.15"
                      max="1"
                      step="0.01"
                      value={c.presenterScale}
                      onChange={(e) =>
                        patch({ presenterScale: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Key similarity">
                    <input
                      type="range"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={c.keySimilarity}
                      onChange={(e) =>
                        patch({ keySimilarity: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Edge blend / spill">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={c.keyBlend}
                      onChange={(e) =>
                        patch({ keyBlend: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}
            {c.style === "IMG" ? (
              <>
                <UploadZone
                  compact
                  kind="image"
                  label="Upload one image per hook"
                  description="Choose multiple images at once"
                  onFiles={(files) =>
                    void w.act("Uploading image hooks", () => imageHooks(files))
                  }
                />
                <div className="asset-grid small-grid">
                  {hooks.map((hook, i) => {
                    const a = w.data.assets.find((a) => a.id === hook.imageId);
                    return a ? (
                      <AssetCard
                        key={hook.id}
                        asset={a}
                        onInspect={() => setSelected(i)}
                        selected={selected === i}
                        onSelect={() => setSelected(i)}
                      />
                    ) : null;
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="hook-list">
                  {hooks.map((hook, i) => (
                    <div
                      className={`hook-row ${i === selected ? "active" : ""}`}
                      key={hook.id}
                      onFocus={() => setSelected(i)}
                    >
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <textarea
                        aria-label={`Hook ${i + 1}`}
                        rows={Math.max(1, Math.ceil(hook.text.length / 80))}
                        value={hook.text}
                        disabled={active}
                        onChange={(e) =>
                          update({
                            hooks: p.hooks.map((h) =>
                              h.id === hook.id
                                ? { ...h, text: e.target.value }
                                : h,
                            ),
                          })
                        }
                      />
                      <button
                        className="icon-button"
                        aria-label={`Delete hook ${i + 1}`}
                        disabled={active}
                        onClick={() =>
                          update({
                            hooks: p.hooks.filter((h) => h.id !== hook.id),
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  className="add-hook"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (next.trim()) {
                      update({
                        hooks: [
                          ...p.hooks,
                          {
                            id: crypto.randomUUID(),
                            text: next.trim(),
                            createdAt: new Date().toISOString(),
                          },
                        ],
                      });
                      setNext("");
                    }
                  }}
                >
                  <Plus size={16} />
                  <input
                    placeholder="Write your next hook…"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    aria-label="New hook"
                  />
                  <Button
                    type="submit"
                    variant="ghost"
                    disabled={!next.trim() || active}
                  >
                    Add
                  </Button>
                </form>
                {!hooks.length && (
                  <div className="hook-hint">
                    Generate hooks above or write your own.
                  </div>
                )}
              </>
            )}
            <div className="hook-list-footer">
              <span>
                <strong>{hooks.length}</strong> hooks × your selected clips,
                demos & tracks
              </span>
              <button
                className="text-button"
                disabled={active || !hooks.length}
                onClick={() =>
                  update({
                    hooks: p.hooks.filter(
                      (h) => !hooks.some((current) => current.id === h.id),
                    ),
                  })
                }
              >
                <Trash2 size={13} /> Clear{" "}
                {c.style === "IMG" ? "image" : "text"} hooks
              </button>
            </div>
          </section>
        </div>
        <Preview p={p} assets={w.data.assets} hookIndex={selected} />
      </div>
      {productModal && (
        <ProductModal
          product={productModal === "edit" ? product : undefined}
          w={w}
          onClose={() => setProductModal(false)}
          onSave={(product) => update({ productId: product.id })}
        />
      )}
    </>
  );
}
export function LibraryChooser({
  p,
  w,
  update,
  inspect,
  kind,
}: { kind: "reaction" | "demo" | "music" } & Props) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest"),
    [filter, setFilter] = useState("all");
  const key =
      kind === "reaction"
        ? "reactionIds"
        : kind === "demo"
          ? "demoIds"
          : "musicIds",
    selected = p[key];
  const assets = w.data.assets
    .filter(
      (a) =>
        a.kind === kind &&
        (!query || a.name.toLowerCase().includes(query.toLowerCase())) &&
        (filter === "all" || a.projectId === p.id),
    )
    .sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt),
    );
  const onUpload = (files: FileList) =>
    void w.act("Uploading media", async () => {
      const assets = await w.upload(files, kind, p.id);
      update({
        [key]: [...selected, ...assets.map((a) => a.id)],
        ...(kind === "music" ? { musicMode: "selected" } : {}),
      });
    });
  return (
    <div className={kind === "music" ? "music-layout" : ""}>
      <section>
        <div className="library-toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="Search library"
              placeholder={`Search ${kind === "music" ? "music" : "videos"}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            aria-label="Sort by generation date"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <select
            aria-label="Filter projects"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All projects</option>
            <option value="project">This project</option>
          </select>
          <Button
            onClick={() =>
              update({
                [key]: assets.every((a) => selected.includes(a.id))
                  ? selected.filter((id) => !assets.some((a) => a.id === id))
                  : [...new Set([...selected, ...assets.map((a) => a.id)])],
              })
            }
          >
            {assets.length > 0 && assets.every((a) => selected.includes(a.id))
              ? "Deselect"
              : "Select"}{" "}
            all
          </Button>
        </div>
        {kind === "music" && (
          <>
            <div className="card music-options">
              <div className="section-heading">
                <div>
                  <h3>The soundtrack to your story.</h3>
                  <p>
                    Choose your tracks, or leave room for a little serendipity.
                  </p>
                </div>
                <Music2 size={26} className="coral-text" />
              </div>
              <div className="segmented music-mode">
                {(
                  [
                    { value: "selected", label: "Every selected track" },
                    { value: "random", label: "Random from selection" },
                    { value: "none", label: "No added music" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.value}
                    className={p.musicMode === mode.value ? "active" : ""}
                    onClick={() => update({ musicMode: mode.value })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <SpanControl
                label="Play music on"
                value={p.composition.musicSpan}
                onChange={(musicSpan) =>
                  update({ composition: { ...p.composition, musicSpan } })
                }
              />
              <div className="form-columns">
                <Field
                  label={`Music volume · ${Math.round(p.composition.musicVolume * 100)}%`}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={p.composition.musicVolume}
                    onChange={(e) =>
                      update({
                        composition: {
                          ...p.composition,
                          musicVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field
                  label={`Original audio · ${Math.round(p.composition.sourceVolume * 100)}%`}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={p.composition.sourceVolume}
                    onChange={(e) =>
                      update({
                        composition: {
                          ...p.composition,
                          sourceVolume: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
              </div>
              <p className="info-note">
                {p.musicMode === "selected"
                  ? "Each selected track creates another version of every hook × reaction × demo combination."
                  : p.musicMode === "random"
                    ? "One track from your selection is assigned to each output and saved for consistent retries."
                    : "Your videos keep their original audio. No music track is added."}
              </p>
            </div>
          </>
        )}
        <div className="section-heading">
          <h3>
            {kind === "demo"
              ? "Product demos"
              : kind === "reaction"
                ? "Your reaction library"
                : "Your tracks"}{" "}
            <span className="count-badge">{assets.length}</span>
          </h3>
          <span className="selection-label">
            <Check size={13} />
            {selected.length} selected
          </span>
        </div>
        {assets.length ? (
          <div className={`asset-grid ${kind === "music" ? "music-grid" : ""}`}>
            {assets.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                selected={selected.includes(a.id)}
                onSelect={() =>
                  update({
                    [key]: toggle(selected, a.id),
                    ...(kind === "music" && p.musicMode === "none"
                      ? { musicMode: "selected" }
                      : {}),
                  })
                }
                onInspect={inspect}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              kind === "demo"
                ? "Show what makes it special."
                : kind === "music"
                  ? "Find your rhythm."
                  : "Your next reaction is waiting."
            }
            description={
              kind === "demo"
                ? "Upload product demos once, then use them in every campaign. Each selected demo follows your reaction clip."
                : kind === "music"
                  ? "Upload MP3 tracks to build your reusable music library."
                  : "Generated reaction clips from every project live here. You can also upload your own."
            }
            icon={kind === "music" ? "music" : "film"}
          />
        )}
        <UploadZone
          kind={kind === "music" ? "music" : "video"}
          label={
            kind === "demo"
              ? "Add product demos"
              : kind === "music"
                ? "Add music"
                : "Add reaction clips"
          }
          onFiles={onUpload}
        />
      </section>
      {kind === "music" && <Preview p={p} assets={w.data.assets} />}
    </div>
  );
}
export function Outline({ p, w, update, inspect }: Props) {
  const { models } = useModels(w.connected);
  const [page, setPage] = useState(0),
    count = combinationCount(p),
    effective = effectiveProject(p),
    excluded = excludedCount(p),
    [productModal, setProductModal] = useState(false);
  useEffect(() => {
    if (page * 12 >= count) setPage(Math.max(0, Math.floor((count - 1) / 12)));
  }, [count, page]);
  const rows = Array.from(
    { length: Math.max(0, Math.min(12, count - page * 12)) },
    (_, i) => combinationAt(p, page * 12 + i),
  );
  const title = (id: string | null) =>
    id
      ? w.data.assets.find((a) => a.id === id)?.name || "Missing asset"
      : "Omitted";
  function edit(row: RenderRow, patch: Partial<RenderRow>) {
    update({
      rowOverrides: {
        ...p.rowOverrides,
        [row.id]: { ...p.rowOverrides[row.id], ...patch },
      },
    });
  }
  function chooser(
    row: RenderRow,
    key: "reactionId" | "demoId" | "musicId",
    kind: AssetKind,
  ) {
    return (
      <select
        aria-label={key}
        value={row[key] || ""}
        onChange={(e) => edit(row, { [key]: e.target.value || null })}
      >
        <option value="">Omitted</option>
        {w.data.assets
          .filter((a) => a.kind === kind)
          .map((a) => (
            <option value={a.id} key={a.id}>
              {a.name}
            </option>
          ))}
      </select>
    );
  }
  return (
    <>
      <div className="outline-top">
        <section className="card outline-summary">
          <span className="eyebrow">THE FINAL CHECK</span>
          <h2>
            Ready for the
            <br />
            <span>big picture?</span>
          </h2>
          <input
            className="outline-project-name"
            value={p.name}
            placeholder="Untitled project"
            aria-label="Project name"
            onChange={(e) => update({ name: e.target.value })}
          />
          <div className="output-formula">
            {[
              {
                n: effective.hooks.length || 1,
                label: effective.hooks.length ? "hooks" : "no hook",
              },
              {
                n: effective.reactionIds.length || 1,
                label: effective.reactionIds.length
                  ? "reactions"
                  : "no reaction",
              },
              {
                n: effective.demoIds.length || 1,
                label: effective.demoIds.length ? "demos" : "no demo",
              },
              {
                n:
                  effective.musicMode === "selected"
                    ? effective.musicIds.length || 1
                    : 1,
                label:
                  effective.musicMode === "random"
                    ? "random track"
                    : effective.musicMode === "none" ||
                        !effective.musicIds.length
                      ? "no music"
                      : "tracks",
              },
            ].map((v, i) => (
              <div className="formula-term" key={v.label}>
                {i > 0 && <span className="formula-times">×</span>}
                <strong>{v.n}</strong>
                <small>{v.label}</small>
              </div>
            ))}
          </div>
          <div className="outline-total">
            <span>Your next batch</span>
            <strong>
              {Math.max(0, count - excluded).toLocaleString()}{" "}
              <small>videos</small>
            </strong>
          </div>
        </section>
        <section className="card outline-settings">
          <h3>Fine-tune the finish.</h3>
          <div className="component-switches">
            {[
              { step: 3, label: "Hooks" },
              { step: 4, label: "Reactions" },
              { step: 5, label: "Demos" },
              { step: 6, label: "Music" },
            ].map((item) => (
              <label key={item.step}>
                <input
                  type="checkbox"
                  checked={!p.skipped.includes(item.step)}
                  onChange={() =>
                    update({
                      skipped: p.skipped.includes(item.step)
                        ? p.skipped.filter((i) => i !== item.step)
                        : [...p.skipped, item.step],
                    })
                  }
                />
                {item.label}
              </label>
            ))}
          </div>
          <RatioPicker
            label="Rendered video aspect ratio"
            value={p.composition.aspectRatio || "9:16"}
            onChange={(aspectRatio) =>
              update({ composition: { ...p.composition, aspectRatio } })
            }
          />
          <SpanControl
            label="Text / image hook spans"
            value={p.composition.hookSpan}
            onChange={(hookSpan) =>
              update({ composition: { ...p.composition, hookSpan } })
            }
          />
          <SpanControl
            label="Music track spans"
            value={p.composition.musicSpan}
            onChange={(musicSpan) =>
              update({ composition: { ...p.composition, musicSpan } })
            }
          />
          <div className="form-columns">
            <Field label="Hook style">
              <select
                value={p.composition.style}
                onChange={(e) =>
                  update({
                    composition: {
                      ...p.composition,
                      style: e.target.value as Composition["style"],
                    },
                  })
                }
              >
                {["Text", "Snapchat", "IMG", "Text Wall", "Green screen"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Frame fit">
              <select
                value={p.composition.fit}
                onChange={(e) =>
                  update({
                    composition: {
                      ...p.composition,
                      fit: e.target.value as Composition["fit"],
                    },
                  })
                }
              >
                <option value="cover">Fill & crop</option>
                <option value="contain">Fit with black bars</option>
              </select>
            </Field>
          </div>
          <p className="info-note">
            <Film size={14} /> 1080 × 1920 · 30 fps · H.264 + AAC
            <br />
            Reaction first. Product demo second. Timing is saved with each
            output.
          </p>
        </section>
      </div>
      <details className="card outline-details">
        <summary>Edit prompts & product information</summary>
        <div className="form-columns">
          <Field label="First-frame text-model instructions">
            <textarea
              rows={3}
              value={p.imagePrompt}
              onChange={(e) => update({ imagePrompt: e.target.value })}
            />
          </Field>
          <Field label="Fixed first-frame image instructions">
            <textarea
              rows={3}
              value={p.imageFixedInstructions ?? ""}
              onChange={(e) =>
                update({ imageFixedInstructions: e.target.value })
              }
            />
          </Field>
          <Field label="Reaction movement guidance">
            <textarea
              rows={3}
              value={p.videoPrompt}
              onChange={(e) => update({ videoPrompt: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Fixed reaction video instructions">
          <textarea
            rows={3}
            value={p.videoFixedInstructions ?? ""}
            onChange={(e) => update({ videoFixedInstructions: e.target.value })}
          />
        </Field>
        <VariationControl
          value={p.imageVariation ?? 50}
          onChange={(imageVariation) => update({ imageVariation })}
        />
        <div className="form-columns">
          <Field label="Text-to-image model">
            <select
              value={p.imageModel}
              onChange={(e) => update({ imageModel: e.target.value })}
            >
              {models
                .filter((m) => m.kind === "image")
                .map((m) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Product">
            <select
              value={p.productId}
              onChange={(e) => update({ productId: e.target.value })}
            >
              <option value="">No product</option>
              {w.data.products.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.internalName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {p.productId && (
          <Button onClick={() => setProductModal(true)}>
            Edit saved product
          </Button>
        )}
        <p className="info-note">
          Prompt changes apply to future generation batches. Your existing clips
          stay selected.
        </p>
        <h3>Edit hook text</h3>
        {p.hooks
          .filter((h) => h.text)
          .map((h) => (
            <Field
              label={
                w.data.products.find((product) => product.id === h.productId)
                  ?.externalName || "Hook"
              }
              key={h.id}
            >
              <textarea
                rows={2}
                value={h.text}
                onChange={(e) =>
                  update({
                    hooks: p.hooks.map((existing) =>
                      existing.id === h.id
                        ? { ...existing, text: e.target.value }
                        : existing,
                    ),
                  })
                }
              />
            </Field>
          ))}
      </details>
      {productModal && (
        <ProductModal
          product={w.data.products.find(
            (product) => product.id === p.productId,
          )}
          w={w}
          onSave={(product) => update({ productId: product.id })}
          onClose={() => setProductModal(false)}
        />
      )}
      <div className="section-heading outline-table-heading">
        <div>
          <h3>Every variation, accounted for.</h3>
          <p>
            Edit any pairing or timing below. Uncheck a row to leave it out.
          </p>
        </div>
        <span className="count-badge">
          {count.toLocaleString()} combinations
        </span>
      </div>
      <div className="outline-table-wrap">
        <table className="outline-table">
          <thead>
            <tr>
              <th aria-label="Include" />
              <th>HOOK</th>
              <th>REACTION CLIP</th>
              <th>PRODUCT DEMO</th>
              <th>MUSIC TRACK</th>
              <th>HOOK SPAN</th>
              <th>MUSIC SPAN</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr className={row.excluded ? "excluded" : ""} key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Include output ${page * 12 + i + 1}`}
                    checked={!row.excluded}
                    onChange={() => edit(row, { excluded: !row.excluded })}
                  />
                </td>
                <td>
                  <select
                    value={row.hookId || ""}
                    aria-label="Hook"
                    onChange={(e) =>
                      edit(row, { hookId: e.target.value || null })
                    }
                  >
                    <option value="">No hook</option>
                    {effective.hooks.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.text || `Image hook ${h.id.slice(0, 4)}`}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{chooser(row, "reactionId", "reaction")}</td>
                <td>{chooser(row, "demoId", "demo")}</td>
                <td>
                  {p.musicMode === "random" && !row.musicId ? (
                    <span className="muted-text">Random from selection</span>
                  ) : (
                    chooser(row, "musicId", "music")
                  )}
                </td>
                <td>
                  <select
                    aria-label="Hook span"
                    value={row.hookSpan || p.composition.hookSpan}
                    onChange={(e) =>
                      edit(row, { hookSpan: e.target.value as any })
                    }
                  >
                    {SPANS.map((s) => (
                      <option value={s.value} key={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    aria-label="Music span"
                    value={row.musicSpan || p.composition.musicSpan}
                    onChange={(e) =>
                      edit(row, { musicSpan: e.target.value as any })
                    }
                  >
                    {SPANS.map((s) => (
                      <option value={s.value} key={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          {page * 12 + 1}–{Math.min(count, (page + 1) * 12)} of{" "}
          {count.toLocaleString()} combinations
        </span>
        <Button
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={15} />
        </Button>
        <Button
          aria-label="Next page"
          disabled={(page + 1) * 12 >= count}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={15} />
        </Button>
      </div>
      {!effective.reactionIds.length && !effective.demoIds.length && (
        <p className="inline-warning">
          Select a reaction clip, product demo, or image hook before rendering.
          Other steps can stay skipped.
        </p>
      )}
    </>
  );
}
export function Status({ p, w, update, inspect }: Props) {
  const jobs = w.data.jobs.filter((j) => j.projectId === p.id),
    renders = jobs.filter((j) => j.kind === "render"),
    outputs = w.data.assets.filter(
      (a) => a.projectId === p.id && a.kind === "output",
    ),
    running = jobs.filter((j) => ["queued", "running"].includes(j.status)),
    failed = jobs.filter((j) => ["failed", "uncertain"].includes(j.status));
  async function download() {
    const blob = await request<Blob>(`/projects/${p.id}/download`);
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${p.name || "rendered-videos"}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return (
    <>
      <div className="status-overview">
        {[
          { label: "Final videos", value: outputs.length, icon: Film },
          { label: "In the pipeline", value: running.length, icon: Clock3 },
          {
            label: "Need attention",
            value: failed.length,
            icon: SlidersHorizontal,
          },
          { label: "Render batch total", value: renders.length, icon: Layers },
        ].map((item) => (
          <div className="card status-stat" key={item.label}>
            <span>
              <item.icon size={18} />
              {item.label}
            </span>
            <strong>{item.value.toString().padStart(2, "0")}</strong>
          </div>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h3>
            {running.length
              ? "A little magic in progress."
              : "Your final cuts."}
          </h3>
          <p>
            Results arrive here as they finish. Your jobs keep running when you
            close this tab.
          </p>
        </div>
        <Button
          disabled={!outputs.length}
          onClick={() => void w.act("Preparing download", download)}
        >
          <Download size={15} /> Download all
        </Button>
      </div>
      {outputs.length ? (
        <div className="asset-grid output-grid">
          {outputs.map((a) => (
            <AssetCard key={a.id} asset={a} onInspect={inspect} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            running.length
              ? "Your creative assembly line is running."
              : "The beginning of something good."
          }
          description={
            running.length
              ? "You can explore your libraries or start another project. We’ll keep everything here."
              : "Once you render your batch, each finished video will be ready to preview and download here."
          }
        >
          <Button onClick={() => update({ step: 7 })}>
            Review task outline <ArrowRight size={15} />
          </Button>
        </EmptyState>
      )}
      {jobs.length > 0 && (
        <section className="card job-list">
          <h3>Activity & job history</h3>
          {jobs.map((job) => (
            <div className="job-row" key={job.id}>
              <span className={`job-dot ${job.status}`} />
              <div className="job-details">
                <strong>{job.label}</strong>
                <small>
                  {job.error ||
                    `${job.kind} · ${new Date(job.createdAt).toLocaleString()}`}
                </small>
                {job.status === "running" && (
                  <div className="progress-track">
                    <i style={{ width: `${Math.max(3, job.progress)}%` }} />
                  </div>
                )}
              </div>
              <span className={`job-status ${job.status}`}>
                {job.status === "running" && job.progress
                  ? `${Math.round(job.progress)}%`
                  : job.status}
              </span>
              {["failed", "uncertain", "canceled"].includes(job.status) && (
                <button
                  className="icon-button"
                  aria-label={`Retry ${job.label}`}
                  title={
                    job.status === "uncertain"
                      ? "Check Siray for an existing charge before retrying"
                      : "Retry job"
                  }
                  onClick={() =>
                    void w.act("Retrying", () =>
                      request(`/jobs/${job.id}/retry`, { method: "POST" }),
                    )
                  }
                >
                  <RefreshCw size={15} />
                </button>
              )}
              {["queued", "running"].includes(job.status) && (
                <button
                  className="icon-button"
                  aria-label={`Cancel ${job.label}`}
                  onClick={() =>
                    void w.act("Canceling", () =>
                      request(`/jobs/${job.id}/cancel`, { method: "POST" }),
                    )
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
