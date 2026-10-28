import type { AppState, Project, Product, PromptPreset } from "../shared/types.ts";

type Field = { value: unknown; sequence: number; acknowledgedAt?: number };
export type DraftSnapshot = { patch: Partial<Project>; sequences: Record<string, number> };
export type ProjectUpdate = Partial<Project> | ((latest: Project) => Partial<Project>);
type LocalRecord = { value: Product | PromptPreset; sequence: number; acknowledgedAt?: number };
export type SavedDrafts = { projects: Record<string, Record<string, Field>>; localIds: string[]; records?: Partial<Record<"products" | "presets", LocalRecord[]>> };

// Field-level overlays keep job updates flowing while the operator edits. An
// HTTP acknowledgement alone cannot make a delayed, older SSE snapshot safe.
export class WorkspaceDrafts {
  private fields = new Map<string, Map<string, Field>>();
  private sequence = 0;
  private floor = -1;
  readonly localIds = new Set<string>();
  private records = { products: new Map<string, LocalRecord>(), presets: new Map<string, LocalRecord>() };

  constructor(saved?: SavedDrafts) {
    for (const [id, fields] of Object.entries(saved?.projects || {})) {
      const entries = Object.entries(fields).map(([key, field]) => {
        this.sequence = Math.max(this.sequence, field.sequence);
        // An acknowledgement from a previous connection is not an unsaved edit.
        // Resend restored fields so server restarts/migrations cannot discard them.
        return [key, { value: field.value, sequence: field.sequence }] as const;
      });
      this.fields.set(id, new Map(entries));
    }
    for (const id of saved?.localIds || []) this.localIds.add(id);
    for (const kind of ["products", "presets"] as const)
      for (const record of saved?.records?.[kind] || []) {
        this.sequence = Math.max(this.sequence, record.sequence);
        this.records[kind].set(record.value.id, { value: record.value, sequence: record.sequence });
      }
  }

  edit(id: string, patch: Partial<Project>) {
    const fields = this.fields.get(id) || new Map<string, Field>();
    for (const [key, value] of Object.entries(patch))
      fields.set(key, { value, sequence: ++this.sequence });
    this.fields.set(id, fields);
  }

  capture(id: string): DraftSnapshot {
    const patch: Record<string, unknown> = {}, sequences: Record<string, number> = {};
    for (const [key, field] of this.fields.get(id) || []) {
      if (field.acknowledgedAt !== undefined) continue;
      patch[key] = field.value;
      sequences[key] = field.sequence;
    }
    return { patch, sequences };
  }

  acknowledge(id: string, sent: DraftSnapshot, revision?: number) {
    this.observeWrite(revision);
    for (const [key, sequence] of Object.entries(sent.sequences)) {
      const field = this.fields.get(id)?.get(key);
      if (field?.sequence === sequence) field.acknowledgedAt = revision ?? -1;
    }
  }

  observeWrite(revision?: number) {
    if (revision !== undefined) this.floor = Math.max(this.floor, revision);
  }

  hasUnsaved(id: string) { return Object.keys(this.capture(id).patch).length > 0; }
  get saving() { return this.fields.size > 0 || this.localIds.size > 0 || this.records.products.size > 0 || this.records.presets.size > 0; }
  ids() { return [...this.fields.keys()]; }
  editRecord(kind: "products" | "presets", value: Product | PromptPreset) {
    const record = { value, sequence: ++this.sequence };
    this.records[kind].set(value.id, record);
    return record;
  }
  pendingRecords(kind: "products" | "presets") {
    return [...this.records[kind].values()].filter((record) => record.acknowledgedAt === undefined);
  }
  acknowledgeRecord(kind: "products" | "presets", sent: LocalRecord, revision?: number) {
    this.observeWrite(revision);
    const current = this.records[kind].get(sent.value.id);
    if (current?.sequence === sent.sequence) current.acknowledgedAt = revision ?? -1;
  }

  serialize(): SavedDrafts {
    return {
      projects: Object.fromEntries([...this.fields].map(([id, fields]) => [id, Object.fromEntries(fields)])),
      localIds: [...this.localIds],
      records: { products: [...this.records.products.values()], presets: [...this.records.presets.values()] },
    };
  }

  accept(previous: AppState, incoming: AppState): AppState {
    if (incoming.revision !== undefined && incoming.revision < this.floor) return previous;
    if (incoming.revision === undefined && this.floor >= 0) return previous;
    this.observeWrite(incoming.revision);
    const projects = incoming.projects.map((remote) => {
      const fields = this.fields.get(remote.id);
      const patch: Record<string, unknown> = {};
      for (const [key, field] of fields || []) {
        const seen = field.acknowledgedAt !== undefined && (
          incoming.revision !== undefined && field.acknowledgedAt >= 0
            ? incoming.revision >= field.acknowledgedAt
            : JSON.stringify((remote as unknown as Record<string, unknown>)[key]) === JSON.stringify(field.value)
        );
        if (seen) fields!.delete(key);
        else patch[key] = field.value;
      }
      if (fields && !fields.size) this.fields.delete(remote.id);
      this.localIds.delete(remote.id);
      return { ...remote, ...patch };
    });
    // In-flight project creation and offline projects must not disappear when an
    // unrelated event arrives before their PUT request finishes.
    for (const project of previous.projects)
      if (!projects.some((p) => p.id === project.id) && (this.localIds.has(project.id) || this.fields.has(project.id)))
        projects.unshift(project);
    return {
      ...incoming,
      projects: retainEqual(previous.projects, projects),
      products: retainEqual(previous.products, this.mergeRecords("products", incoming.products, incoming.revision)),
      presets: retainEqual(previous.presets || [], this.mergeRecords("presets", incoming.presets || [], incoming.revision)),
      assets: retainEqual(previous.assets, incoming.assets),
    };
  }
  private mergeRecords<T extends Product | PromptPreset>(kind: "products" | "presets", incoming: T[], revision?: number): T[] {
    const values = new Map(incoming.map((record) => [record.id, record]));
    for (const [id, record] of this.records[kind]) {
      const seen = record.acknowledgedAt !== undefined && (revision !== undefined && record.acknowledgedAt >= 0
        ? revision >= record.acknowledgedAt
        : JSON.stringify(values.get(id)) === JSON.stringify(record.value));
      if (seen) this.records[kind].delete(id);
      else values.set(id, record.value as T);
    }
    return [...values.values()];
  }
}

function retainEqual<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const byId = new Map(previous.map((item) => [item.id, item]));
  const next = incoming.map((item) => {
    const existing = byId.get(item.id);
    return existing && JSON.stringify(existing) === JSON.stringify(item) ? existing : item;
  });
  return next.length === previous.length && next.every((item, i) => item === previous[i]) ? previous : next;
}
