import { useId } from "react";
import { Field } from "./components.tsx";
import { variationLabel } from "../shared/image-prompts.ts";
export default function VariationControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field
      label="Variation"
      hint="Controls how broadly the invented details differ. Every value still requires highly specific, detailed descriptions consistent with the fixed instructions."
    >
      <div className="variation-control">
        <output htmlFor={id}>
          {value} / 100 · {variationLabel(value)}
        </output>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Variation"
          aria-valuetext={`${value} out of 100, ${variationLabel(value)}`}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div>
          <span>Restrained differences</span>
          <span>Broader invention</span>
        </div>
      </div>
    </Field>
  );
}
