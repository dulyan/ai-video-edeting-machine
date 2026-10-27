import type { FastifyInstance } from "fastify";
import { changes, state } from "./store.ts";
export function registerEvents(app: FastifyInstance) {
  const streams = new Set<import("node:http").ServerResponse>();
  app.addHook("preClose", async () => {
    for (const stream of streams) stream.end();
  });
  app.get("/api/events", async (req, reply) => {
    streams.add(reply.raw);
    reply.hijack();
    reply.raw.writeHead(200, {
      ...reply.getHeaders(),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    } as import("node:http").OutgoingHttpHeaders);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      timer = undefined;
      if (reply.raw.destroyed) return;
      if (reply.raw.writableNeedDrain) {
        reply.raw.end();
        return;
      }
      reply.raw.write(`data: ${JSON.stringify(state())}\n\n`);
    };
    const changed = () => {
      if (!timer) timer = setTimeout(send, 200);
    };
    changes.on("change", changed);
    send();
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(": keep-alive\n\n");
    }, 15000);
    const expiry = setTimeout(() => reply.raw.end(), 20 * 60 * 1000);
    reply.raw.on("close", () => {
      streams.delete(reply.raw);
      changes.off("change", changed);
      clearTimeout(timer);
      clearInterval(heartbeat);
      clearTimeout(expiry);
    });
  });
}
