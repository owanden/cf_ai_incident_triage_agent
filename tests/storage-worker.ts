import { IncidentAgent } from "../src/incident-agent";
import fixture from "../demo/fixture.json";
export { IncidentAgent };

export default {
  async fetch(request: Request, env: { INCIDENT_AGENT: DurableObjectNamespace<IncidentAgent> }) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id")!;
    const store = env.INCIDENT_AGENT.getByName(id);
    if (request.method === "GET") return Response.json(await store.getState(id));
    const body = await request.json() as { status?: "open" | "resolved"; message?: string };
    if (body.status) return Response.json(await store.setStatus(id, body.status));
    await store.appendTurn(id, { role: "user", content: body.message!, timestamp: new Date().toISOString() }, fixture);
    return Response.json({ saved: true });
  },
};
