import type { Model } from "../shared/types.ts";
import { RATIOS, nativeRatio } from "../shared/ratios.ts";
import { Field } from "./components.tsx";
export function RatioPicker({
  value,
  onChange,
  model,
  label = "Aspect ratio",
}: {
  value: string;
  onChange: (ratio: string) => void;
  model?: Model;
  label?: string;
}) {
  return (
    <Field
      label={label}
      hint={
        model && !nativeRatio(model, value)
          ? "This model does not expose this ratio directly. The saved result will be center-cropped to the selected ratio."
          : undefined
      }
    >
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {RATIOS.map((r) => (
          <option key={r} value={r}>
            {r}
            {r === "9:16"
              ? " · Portrait"
              : r === "16:9"
                ? " · Landscape"
                : r === "1:1"
                  ? " · Square"
                  : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
