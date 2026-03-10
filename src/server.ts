import { DurableObject } from "cloudflare:workers";

type Message = {
	role: "user" | "assistant";
	content: string;
	timestamp: string;
};

type IncidentState = {
	incidentId: string;
	createdAt: string;
	updatedAt: string;
	status: "open" | "resolved";
	summary: string;
	hypotheses: string[];
	messages: Message[];
	latestEvidence: string[];
};

const createInitialState = (incidentId: string): IncidentState => {
	const now = new Date().toISOString();

	return {
		incidentId,
		createdAt: now,
		updatedAt: now,
		status: "open",
		summary: "",
		hypotheses: [],
		messages: [],
		latestEvidence: [],
	};
};

export class IncidentAgent extends DurableObject {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async getState(incidentId: string): Promise<IncidentState> {
		const existing = await this.ctx.storage.get<IncidentState>("state");
		if (existing) return existing;

		const initial = createInitialState(incidentId);
		await this.ctx.storage.put("state", initial);
		return initial;
	}

	async updateState(nextState: IncidentState): Promise<void> {
		await this.ctx.storage.put("state", nextState);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/api/state" && request.method === "GET") {
			const incidentId = url.searchParams.get("incidentId") ?? "default";
			const stub = env.INCIDENT_AGENT.getByName(incidentId);
			const state = await stub.getState(incidentId);

			return Response.json(state);
		}

		if (url.pathname === "/api/state" && request.method === "POST") {
			const body = (await request.json()) as Partial<IncidentState>;

			if (!body.incidentId) {
				return Response.json(
					{ error: "incidentId is required" },
					{ status: 400 }
				);
			}

			const stub = env.INCIDENT_AGENT.getByName(body.incidentId);
			const currentState = await stub.getState(body.incidentId);

			const nextState: IncidentState = {
				...currentState,
				...body,
				updatedAt: new Date().toISOString(),
			};

			await stub.updateState(nextState);

			return Response.json(nextState);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;