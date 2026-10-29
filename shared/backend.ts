export function initialBackend(origin: string, stored: string | null, configured: string | undefined, dev: boolean) {
  const url = new URL(origin);
  // A built localhost interface must never inherit the Pages/VPS build address
  // or stale backend settings from a previous local installation.
  if (["127.0.0.1", "localhost"].includes(url.hostname) && !dev) return url.origin;
  return (stored || configured || (dev ? "http://127.0.0.1:3001" : "")).replace(/\/$/, "");
}
