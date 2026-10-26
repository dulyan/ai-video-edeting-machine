import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import type {
  AppState,
  Job,
  Project,
  Product,
  Asset,
  PromptPreset,
} from "../shared/types.ts";
export const dataDir = path.resolve(process.env.DATA_DIR || "./data");
mkdirSync(dataDir, { recursive: true });
export const mediaDir = path.join(dataDir, "media");
export const workDir = path.join(dataDir, "work");
mkdirSync(mediaDir, { recursive: true });
mkdirSync(workDir, { recursive: true });
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.APP_PASSWORD || !process.env.ENCRYPTION_KEY)
)
  throw new Error("APP_PASSWORD and ENCRYPTION_KEY are required in production");
const keyPath = path.join(dataDir, ".encryption-key");
if (!process.env.ENCRYPTION_KEY && !existsSync(keyPath))
  writeFileSync(keyPath, randomBytes(32).toString("hex"), { mode: 0o600 });
export const encryptionKey = createHash("sha256")
  .update(process.env.ENCRYPTION_KEY || readFileSync(keyPath, "utf8"))
  .digest();
export const db = new DatabaseSync(path.join(dataDir, "workspace.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS secrets (name TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO migrations(version) VALUES(1);",
);
type RecordMap = {
  projects: Project;
  products: Product;
  assets: Asset;
  jobs: Job;
  presets: PromptPreset;
};
export function all<K extends keyof RecordMap>(kind: K): RecordMap[K][] {
  return (
    db
      .prepare("SELECT body FROM records WHERE kind=? ORDER BY rowid DESC")
      .all(kind) as { body: string }[]
  ).map((r) => JSON.parse(r.body));
}
export function get<K extends keyof RecordMap>(
  kind: K,
  id: string,
): RecordMap[K] | undefined {
  const row = db
    .prepare("SELECT body FROM records WHERE kind=? AND id=?")
    .get(kind, id) as { body: string } | undefined;
  return row ? JSON.parse(row.body) : undefined;
}
export function put<K extends keyof RecordMap>(kind: K, value: RecordMap[K]) {
  db.prepare(
    "INSERT INTO records(kind,id,body) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
  ).run(kind, value.id, JSON.stringify(value));
  return value;
}
export function remove(kind: keyof RecordMap, id: string) {
  db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
}
export function patchJob(id: string, patch: Partial<Job>) {
  const j = get("jobs", id);
  if (!j) throw new Error("Job not found");
  return put("jobs", { ...j, ...patch, updatedAt: new Date().toISOString() });
}
export function addJob(
  projectId: string,
  kind: Job["kind"],
  label: string,
  input: any,
  batchId: string = crypto.randomUUID(),
  id: string = crypto.randomUUID(),
) {
  const existing = get("jobs", id);
  if (existing) return existing;
  const now = new Date().toISOString();
  return put("jobs", {
    id,
    projectId,
    batchId,
    kind,
    label,
    input,
    status: "queued",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  });
}
export function state(): AppState {
  return {
    projects: all("projects"),
    products: all("products"),
    assets: all("assets"),
    presets: all("presets"),
    jobs: all("jobs").map((j) => ({ ...j, input: undefined })),
  };
}
export function setSecret(name: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  db.prepare("INSERT OR REPLACE INTO secrets(name,value) VALUES(?,?)").run(
    name,
    Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64"),
  );
}
export function getSecret(name: string): string {
  const row = db.prepare("SELECT value FROM secrets WHERE name=?").get(name) as
    { value: string } | undefined;
  if (!row) return "";
  const bytes = Buffer.from(row.value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      bytes.subarray(0, 12),
    );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
