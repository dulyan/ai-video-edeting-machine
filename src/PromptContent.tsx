import { formatPoses } from "../shared/reference-poses.ts";
import { useState } from "react";
import type { PromptParts } from "../shared/types.ts";
export default function PromptContent({
  prompt,
  parts,
}: {
  prompt: string;
  parts?: PromptParts;
}) {
  const [copied, setCopied] = useState("");
  return (
    <div className="prompt-content">
      {parts ? (
        <>
          {parts.fixedInstructions && (
            <section className="prompt-section fixed">
              <h3>
                Fixed instructions <small>Copied verbatim</small>
              </h3>
              <pre aria-label="Fixed instructions verbatim">
                {parts.fixedInstructions}
              </pre>
            </section>
          )}
          <section className="prompt-section generated">
            <h3>
              {parts.enforcedInstructions
                ? "Video instructions"
                : "Generated description"}
            </h3>
            <pre>{parts.generatedDescription}</pre>
          </section>
          {parts.enforcedInstructions && (
            <section className="prompt-section">
              <h3>
                Reaction requirements <small>Applied by the app</small>
              </h3>
              <pre>{parts.enforcedInstructions}</pre>
            </section>
          )}
          {formatPoses(parts.referencePoses) && (
            <details className="exact-prompt">
              <summary>Reference poses used as inspiration</summary>
              <pre>{formatPoses(parts.referencePoses)}</pre>
              <p>
                The text model used this list to describe the pose. The list
                itself is not appended to the image prompt.
              </p>
            </details>
          )}
          <details className="exact-prompt">
            <summary>Exact combined prompt</summary>
            <textarea
              aria-label="Exact combined prompt"
              readOnly
              rows={8}
              value={prompt}
            />
          </details>
        </>
      ) : (
        <pre className="legacy-prompt">{prompt}</pre>
      )}
      <div className="prompt-copy">
        <button
          type="button"
          className="button black"
          onClick={() => {
            void navigator.clipboard
              .writeText(prompt)
              .then(() => setCopied("Copied full prompt"))
              .catch(() =>
                setCopied(
                  "Copy unavailable. Select the exact prompt text to copy.",
                ),
              );
          }}
        >
          Copy full prompt
        </button>
        <span role="status">{copied}</span>
      </div>
    </div>
  );
}
