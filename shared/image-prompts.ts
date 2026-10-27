import type { PromptParts } from "./types.ts";
export function assembleImagePrompt(parts: PromptParts): string {
  return parts.fixedInstructions
    ? parts.fixedInstructions + "\n\n" + parts.generatedDescription
    : parts.generatedDescription;
}
export function variationLabel(value: number) {
  return value < 34 ? "Restrained" : value < 67 ? "Balanced" : "Exploratory";
}
