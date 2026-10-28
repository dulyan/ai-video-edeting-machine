import { useState, useEffect, useRef, useCallback } from "react";
import type { AppState, Asset, AssetKind, Product, PromptPreset } from "../shared/types.ts";
import { newProject } from "../shared/project.ts";
import { backendURL, configureBackend, request, watchState } from "./api.ts";
import { WorkspaceDrafts, type ProjectUpdate, type SavedDrafts } from "./workspace-sync.ts";

function readState(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem("avem.workspace") || "null");
    if (saved?.projects?.length) return saved;
  } catch { /* A damaged browser cache must not prevent opening the app. */ }
  return { projects: [newProject()], products: [], assets: [], jobs: [] };
}
function readDrafts() {
  try { return JSON.parse(localStorage.getItem("avem.drafts") || "null") as SavedDrafts; }
  catch { return undefined; }
}

export function useWorkspace() {
  const [data, setData] = useState<AppState>(readState),
    [connected, setConnected] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const current = useRef(data), online = useRef(false);
  const drafts = useRef<WorkspaceDrafts | null>(null);
  if (!drafts.current) {
    drafts.current = new WorkspaceDrafts(readDrafts());
    for (const project of data.projects) drafts.current.localIds.add(project.id);
  }
  const edits = drafts.current;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chains = useRef(new Map<string, Promise<void>>());
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((message: string) => setNotice(message), []);
  const setConnection = useCallback((value: boolean) => {
    online.current = value;
    setConnected(value);
    if (!value) {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    }
  }, []);
  const persist = useCallback(() => {
    clearTimeout(persistTimer.current);
    try {
      const { projects, products, presets } = current.current;
      localStorage.setItem("avem.workspace", JSON.stringify({ projects, products, presets, assets: [], jobs: [] }));
      localStorage.setItem("avem.drafts", JSON.stringify(edits.serialize()));
    } catch {
      notify("Browser draft storage is full or unavailable. Keep this tab open and connect the backend to save changes.");
    }
  }, [edits, notify]);
  const commit = useCallback((update: (previous: AppState) => AppState) => {
    const next = update(current.current);
    if (next !== current.current) {
      current.current = next;
      setData(next);
    }
  }, []);
  // Persist editable records, not every live token/job event. Flush on pagehide.
  useEffect(() => {
    persistTimer.current = setTimeout(persist, 300);
    return () => clearTimeout(persistTimer.current);
  }, [data.projects, data.products, data.presets, persist]);
  useEffect(() => {
    window.addEventListener("pagehide", persist);
    return () => window.removeEventListener("pagehide", persist);
  }, [persist]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  const acceptState = useCallback((state: AppState) => {
    commit((previous) => edits.accept(previous, state));
  }, [commit, edits]);
  const refresh = useCallback(async () => {
    acceptState(await request<AppState>("/state"));
  }, [acceptState]);

  const flushProject = useCallback(async (id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const previous = chains.current.get(id) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      let wrote = false;
      while (edits.hasUnsaved(id)) {
        const sent = edits.capture(id);
        const result = await request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(sent.patch) });
        edits.acknowledge(id, sent, result.revision);
        wrote = true;
      }
      // The SSE carrying our write can arrive before its HTTP acknowledgement.
      // Reconcile once after the write so overlays/save status do not linger.
      if (wrote) await refresh();
      persist();
    });
    chains.current.set(id, task);
    try { await task; }
    finally { if (chains.current.get(id) === task) chains.current.delete(id); }
  }, [edits, persist, refresh]);

  const sync = useCallback(async () => {
    const remote = await request<AppState>("/state");
    // Retain unsynced local products/presets before accepting the remote snapshot.
    const local = current.current;
    acceptState(remote);
    for (const product of local.products)
      if (!remote.products.some((p) => p.id === product.id)) {
        const result = await request(`/products/${product.id}`, { method: "PUT", body: JSON.stringify(product) });
        edits.observeWrite(result.revision);
      }
    for (const preset of local.presets || [])
      if (!remote.presets?.some((p) => p.id === preset.id)) {
        const result = await request(`/presets/${preset.id}`, { method: "PUT", body: JSON.stringify(preset) });
        edits.observeWrite(result.revision);
      }
    for (const kind of ["products", "presets"] as const)
      for (const sent of edits.pendingRecords(kind)) {
        const result = await request(`/${kind}/${sent.value.id}`, { method: "PUT", body: JSON.stringify(sent.value) });
        edits.acknowledgeRecord(kind, sent, result.revision);
      }
    for (const project of current.current.projects) {
      if (!remote.projects.some((p) => p.id === project.id)) {
        const result = await request(`/projects/${project.id}`, { method: "PUT", body: JSON.stringify(project) });
        edits.observeWrite(result.revision);
      }
    }
    // Importing only missing projects used to discard offline edits to existing ones.
    for (const id of edits.ids()) await flushProject(id);
    await refresh();
    setConnection(true);
    for (const id of edits.ids()) if (edits.hasUnsaved(id)) await flushProject(id);
  }, [acceptState, edits, flushProject, refresh, setConnection]);

  useEffect(() => {
    if (!backendURL) return;
    let alive = true;
    void request("/health").then(async (health) => {
      if (!alive) return;
      if (!health.requiresPassword) {
        const auth = await request("/login", { method: "POST", body: JSON.stringify({ password: "" }) });
        if (!alive) return;
        configureBackend(backendURL, auth.token);
      }
      if (alive) await sync();
    }).catch((e) => {
      if (alive) notify(/Sign in/.test(e.message)
        ? "Your workspace sign-in expired. Open Settings and reconnect."
        : "Could not connect to the backend. Check the connection in Settings.");
    });
    return () => { alive = false; };
  }, [sync, notify]);
  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    void (async () => {
      while (!controller.signal.aborted) {
        try { await watchState(acceptState, controller.signal); }
        catch (e) {
          if (controller.signal.aborted) return;
          if (/Sign in/.test((e as Error).message)) {
            notify("Your workspace sign-in expired. Open Settings and reconnect.");
            setConnection(false);
            return;
          }
          try { await refresh(); } catch { /* Reconnect below. */ }
        }
        if (!controller.signal.aborted) await new Promise<void>((resolve) => {
          const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); };
          const timer = setTimeout(done, 2000);
          controller.signal.addEventListener("abort", done, { once: true });
        });
      }
    })();
    return () => controller.abort();
  }, [connected, refresh, acceptState, notify, setConnection]);

  function updateProject(id: string, update: ProjectUpdate) {
    const project = current.current.projects.find((p) => p.id === id);
    if (!project) return;
    const patch = typeof update === "function" ? update(project) : update;
    edits.edit(id, patch);
    commit((previous) => ({ ...previous, projects: previous.projects.map((p) => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p) }));
    if (online.current) {
      clearTimeout(timers.current.get(id));
      timers.current.set(id, setTimeout(() => {
        if (!online.current) return;
        void flushProject(id).catch((e) => {
          persist();
          notify(`Could not sync: ${e.message}. Your draft is kept locally. Reconnect in Settings to retry.`);
          setConnection(false);
        });
      }, 500));
    }
  }
  async function addProject() {
    const project = newProject();
    edits.localIds.add(project.id);
    commit((previous) => ({ ...previous, projects: [project, ...previous.projects] }));
    if (online.current) {
      const result = await request(`/projects/${project.id}`, { method: "PUT", body: JSON.stringify(project) });
      edits.observeWrite(result.revision);
      await refresh();
    }
    return project;
  }
  async function saveProduct(product: Product) {
    const sent = edits.editRecord("products", product);
    commit((previous) => ({ ...previous, products: [product, ...previous.products.filter((p) => p.id !== product.id)] }));
    if (online.current) {
      const result = await request(`/products/${product.id}`, { method: "PUT", body: JSON.stringify(product) });
      edits.acknowledgeRecord("products", sent, result.revision);
    }
  }
  async function savePreset(preset: PromptPreset) {
    const sent = edits.editRecord("presets", preset);
    commit((previous) => ({ ...previous, presets: [preset, ...(previous.presets || []).filter((p) => p.id !== preset.id)] }));
    if (online.current) {
      const result = await request(`/presets/${preset.id}`, { method: "PUT", body: JSON.stringify(preset) });
      edits.acknowledgeRecord("presets", sent, result.revision);
    }
    notify("Prompt preset saved.");
  }
  async function upload(files: FileList | File[], kind: AssetKind, projectId: string) {
    if (!online.current) throw new Error("Connect your backend in Settings to upload media.");
    const assets: Asset[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} exceeds 100 MB`);
      const form = new FormData();
      form.append("kind", kind); form.append("projectId", projectId); form.append("file", file);
      const { revision, ...asset } = await request<Asset & { revision?: number }>("/uploads", { method: "POST", body: form });
      edits.observeWrite(revision);
      assets.push(asset);
      // SSE may have already delivered this upload.
      commit((previous) => ({ ...previous, assets: [asset, ...previous.assets.filter((a) => a.id !== asset.id)] }));
    }
    return assets;
  }
  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try { await action(); if (online.current) await refresh(); }
    catch (e) { notify(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(""); }
  }
  async function generate(projectId: string, mode: string) {
    if (!online.current) throw new Error("Connect your backend and add a Siray key in Settings to generate.");
    await flushProject(projectId);
    await request("/generate", { method: "POST", body: JSON.stringify({ projectId, mode }) });
    notify("Generation queued. You can keep working while it runs.");
  }
  async function render(projectId: string) {
    if (!online.current) throw new Error("Connect your backend in Settings to render videos.");
    await flushProject(projectId);
    const result = await request("/render", { method: "POST", body: JSON.stringify({ projectId }) });
    notify(`${result.count} videos queued for rendering.`);
  }
  return { data, connected, notice, busy, saving: edits.saving, notify, refresh, sync,
    setConnected: setConnection, updateProject, addProject, saveProduct, savePreset, upload, act, generate, render };
}
export type Workspace = ReturnType<typeof useWorkspace>;
