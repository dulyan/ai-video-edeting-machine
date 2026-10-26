import { MODELS } from "../shared/models.ts";
import { normalizeCatalog } from "../shared/catalog.ts";
import type { Model } from "../shared/types.ts";
import { getSecret } from "./store.ts";
import { siray } from "./siray.ts";
let catalog: Model[] = MODELS,
  expires = 0,
  inflight: Promise<Model[]> | undefined;
export function invalidateCatalog() {
  expires = 0;
}
export async function getCatalog(): Promise<Model[]> {
  if (Date.now() < expires) return catalog;
  if (inflight) return inflight;
  inflight = (async () => {
    let publicModels = MODELS;
    try {
      const response = await fetch(
        "https://api-gateway.siray.ai/api/model-verse/models",
        { signal: AbortSignal.timeout(30000) },
      );
      if (!response.ok) throw new Error("Catalog unavailable");
      const data = (await response.json()) as any;
      const normalized = normalizeCatalog(data.data || []);
      if (normalized.length) publicModels = normalized;
    } catch {
      /* Use checked-in catalog during a provider outage. */
    }
    if (getSecret("siray")) {
      const result = await siray("/v1/models");
      const entries: any[] = result.data || [];
      const byId = new Map(publicModels.map((m) => [m.id, m]));
      for (const m of normalizeCatalog(entries))
        if (!byId.has(m.id)) byId.set(m.id, m);
      const available = new Map(
        entries.map((m) => [m.id, m.status !== "retired"]),
      );
      catalog = [...byId.values()].map((m) => ({
        ...m,
        active: available.get(m.id) === true,
      }));
    } else catalog = publicModels;
    expires = Date.now() + 10 * 60 * 1000;
    return catalog;
  })().finally(() => {
    inflight = undefined;
  });
  return inflight;
}
