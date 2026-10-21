import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHandler } from "../src/api";
import { createMemoryStore } from "./store";
import fixture from "./fixture.json";

const stores = new Map<string, ReturnType<typeof createMemoryStore>>();
const handler = createHandler(id => {
  if (!stores.has(id)) stores.set(id, createMemoryStore());
  return stores.get(id)!;
}, async prompt => {
  if (prompt.includes("[simulate-provider-error]")) throw new Error("fixture failure");
  return structuredClone(fixture);
});
const assets: Record<string, [string, string]> = {
  "/": ["index.html", "text/html"], "/app.js": ["app.js", "text/javascript"], "/styles.css": ["styles.css", "text/css"],
};
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url ?? "/", "http://127.0.0.1");
    const asset = assets[url.pathname];
    if (incoming.method === "GET" && asset) {
      let content = await readFile(resolve(__dirname, "../../../public", asset[0]), "utf8");
      if (asset[0] === "index.html") content = content.replace('<header class="header">', '<header class="header"><p>Fixture demo: predetermined responses, in-memory sessions, no model calls.</p>');
      outgoing.writeHead(200, { "Content-Type": asset[1] }); outgoing.end(content); return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 65536) { outgoing.writeHead(413); outgoing.end(); return; }
      chunks.push(chunk);
    }
    const method = incoming.method ?? "GET";
    const response = await handler(new Request(url, { method, body: ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks).toString("utf8") }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch { outgoing.writeHead(500, { "Content-Type": "application/json" }); outgoing.end(JSON.stringify({ error: "demo_error" })); }
});
const port = Number(process.env.DEMO_PORT ?? 8787);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid demo port");
server.listen(port, "127.0.0.1", () => console.log(JSON.stringify({ type: "demo_ready", port: (server.address() as { port: number }).port, mode: "fixture" })));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => server.close(() => process.exit(0)));
