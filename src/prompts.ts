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

export const INCIDENT_SYSTEM_PROMPT = `
You are an incident triage assistant.

Given logs, error messages, and user observations, return:
1. A short summary
2. Two or three likely causes
3. Three concrete next debugging steps
4. One follow up question

Be concise, technical, and practical.
Base your reasoning only on the evidence provided.
`;

export function buildIncidentPrompt(
    state: IncidentState,
    newMessage: string
): string {
    const recentMessages = state.messages
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");

    const hypothesesText = state.hypotheses.length
        ? state.hypotheses.map((h) => `- ${h}`).join("\n")
        : "None yet.";

    const evidenceText = state.latestEvidence.length
        ? state.latestEvidence.map((e) => `- ${e}`).join("\n")
        : "None yet.";

    return `
Incident ID: ${state.incidentId}

Current summary:
${state.summary || "No summary yet."}

Current hypotheses:
${hypothesesText}

Latest evidence:
${evidenceText}

Recent conversation:
${recentMessages || "No prior conversation."}

New user input:
${newMessage}
`;
}