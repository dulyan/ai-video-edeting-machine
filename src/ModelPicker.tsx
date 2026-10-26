import { useEffect, useState } from "react";
import type { Model, ModelField, Project } from "../shared/types.ts";
import { MODELS } from "../shared/models.ts";
import { fieldDefault, isAutoFrameField } from "../shared/catalog.ts";
import { request } from "./api.ts";
import { Field } from "./components.tsx";
import type { Workspace } from "./workspace.tsx";

export function useModels(connected: boolean) {
  const [models, setModels] = useState(MODELS);
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    const load = () => {
      void request("/models")
        .then((r) => {
          if (alive) setModels(r.models);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("models-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("models-changed", load);
    };
  }, [connected]);
  return { models, setModels };
}
export function ModelPicker({
  models,
  value,
  onChange,
  label,
  allowDefault = false,
}: {
  models: Model[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  allowDefault?: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = models.filter((m) =>
    `${m.name} ${m.id} ${m.provider} ${m.tag}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected = models.find((m) => m.id === value);
  const visible =
    selected && !filtered.includes(selected)
      ? [selected, ...filtered]
      : filtered;
  const groups = [...new Set(visible.map((m) => m.tag || m.kind))];
  return (
    <Field label={label}>
      <div className="model-picker">
        <input
          type="search"
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder={`Search ${models.length} models…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {allowDefault && <option value="">Workspace default</option>}
          {value && !selected && (
            <option value={value}>{value} · saved model</option>
          )}
          {groups.map((group) => (
            <optgroup key={group} label={group.replaceAll("-", " ")}>
              {visible
                .filter((m) => (m.tag || m.kind) === group)
                .map((m) => (
                  <option key={m.id} value={m.id} disabled={m.active === false}>
                    {m.name}
                    {m.active === false ? " · unavailable for this key" : ""}
                  </option>
                ))}
            </optgroup>
          ))}
          {!visible.length && <option disabled>No matching models</option>}
        </select>
      </div>
    </Field>
  );
}

export function ModelOptions({
  model,
  p,
  w,
  update,
  autoFrame,
}: {
  model?: Model;
  p: Project;
  w: Workspace;
  update: (patch: Partial<Project>) => void;
  autoFrame: boolean;
}) {
  if (!model) return null;
  const inputs = p.modelInputs?.[model.id] || {};
  const fields = Object.entries(model.schema?.properties || {}).filter(
    ([name, field]) =>
      ![
        "model",
        "prompt",
        "seed",
        "duration",
        "seconds",
        "n",
        "num_images",
        "num_outputs",
        "enable_sequential",
      ].includes(name) &&
      !(autoFrame && isAutoFrameField(name) && field.type !== "array"),
  );
  const required = fields.filter(([name]) =>
    model.schema?.required?.includes(name),
  );
  const optional = fields.filter(
    ([name]) => !model.schema?.required?.includes(name),
  );
  function patch(name: string, value: unknown) {
    update({
      modelInputs: {
        ...p.modelInputs,
        [model!.id]: { ...inputs, [name]: value },
      },
    });
  }
  function control([name, field]: [string, ModelField]) {
    const value =
      inputs[name] ??
      (model!.schema?.required?.includes(name)
        ? fieldDefault(name, field)
        : undefined);
    const label =
      autoFrame && isAutoFrameField(name) && field.type === "array"
        ? "Additional reference images"
        : name.replaceAll("_", " ");
    const media =
      /image|video|audio/.test(String(field["x-format"] || name)) &&
      !field.enum &&
      !["boolean", "integer", "number"].includes(field.type || "");
    const mediaType = /video/.test(name)
      ? "video"
      : /audio/.test(name)
        ? "audio"
        : "image";
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const hint =
      autoFrame && isAutoFrameField(name) && field.type === "array"
        ? `The selected first frame is added automatically.${field.minItems && field.minItems > 1 ? ` Add at least ${field.minItems - 1} more reference(s).` : ""}`
        : field.description?.toLowerCase() === label.toLowerCase()
          ? undefined
          : field.description;
    return (
      <Field key={name} label={label} hint={hint}>
        {field.enum ? (
          <select
            aria-label={label}
            value={value === undefined ? "" : String(value)}
            onChange={(e) =>
              patch(
                name,
                field.enum!.find((v) => String(v) === e.target.value),
              )
            }
          >
            {!model!.schema?.required?.includes(name) && (
              <option value="">Provider default</option>
            )}
            {field.enum.map((v) => (
              <option key={String(v)} value={String(v)}>
                {String(v)}
              </option>
            ))}
          </select>
        ) : field.type === "boolean" ? (
          <select
            value={value === undefined ? "" : String(value)}
            onChange={(e) =>
              patch(
                name,
                e.target.value === "" ? undefined : e.target.value === "true",
              )
            }
          >
            <option value="">Provider default</option>
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        ) : field.type === "integer" || field.type === "number" ? (
          <input
            type="number"
            min={field.minimum}
            max={field.maximum}
            step={field.type === "integer" ? 1 : "any"}
            value={value === undefined ? "" : Number(value)}
            onChange={(e) =>
              patch(
                name,
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
          />
        ) : (
          <textarea
            key={`${model!.id}-${name}-${JSON.stringify(value)}`}
            rows={field.type === "object" ? 4 : 2}
            defaultValue={
              Array.isArray(value)
                ? value.join("\n")
                : typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : String(value ?? "")
            }
            placeholder={
              media
                ? "Paste a public URL, choose a library asset, or upload below"
                : field.type === "object"
                  ? "JSON object"
                  : field.type === "array"
                    ? "One value per line"
                    : ""
            }
            onBlur={(e) => {
              try {
                patch(
                  name,
                  field.type === "object"
                    ? JSON.parse(e.target.value || "{}")
                    : field.type === "array"
                      ? field.items?.type === "object"
                        ? JSON.parse(e.target.value || "[]")
                        : e.target.value
                            .split("\n")
                            .map((v) => v.trim())
                            .filter(Boolean)
                      : e.target.value,
                );
              } catch {
                w.notify(`Enter valid JSON for ${label}.`);
              }
            }}
          />
        )}
        {media && (
          <div className="model-reference">
            <select
              aria-label={`Choose ${label} from library`}
              value=""
              onChange={(e) => {
                if (e.target.value)
                  patch(
                    name,
                    field.type === "array"
                      ? [...values, e.target.value]
                      : e.target.value,
                  );
              }}
            >
              <option value="">Choose from library…</option>
              {w.data.assets
                .filter((a) => a.mime.startsWith(mediaType + "/"))
                .map((a) => (
                  <option key={a.id} value={`asset:${a.id}`}>
                    {a.name}
                  </option>
                ))}
            </select>
            <input
              type="file"
              aria-label={`Upload ${label}`}
              accept={`${mediaType}/*`}
              multiple={field.type === "array"}
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                void w.act("Uploading reference", async () => {
                  const assets = await w.upload(
                    files,
                    mediaType === "image"
                      ? "image"
                      : mediaType === "video"
                        ? "reaction"
                        : "music",
                    p.id,
                  );
                  patch(
                    name,
                    field.type === "array"
                      ? [...values, ...assets.map((a) => "asset:" + a.id)]
                      : "asset:" + assets[0].id,
                  );
                });
              }}
            />
            {!!values.length && (
              <small>
                {values
                  .map((v) =>
                    typeof v === "string" && v.startsWith("asset:")
                      ? w.data.assets.find((a) => a.id === v.slice(6))?.name ||
                        "Library asset"
                      : String(v).slice(0, 50),
                  )
                  .join(", ")}
              </small>
            )}
            {!!values.length && (
              <button
                className="text-button"
                onClick={() => patch(name, field.type === "array" ? [] : "")}
              >
                Clear references
              </button>
            )}
          </div>
        )}
      </Field>
    );
  }
  if (!Object.keys(model.schema?.properties || {}).length)
    return (
      <Field
        label="Model parameters (JSON)"
        hint="Optional parameters for this newly listed model, as documented by Siray."
      >
        <textarea
          rows={3}
          key={model.id}
          defaultValue={JSON.stringify(inputs, null, 2)}
          onBlur={(e) => {
            try {
              const value = JSON.parse(e.target.value || "{}");
              if (!value || Array.isArray(value) || typeof value !== "object")
                throw new Error();
              update({ modelInputs: { ...p.modelInputs, [model.id]: value } });
            } catch {
              w.notify("Model parameters must be a valid JSON object.");
            }
          }}
        />
      </Field>
    );
  return (
    <div className="model-options">
      {required.map(control)}
      {!!optional.length && (
        <details>
          <summary>Additional model settings</summary>
          <div>{optional.map(control)}</div>
        </details>
      )}
    </div>
  );
}
