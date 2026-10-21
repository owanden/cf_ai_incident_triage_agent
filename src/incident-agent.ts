import { DurableObject } from "cloudflare:workers";
import { IncidentState, Message, Triage } from "./contracts";
import { createStore } from "./store";

export class IncidentAgent extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); }

  private get store() { return createStore(this.ctx.storage); }

  getState(incidentId: string): Promise<IncidentState> {
    return this.store.getState(incidentId);
  }

  setStatus(incidentId: string, status: IncidentState["status"]): Promise<IncidentState> {
    return this.store.setStatus(incidentId, status);
  }

  appendTurn(incidentId: string, user: Message, output: Triage): Promise<void> {
    return this.store.appendTurn(incidentId, user, output);
  }
}
