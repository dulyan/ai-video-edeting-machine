import { createHash, createHmac, randomBytes } from "node:crypto";
import { db, encryptionKey } from "./store.ts";
const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
db.exec(
  "CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, credential_version TEXT NOT NULL)",
);
function credentialVersion() {
  return createHmac("sha256", encryptionKey)
    .update(process.env.APP_PASSWORD || "")
    .digest("hex");
}
function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function createSession(now = Date.now()) {
  const version = credentialVersion();
  db.prepare(
    "DELETE FROM auth_sessions WHERE expires_at <= ? OR credential_version != ?",
  ).run(now, version);
  const token = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO auth_sessions(token_hash,expires_at,credential_version) VALUES(?,?,?)",
  ).run(tokenHash(token), now + SESSION_LIFETIME, version);
  return token;
}
export function validSession(token: string, now = Date.now()) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const hash = tokenHash(token);
  const row = db
    .prepare(
      "SELECT expires_at,credential_version FROM auth_sessions WHERE token_hash=?",
    )
    .get(hash) as
    { expires_at: number; credential_version: string } | undefined;
  if (!row) return false;
  if (row.expires_at <= now || row.credential_version !== credentialVersion()) {
    db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hash);
    return false;
  }
  return true;
}
export function revokeSession(token: string) {
  if (token)
    db.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(
      tokenHash(token),
    );
}
