import { Field, Button } from "./components.tsx";
import { poseEntries } from "../shared/reference-poses.ts";
import type { ReferencePoses as Poses } from "../shared/reference-poses.ts";
export default function ReferencePoses({
  value,
  onChange,
}: {
  value?: Poses;
  onChange: (poses: string[]) => void;
}) {
  const saved = poseEntries(value);
  const poses = saved.length ? saved : [""];
  return (
    <section className="reference-poses-editor" aria-label="Reference poses">
      <h3>Reference poses</h3>
      <p className="muted-text">
        One pose per box. Describe its expression, emotional intent, posture,
        and action. Each pose can contain multiple lines.
      </p>
      {poses.map((pose, index) => (
        <div className="reference-pose-entry" key={index}>
          <Field label={"Reference pose " + (index + 1)}>
            <textarea
              aria-label={"Reference pose " + (index + 1)}
              rows={4}
              maxLength={Math.max(
                0,
                20000 -
                  poses.reduce(
                    (sum, text, i) => sum + (i === index ? 0 : text.length),
                    0,
                  ),
              )}
              value={pose}
              placeholder="Describe one reference pose."
              onChange={(e) =>
                onChange(
                  poses.map((text, i) => (i === index ? e.target.value : text)),
                )
              }
            />
          </Field>
          <Button
            variant="ghost"
            onClick={() => onChange(poses.filter((_, i) => i !== index))}
            aria-label={"Remove reference pose " + (index + 1)}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        disabled={poses.length >= 1000}
        onClick={() => onChange([...poses, ""])}
      >
        Add pose
      </Button>
    </section>
  );
}
