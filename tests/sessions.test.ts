import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
process.env.DATA_DIR = await mkdtemp(
  path.join(os.tmpdir(), "avem-session-test-"),
);
process.env.APP_PASSWORD = "test-session-password";
const { createSession, validSession, revokeSession } =
  await import("../server/sessions.ts");
const { db } = await import("../server/store.ts");
test("sessions store only token hashes, expire, and support immediate logout", () => {
  const token = createSession(1000);
  assert.equal(validSession(token, 1001), true);
  assert.equal(
    JSON.stringify(db.prepare("SELECT * FROM auth_sessions").all()).includes(
      token,
    ),
    false,
  );
  assert.equal(validSession(token, 1000 + 7 * 24 * 60 * 60 * 1000), false);
  const active = createSession();
  assert.equal(validSession(active), true);
  revokeSession(active);
  assert.equal(validSession(active), false);
  assert.equal(validSession("invalid"), false);
});
test("changing the workspace password invalidates old credentials", () => {
  const token = createSession();
  process.env.APP_PASSWORD = "changed-password";
  assert.equal(validSession(token), false);
  const next = createSession();
  assert.equal(validSession(next), true);
});
