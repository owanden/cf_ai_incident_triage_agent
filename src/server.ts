import { createWorkersAI } from "workers-ai-provider";
import { generateText, Output } from "ai";
import { INCIDENT_SYSTEM_PROMPT } from "./prompts";
import { triageSchema } from "./contracts";
import { createHandler } from "./api";
export { IncidentAgent } from "./incident-agent";

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
