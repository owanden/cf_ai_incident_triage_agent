import { DurableObject } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { INCIDENT_SYSTEM_PROMPT, buildIncidentPrompt } from "./prompts";

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

type ChatRequest = {
	incidentId: string;
	message: string;
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

const triageSchema = z.object({
	summary: z.string(),
	possibleCauses: z.array(z.string()).min(2).max(3),
	nextSteps: z.array(z.string()).length(3),
	followUpQuestion: z.string(),
});

type TriageResponse = z.infer<typeof triageSchema>;

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

		if (url.pathname === "/api/chat" && request.method === "POST") {
			const body = (await request.json()) as Partial<ChatRequest>;

			if (!body.incidentId || !body.message) {
				return Response.json(
					{ error: "incidentId and message are required" },
					{ status: 400 }
				);
			}

			const stub = env.INCIDENT_AGENT.getByName(body.incidentId);
			const currentState = await stub.getState(body.incidentId);

			const now = new Date().toISOString();

			const userMessage: Message = {
				role: "user",
				content: body.message,
				timestamp: now,
			};

			const workingState: IncidentState = {
				...currentState,
				messages: [...currentState.messages, userMessage],
				updatedAt: now,
			};

			const workersai = createWorkersAI({ binding: env.AI });

			const { output } = await generateText({
				model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
				system: INCIDENT_SYSTEM_PROMPT,
				prompt: buildIncidentPrompt(workingState, body.message),
				output: Output.object({
					schema: triageSchema,
				}),
			});

			const aiResponse: TriageResponse = output;

			const assistantMessage: Message = {
				role: "assistant",
				content: JSON.stringify(aiResponse),
				timestamp: new Date().toISOString(),
			};

			const nextEvidence = Array.from(
				new Set([...currentState.latestEvidence, body.message])
			).slice(-5);

			const nextState: IncidentState = {
				...workingState,
				summary: aiResponse.summary,
				hypotheses: aiResponse.possibleCauses,
				latestEvidence: nextEvidence,
				messages: [...workingState.messages, assistantMessage],
				updatedAt: new Date().toISOString(),
			};

			await stub.updateState(nextState);

			return Response.json(aiResponse);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;