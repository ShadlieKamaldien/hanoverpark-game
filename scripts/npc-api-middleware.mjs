import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MAX_BODY_BYTES = 16_384;

/** Run the same Azure handler in local development and production previews. */
export function npcApiMiddleware(environment) {
  const { createHandler, readConfiguration } = require("../api/npc-brain/index.js");
  const handle = createHandler({ config: readConfiguration(environment) });
  return (request, response, next) => {
    if ((request.url ?? "").split("?")[0] !== "/api/npc-brain") return next();
    const send = (status, json) => {
      if (response.writableEnded) return;
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(JSON.stringify(json));
    };
    const dispatch = async (body) => {
      try {
        const result = await handle({ method: request.method, body,
          headers: request.headers, clientIp: request.socket.remoteAddress });
        send(result.status, result.json);
      } catch {
        send(500, { error: "The neighbourhood conversation is unavailable." });
      }
    };
    if (request.method !== "POST") { void dispatch(undefined); return; }
    let bytes = 0;
    let rejected = false;
    const chunks = [];
    request.on("data", (chunk) => {
      if (rejected) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        rejected = true;
        chunks.length = 0;
        send(413, { error: "Conversation request is too large." });
      } else chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      if (rejected) return;
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { send(400, { error: "A JSON conversation request is required." }); return; }
      void dispatch(body);
    });
    request.on("error", () => send(400, { error: "The conversation request was interrupted." }));
  };
}
