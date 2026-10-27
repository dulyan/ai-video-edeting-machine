let active = 0;
const waiting = new Set<() => void>();
export async function textSlot(signal?: AbortSignal) {
  while (active >= 4) {
    if (signal?.aborted) throw signal.reason;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        waiting.delete(wake);
        signal?.removeEventListener("abort", abort);
      };
      const wake = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(signal?.reason);
      };
      waiting.add(wake);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  if (signal?.aborted) throw signal.reason;
  active++;
  return () => {
    active--;
    waiting.values().next().value?.();
  };
}
