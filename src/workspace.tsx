import { useState, useEffect, useRef, useCallback } from "react";
import type {
  AppState,
  Asset,
  AssetKind,
  Product,
  Project,
  PromptPreset,
} from "../shared/types.ts";
import { newProject } from "../shared/project.ts";
import { backendURL, configureBackend, request } from "./api.ts";
const empty = (): AppState => ({
  projects: [newProject()],
  products: [],
  assets: [],
  jobs: [],
});
function readState(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem("avem.workspace") || "null");
    return saved?.projects?.length ? saved : empty();
  } catch {
    return empty();
  }
}
export function useWorkspace() {
  const [data, setData] = useState<AppState>(readState),
    [connected, setConnected] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const current = useRef(data);
  current.current = data;
  const pending = useRef(new Map<string, Promise<unknown>>());
  const buffers = useRef(
    new Map<
      string,
      {
        patch: Partial<Project>;
        timer?: ReturnType<typeof setTimeout>;
        promise: Promise<void>;
        resolve: () => void;
      }
    >(),
  );
  const chains = useRef(new Map<string, Promise<unknown>>());
  useEffect(() => {
    localStorage.setItem(
      "avem.workspace",
      JSON.stringify({ ...data, jobs: [], assets: [] }),
    );
  }, [data]);
  const notify = useCallback((message: string) => {
    setNotice(message);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = useCallback(async () => {
    const state = await request<AppState>("/state");
    setData((prev) => ({
      ...state,
      projects: state.projects.map((p) =>
        pending.current.has(p.id)
          ? prev.projects.find((x) => x.id === p.id) || p
          : p,
      ),
    }));
  }, []);
  const sync = useCallback(async () => {
    const remote = await request<AppState>("/state");
    for (const product of current.current.products)
      if (!remote.products.some((p) => p.id === product.id))
        await request(`/products/${product.id}`, {
          method: "PUT",
          body: JSON.stringify(product),
        });
    for (const preset of current.current.presets || [])
      if (!remote.presets?.some((p) => p.id === preset.id))
        await request(`/presets/${preset.id}`, {
          method: "PUT",
          body: JSON.stringify(preset),
        });
    for (const p of current.current.projects)
      if (!remote.projects.some((x) => x.id === p.id))
        await request(`/projects/${p.id}`, {
          method: "PUT",
          body: JSON.stringify(p),
        });
    await refresh();
    setConnected(true);
  }, [refresh]);
  useEffect(() => {
    if (!backendURL) return;
    let alive = true;
    void request("/health")
      .then(async (h) => {
        if (!alive) return;
        if (!h.requiresPassword) {
          const auth = await request("/login", {
            method: "POST",
            body: JSON.stringify({ password: "" }),
          });
          configureBackend(backendURL, auth.token);
        }
        await sync();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sync]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      void refresh().catch((e) => {
        if (/Sign in/.test(e.message)) setConnected(false);
      });
    }, 4000);
    return () => clearInterval(timer);
  }, [connected, refresh]);
  function updateProject(id: string, patch: Partial<Project>) {
    setData((prev) => ({
      ...prev,
      projects: prev.projects.map((p) =>
        p.id === id
          ? { ...p, ...patch, updatedAt: new Date().toISOString() }
          : p,
      ),
    }));
    if (connected) {
      let buffer = buffers.current.get(id);
      if (!buffer) {
        let resolve!: () => void;
        const promise = new Promise<void>((done) => {
          resolve = done;
        });
        buffer = { patch: {}, promise, resolve };
        buffers.current.set(id, buffer);
      }
      Object.assign(buffer.patch, patch);
      clearTimeout(buffer.timer);
      pending.current.set(id, buffer.promise);
      const queued = buffer;
      buffer.timer = setTimeout(() => {
        buffers.current.delete(id);
        const previous = chains.current.get(id) || Promise.resolve();
        const task = previous
          .catch(() => {})
          .then(() =>
            request(`/projects/${id}`, {
              method: "PATCH",
              body: JSON.stringify(queued.patch),
            }),
          )
          .catch((e) => {
            notify(`Could not sync: ${e.message}. Your draft is kept locally.`);
            setConnected(false);
          })
          .finally(() => {
            queued.resolve();
            if (pending.current.get(id) === queued.promise)
              pending.current.delete(id);
            if (chains.current.get(id) === task) chains.current.delete(id);
          });
        chains.current.set(id, task);
      }, 500);
    }
  }
  async function addProject() {
    const p = newProject();
    setData((prev) => ({ ...prev, projects: [p, ...prev.projects] }));
    if (connected)
      await request(`/projects/${p.id}`, {
        method: "PUT",
        body: JSON.stringify(p),
      });
    return p;
  }
  async function saveProduct(product: Product) {
    if (connected)
      await request(`/products/${product.id}`, {
        method: "PUT",
        body: JSON.stringify(product),
      });
    setData((prev) => ({
      ...prev,
      products: [product, ...prev.products.filter((p) => p.id !== product.id)],
    }));
  }
  async function savePreset(preset: PromptPreset) {
    if (connected)
      await request(`/presets/${preset.id}`, {
        method: "PUT",
        body: JSON.stringify(preset),
      });
    setData((prev) => ({
      ...prev,
      presets: [
        preset,
        ...(prev.presets || []).filter((p) => p.id !== preset.id),
      ],
    }));
    notify("Prompt preset saved.");
  }
  async function upload(
    files: FileList | File[],
    kind: AssetKind,
    projectId: string,
  ) {
    if (!connected)
      throw new Error("Connect your backend in Settings to upload media.");
    const assets: Asset[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 100 * 1024 * 1024)
        throw new Error(`${file.name} exceeds 100 MB`);
      const form = new FormData();
      form.append("kind", kind);
      form.append("projectId", projectId);
      form.append("file", file);
      assets.push(
        await request<Asset>("/uploads", { method: "POST", body: form }),
      );
    }
    setData((prev) => ({ ...prev, assets: [...assets, ...prev.assets] }));
    return assets;
  }
  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      await action();
      if (connected) await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }
  async function generate(projectId: string, mode: string) {
    if (!connected)
      throw new Error(
        "Connect your backend and add a Siray key in Settings to generate.",
      );
    await pending.current.get(projectId);
    await request("/generate", {
      method: "POST",
      body: JSON.stringify({ projectId, mode }),
    });
    notify("Generation queued. You can keep working while it runs.");
  }
  async function render(projectId: string) {
    if (!connected)
      throw new Error("Connect your backend in Settings to render videos.");
    await pending.current.get(projectId);
    const result = await request("/render", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    });
    notify(`${result.count} videos queued for rendering.`);
  }
  return {
    data,
    connected,
    notice,
    busy,
    notify,
    refresh,
    sync,
    setConnected,
    updateProject,
    addProject,
    saveProduct,
    savePreset,
    upload,
    act,
    generate,
    render,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
