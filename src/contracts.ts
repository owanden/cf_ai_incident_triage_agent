import { z } from "zod";

export type Message = { role: "user" | "assistant"; content: string; timestamp: string };
export type IncidentState = {
  incidentId: string;
  createdAt: string;
  updatedAt: string;
  status: "open" | "resolved";
  summary: string;
  hypotheses: string[];
  messages: Message[];
  latestEvidence: string[];
};

export const incidentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const chatSchema = z.object({ incidentId: incidentIdSchema, message: z.string().trim().min(1).max(8000) }).strict();
export const statusSchema = z.object({ incidentId: incidentIdSchema, status: z.enum(["open", "resolved"]) }).strict();
export const triageSchema = z.object({
  summary: z.string().min(1).max(2000),
  possibleCauses: z.array(z.string().min(1).max(1000)).min(2).max(3),
  nextSteps: z.array(z.string().min(1).max(1000)).length(3),
  followUpQuestion: z.string().min(1).max(1000),
});

export function createInitialState(incidentId: string): IncidentState {
  const now = new Date().toISOString();
  return { incidentId, createdAt: now, updatedAt: now, status: "open", summary: "", hypotheses: [], messages: [], latestEvidence: [] };
}
