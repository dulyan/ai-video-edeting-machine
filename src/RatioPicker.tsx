import type { Model } from "../shared/types.ts";
import { RATIOS, nativeRatio,ratioValue } from "../shared/ratios.ts";
import { Field } from "./components.tsx";
export function RatioPicker({
  value,
  onChange,
  model,
  nativeSize,
  label = "Aspect ratio",
}: {
  value: string;
  onChange: (ratio: string) => void;
  model?: Model;
  nativeSize?: unknown;
  label?: string;
}) {
  const selectedDimensions=typeof nativeSize==='string'&&/^\d+x\d+$/.test(nativeSize)?nativeSize.split('x').map(Number):undefined;
  const crops=selectedDimensions?Math.abs(selectedDimensions[0]/selectedDimensions[1]-ratioValue(value))>.002:model&&!nativeRatio(model,value);
  return (
    <Field
      label={label}
      hint={
        crops
          ? "The native generation size differs from this ratio. The saved result will be center-cropped to the selected ratio."
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
