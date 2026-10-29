import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import staticFiles from "@fastify/static";

export const localApp = process.env.LOCAL_APP === "1";
export const queueEnabled = process.env.QUEUE_ENABLED !== "0";
export const localOrigin = `http://127.0.0.1:${Number(process.env.PORT || 3001)}`;

export function allowedLocalRequest(request: FastifyRequest) {
  if (!localApp) return true;
  const expected = new URL(localOrigin).host;
  return request.headers.host === expected && (!request.headers.origin || request.headers.origin === localOrigin);
}

export function healthIdentity() {
  return {
    app: "ai-video-edeting-machine",
    local: localApp,
    queueEnabled,
    ...(localApp ? {profileId: process.env.LOCAL_PROFILE_ID, instanceId: process.env.LOCAL_INSTANCE_ID} : {}),
  };
}

export async function registerLocalApp(app: FastifyInstance, shutdown: () => Promise<void>) {
  if (!localApp) return;
  await app.register(staticFiles, {
    root: path.resolve(process.env.LOCAL_UI_DIR || "dist"),
    decorateReply: false,
    cacheControl: false,
    index: "index.html",
  });
  app.post("/api/local/shutdown", async (request, reply) => {
    const expected = process.env.LOCAL_CONTROL_TOKEN || "";
    const provided = String(request.headers["x-local-control"] || "");
    if (!expected || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
      return reply.code(403).send({error:"Local control authentication required"});
    reply.send({ok:true});
    setImmediate(() => { void shutdown(); });
  });
}
