import { createInitialState, IncidentState, Message, Triage } from "./contracts";

export interface StateTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

export interface StateStorage {
  transaction<T>(operation: (txn: StateTransaction) => Promise<T>): Promise<T>;
}

export interface IncidentStore {
  getState(incidentId: string): Promise<IncidentState>;
  setStatus(incidentId: string, status: IncidentState["status"]): Promise<IncidentState>;
  appendTurn(incidentId: string, user: Message, output: Triage): Promise<void>;
}

export function createStore(storage: StateStorage): IncidentStore {
  const mutate = (incidentId: string, update: (state: IncidentState) => IncidentState) => {
    const initial = createInitialState(incidentId);
    return storage.transaction(async txn => {
      const current = await txn.get<IncidentState>("state") ?? initial;
      const next = update(current);
      await txn.put("state", next);
      return next;
    });
  };
  return {
    getState(incidentId) {
      const initial = createInitialState(incidentId);
      return storage.transaction(async txn => {
        const existing = await txn.get<IncidentState>("state");
        if (existing) return existing;
        await txn.put("state", initial);
        return initial;
      });
    },
    setStatus(incidentId, status) {
      const updatedAt = new Date().toISOString();
      return mutate(incidentId, state => ({ ...state, status, updatedAt }));
    },
    async appendTurn(incidentId, user, output) {
      const updatedAt = new Date().toISOString();
      const assistant: Message = { role: "assistant", content: JSON.stringify(output), timestamp: updatedAt };
      await mutate(incidentId, state => ({
        ...state, updatedAt, summary: output.summary, hypotheses: output.possibleCauses,
        messages: [...state.messages, user, assistant],
        latestEvidence: [...new Set([...state.latestEvidence, user.content])].slice(-5),
      }));
    },
  };
}
