import type { PromptParts } from "./types.ts";
export function assembleImagePrompt(parts: PromptParts): string {
  const base = parts.fixedInstructions
    ? parts.fixedInstructions + "\n\n" + parts.generatedDescription
    : parts.generatedDescription;
  return parts.enforcedInstructions
    ? base + "\n\n" + parts.enforcedInstructions
    : base;
}
