import type { Model, Project } from "../shared/types.ts";
import {
  supportsFreeze,
  endFrameField,
  cfgField,
  cfgBaseline,
  WAN_I2V,
} from "../shared/freeze-lips.ts";
export default function FreezeLipsControls({
  model,
  p,
  update,
}: {
  model?: Model;
  p: Project;
  update: (patch: Partial<Project>) => void;
}) {
  if (!model || !supportsFreeze(model)) return null;
  const enabled = p.videoFreezeLips ?? true;
  const end = endFrameField(model);
  const cfg = cfgField(model);
  const baseline = cfgBaseline(model);
  const field = cfg ? model.schema?.properties?.[cfg] : undefined;
  const hint =
    "Prevents the model from adding unwanted mouth movements or fake speech animation.";
  function setEnabled(checked: boolean) {
    update({
      videoFreezeLips: checked,
      ...(checked && model!.id === WAN_I2V && cfg && baseline !== undefined
        ? {
            modelInputs: {
              ...p.modelInputs,
              [model!.id]: { ...p.modelInputs?.[model!.id], [cfg]: baseline },
            },
          }
        : {}),
    });
  }
  return (
    <section
      className="freeze-lips-controls"
      aria-label="Lip movement controls"
    >
      <label className="freeze-toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        <strong>Freeze Lips / No Talking</strong>
        <span className="control-help" title={hint} aria-label={hint}>
          ?
        </span>
      </label>
      <p className="muted-text">{hint}</p>
      {enabled && !model.schema?.properties?.negative_prompt && (
        <p className="muted-text">
          Siray has no negative-prompt field for this model; avoidance terms are
          included in the shared prompt.
        </p>
      )}
      {model.id === WAN_I2V &&
        (cfg && field ? (
          <label className="field">
            <span className="field-label">
              Guidance Scale / CFG:{" "}
              {enabled
                ? baseline
                : Number(
                    p.modelInputs?.[model.id]?.[cfg] ?? field.default ?? 3,
                  )}
            </span>
            <input
              aria-label="Guidance Scale / CFG"
              type="range"
              min={field.minimum ?? 0}
              max={field.maximum ?? 10}
              step={field.type === "integer" ? 1 : 0.1}
              disabled={enabled}
              value={
                enabled
                  ? baseline
                  : Number(
                      p.modelInputs?.[model.id]?.[cfg] ?? field.default ?? 3,
                    )
              }
              onChange={(e) =>
                update({
                  modelInputs: {
                    ...p.modelInputs,
                    [model.id]: {
                      ...p.modelInputs?.[model.id],
                      [cfg]: Number(e.target.value),
                    },
                  },
                })
              }
            />
          </label>
        ) : (
          <p className="muted-text">
            CFG is not exposed by Siray for this model.
          </p>
        ))}
      <label className="freeze-toggle">
        <input
          aria-label="Use starting frame as end frame"
          type="checkbox"
          disabled={!end}
          checked={!!end && (p.videoMatchEndFrame ?? true)}
          onChange={(e) => update({ videoMatchEndFrame: e.target.checked })}
        />
        Use starting frame as end frame
      </label>
      <p className="muted-text">
        {end
          ? "Each selected starting frame is also sent as its own end frame."
          : "Siray does not expose an end-frame input for this model."}
      </p>
    </section>
  );
}
