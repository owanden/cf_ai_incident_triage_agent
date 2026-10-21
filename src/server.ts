import { DurableObject } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";
import { generateText, Output } from "ai";
import { INCIDENT_SYSTEM_PROMPT } from "./prompts";
import { createInitialState, IncidentState, triageSchema } from "./contracts";
import { createHandler } from "./api";

export class IncidentAgent extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

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
    return createHandler(id => env.INCIDENT_AGENT.getByName(id), async prompt => {
      const workersai = createWorkersAI({ binding: env.AI });
      const { output } = await generateText({
        model: workersai("@cf/meta/llama-4-scout-17b-16e-instruct"),
        system: INCIDENT_SYSTEM_PROMPT, prompt,
        output: Output.object({ schema: triageSchema }),
      });
      return output;
    })(request);
  },
} satisfies ExportedHandler<Env>;
