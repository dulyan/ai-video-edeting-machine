import snapshot from "./catalog-snapshot.json" with { type: "json" };
import { normalizeCatalog } from "./catalog.ts";
export const MODELS = normalizeCatalog(snapshot);
