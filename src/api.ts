import { chatSchema, statusSchema, incidentIdSchema, triageSchema, Message } from "./contracts";
import { buildIncidentPrompt } from "./prompts";
import { IncidentStore } from "./store";

export function createHandler(getStore: (id: string) => IncidentStore, generate: (prompt: string) => Promise<unknown>) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/state" && request.method === "GET") {
        const parsed = incidentIdSchema.safeParse(url.searchParams.get("incidentId") ?? "default");
        if (!parsed.success) return Response.json({ error: "invalid_incident_id" }, { status: 400 });
        return Response.json(await getStore(parsed.data).getState(parsed.data));
      }
      if (request.method !== "POST" || !["/api/state", "/api/chat"].includes(url.pathname)) {
        return Response.json({ error: "not_found" }, { status: 404 });
      }
      let body: unknown;
      try { body = await request.json(); }
      catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
      if (url.pathname === "/api/state") {
        const parsed = statusSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: "invalid_status_update" }, { status: 400 });
        const { incidentId, status } = parsed.data;
        const store = getStore(incidentId);
        return Response.json(await store.setStatus(incidentId, status));
      }
      const parsed = chatSchema.safeParse(body);
      if (!parsed.success) return Response.json({ error: "invalid_chat_request" }, { status: 400 });
      const { incidentId, message } = parsed.data;
      const store = getStore(incidentId);
      const current = await store.getState(incidentId);
      const now = new Date().toISOString();
      const user: Message = { role: "user", content: message, timestamp: now };
      const working = { ...current, messages: [...current.messages, user], updatedAt: now };
      let output;
      try { output = triageSchema.parse(await generate(buildIncidentPrompt(working, message))); }
      catch { return Response.json({ error: "triage_unavailable" }, { status: 502 }); }
      await store.appendTurn(incidentId, user, output);
      return Response.json(output);
    } catch {
      return Response.json({ error: "state_unavailable" }, { status: 503 });
    }
  };
}
