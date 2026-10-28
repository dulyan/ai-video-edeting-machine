import { useState, useEffect } from "react";
import { Loader2, Check, Image as ImageIcon } from "lucide-react";
import type { Job, Asset, PromptParts } from "../shared/types.ts";
import type { Workspace } from "./workspace.tsx";
import { AssetMedia, Button, Modal } from "./components.tsx";
import PromptContent from "./PromptContent.tsx";
import { request } from "./api.ts";
export default function GenerationProgress({
  batch,
  w,
  inspect,
  selectedIds,
  toggleAsset,
}: {
  batch: Job;
  w: Workspace;
  inspect: (asset: Asset) => void;
  selectedIds: string[];
  toggleAsset: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [fullPrompt, setFullPrompt] = useState<{
    prompt: string;
    parts?: PromptParts;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (batch.status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [batch.status]);
  const writing = (batch.promptRequests || []).filter((r) =>
    ["waiting", "streaming"].includes(r.status),
  );
  const prompts = batch.prompts || [],
    total = batch.targetCount || prompts.length;
  const children = w.data.jobs.filter(
    (j) => j.batchId === batch.batchId && j.id !== batch.id,
  );
  const saved = children.filter((j) => j.status === "completed").length;
  const promptDone = prompts.length === total && batch.status === "completed";
  const active =
    ["running", "queued"].includes(batch.status) ||
    children.some((j) => ["running", "queued"].includes(j.status));
  const pages = Math.max(1, Math.ceil(total / 12)),
    current = Math.min(page, pages - 1);
  return (
    <section
      className="generation-progress"
      aria-label="Live generation progress"
    >
      <div className="phase-summary" aria-live="polite">
        <div className={promptDone ? "phase-done" : "phase-active"}>
          <strong>1. Unique prompts</strong>
          <span>
            {prompts.length} / {total} ready
          </span>
          <progress max={total || 1} value={prompts.length} />
          <small>{batch.promptModel}</small>
          {batch.promptStartedAt && (
            <small>
              {batch.promptFinishedAt
                ? `Ready in ${Math.round((Date.parse(batch.promptFinishedAt) - Date.parse(batch.promptStartedAt)) / 1000)}s`
                : `Elapsed ${Math.max(0, Math.floor((now - Date.parse(batch.promptStartedAt)) / 1000))}s · up to 4 requests in parallel`}
            </small>
          )}
        </div>
        <div
          className={
            saved === total ? "phase-done" : promptDone ? "phase-active" : ""
          }
        >
          <strong>
            2. {batch.mode === "image" ? "Starting frames" : "Reaction clips"}
          </strong>
          <span>
            {saved} / {total} saved
          </span>
          <progress max={total || 1} value={saved} />
          <small>{batch.generationModel}</small>
        </div>
      </div>
      {!!writing.length && (
        <div className="prompt-request-grid">
          {writing.map((r) => (
            <div className="prompt-draft" key={r.id}>
              <strong>
                <Loader2 size={15} className="spin" /> Request {r.id} ·{" "}
                {r.status === "waiting" ? "Waiting for model" : "Writing"} ·{" "}
                {Math.max(
                  0,
                  Math.floor((now - Date.parse(r.startedAt)) / 1000),
                )}
                s
              </strong>
              {r.draftText && <p>{r.draftText}</p>}
            </div>
          ))}
        </div>
      )}
      {!writing.length && !promptDone && batch.draftText && (
        <div className="prompt-draft">
          <strong>
            <Loader2 size={15} className="spin" /> Writing prompt{" "}
            {prompts.length + 1}
          </strong>
          <p>{batch.draftText}</p>
        </div>
      )}
      {batch.error && <div className="inline-error">{batch.error}</div>}
      <div className="batch-actions">
        {["failed", "canceled", "uncertain"].includes(batch.status) && (
          <Button
            disabled={!!w.busy}
            onClick={() =>
              void w.act("Resuming prompt generation", () =>
                request(`/jobs/${batch.id}/retry`, { method: "POST" }),
              )
            }
          >
            Resume prompt generation
          </Button>
        )}
        {active && (
          <Button
            onClick={() =>
              void w.act("Canceling batch", async () => {
                for (const job of [batch, ...children].filter((j) =>
                  ["running", "queued"].includes(j.status),
                ))
                  await request(`/jobs/${job.id}/cancel`, { method: "POST" });
              })
            }
          >
            Cancel batch
          </Button>
        )}
      </div>
      <div className="generation-progress-grid">
        {Array.from(
          { length: Math.min(12, total - current * 12) },
          (_, offset) => {
            const index = current * 12 + offset,
              child = children.find((j) => j.sequence === index + 1),
              asset = w.data.assets.find((a) => a.id === child?.outputId);
            return (
              <article className="prompt-result" key={index}>
                <header>
                  <strong>#{index + 1}</strong>
                  <span>
                    {prompts[index] ? (
                      <>
                        <Check size={14} /> Prompt ready
                      </>
                    ) : index === prompts.length &&
                      batch.status === "running" ? (
                      <>
                        <Loader2 size={14} className="spin" /> Writing
                      </>
                    ) : (
                      "Waiting for prompt"
                    )}
                  </span>
                </header>
                <p className="unique-prompt">
                  {batch.generatedDescriptions?.[index] ||
                    prompts[index] ||
                    (index === prompts.length ? batch.draftText : "") ||
                    "The complete unique prompt will appear here."}
                </p>
                {prompts[index] && (
                  <Button
                    className="full-prompt-button"
                    onClick={() =>
                      setFullPrompt({
                        prompt: prompts[index],
                        parts:
                          child?.promptParts ||
                          asset?.promptParts ||
                          (batch.fixedInstructions !== undefined &&
                          batch.generatedDescriptions?.[index] !== undefined
                            ? {
                                fixedInstructions: batch.fixedInstructions,
                                generatedDescription:
                                  batch.generatedDescriptions[index],
                              }
                            : undefined),
                      })
                    }
                  >
                    View full {batch.mode === "video" ? "video" : "image"}{" "}
                    prompt
                  </Button>
                )}
                {asset ? (
                  <>
                    <button
                      className="result-preview"
                      onClick={() => inspect(asset)}
                      aria-label={`Preview ${asset.name}`}
                    >
                      <AssetMedia asset={asset} />
                    </button>
                    <div className="result-status saved">
                      <Check size={15} /> Saved to{" "}
                      {batch.mode === "image" ? "image" : "video"} library
                    </div>
                    <Button onClick={() => toggleAsset(asset.id)}>
                      {selectedIds.includes(asset.id)
                        ? "Selected"
                        : `Use this ${batch.mode === "image" ? "frame" : "clip"}`}
                    </Button>
                  </>
                ) : (
                  <div className="result-pending">
                    <ImageIcon size={24} />
                    <span>
                      {child?.status === "failed" ||
                      child?.status === "uncertain"
                        ? child.error
                        : child?.status === "running"
                          ? "Generating media…"
                          : child?.status === "canceled"
                            ? "Canceled"
                            : promptDone
                              ? "Queued for generation"
                              : "Waiting for all prompts"}
                    </span>
                    {child && ["running", "queued"].includes(child.status) && (
                      <progress max={100} value={child.progress} />
                    )}
                  </div>
                )}
                {child &&
                  ["failed", "uncertain", "canceled"].includes(
                    child.status,
                  ) && (
                    <Button
                      onClick={() =>
                        void w.act("Retrying generation", () =>
                          request(`/jobs/${child.id}/retry`, {
                            method: "POST",
                          }),
                        )
                      }
                    >
                      Retry this {batch.mode === "image" ? "frame" : "clip"}
                    </Button>
                  )}
              </article>
            );
          },
        )}
      </div>
      {pages > 1 && (
        <div className="batch-pagination">
          <Button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span>
            {current + 1} / {pages}
          </span>
          <Button
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {fullPrompt && (
        <Modal title="Full image prompt" onClose={() => setFullPrompt(null)}>
          <PromptContent prompt={fullPrompt.prompt} parts={fullPrompt.parts} />
        </Modal>
      )}
    </section>
  );
}
