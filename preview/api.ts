import { createHandler } from "../src/api";
import { createMemoryStore } from "../demo/store";
import fixture from "../demo/fixture.json";

export function createPreview() {
  const stores = new Map<string, ReturnType<typeof createMemoryStore>>();
  const handler = createHandler(id => {
    if (!stores.has(id)) stores.set(id, createMemoryStore());
    return stores.get(id)!;
  }, async prompt => {
    if (prompt.includes("[simulate-provider-error]")) throw new Error("fixture failure");
    return structuredClone(fixture);
  });
  return async (path: string, options?: RequestInit) => {
    const url = new URL(path, "https://preview.invalid");
    if (url.origin !== "https://preview.invalid" || !["/api/state", "/api/chat"].includes(url.pathname)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return handler(new Request(url, options));
  };
}
