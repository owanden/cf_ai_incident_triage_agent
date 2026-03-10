const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const inputEl = document.getElementById("messageInput");
const incidentIdEl = document.getElementById("incidentId");
const sendBtnEl = document.getElementById("sendBtn");
const newIncidentBtnEl = document.getElementById("newIncidentBtn");

function appendUserMessage(text) {
    const wrapper = document.createElement("div");
    wrapper.className = "message user";
    wrapper.innerHTML = `
    <div class="message-role">User</div>
    <pre>${escapeHtml(text)}</pre>
  `;
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendAssistantMessage(data) {
    const wrapper = document.createElement("div");
    wrapper.className = "message assistant";

    const possibleCauses = Array.isArray(data.possibleCauses)
        ? data.possibleCauses.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "";

    const nextSteps = Array.isArray(data.nextSteps)
        ? data.nextSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
        : "";

    wrapper.innerHTML = `
    <div class="message-role">Assistant</div>
    <div class="response-block">
      <h3>Summary</h3>
      <pre>${escapeHtml(data.summary || "")}</pre>
    </div>
    <div class="response-block">
      <h3>Possible causes</h3>
      <ul>${possibleCauses}</ul>
    </div>
    <div class="response-block">
      <h3>Next steps</h3>
      <ul>${nextSteps}</ul>
    </div>
    <div class="response-block">
      <h3>Follow up question</h3>
      <pre>${escapeHtml(data.followUpQuestion || "")}</pre>
    </div>
  `;
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendErrorMessage(text) {
    const wrapper = document.createElement("div");
    wrapper.className = "message assistant";
    wrapper.innerHTML = `
    <div class="message-role">Error</div>
    <pre>${escapeHtml(text)}</pre>
  `;
    messagesEl.appendChild(wrapper);
}

function setLoading(isLoading) {
    sendBtnEl.disabled = isLoading;
    sendBtnEl.textContent = isLoading ? "Sending..." : "Send";
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function generateIncidentId() {
    return `inc-${crypto.randomUUID().slice(0, 8)}`;
}

newIncidentBtnEl.addEventListener("click", () => {
    incidentIdEl.value = generateIncidentId();
    messagesEl.innerHTML = "";
});

formEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = inputEl.value.trim();
    const incidentId = incidentIdEl.value.trim();

    if (!message || !incidentId) return;

    appendUserMessage(message);
    inputEl.value = "";
    setLoading(true);

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ incidentId, message }),
        });

        const data = await response.json();

        if (!response.ok) {
            appendErrorMessage(data.error || "Request failed");
            return;
        }

        appendAssistantMessage(data);
    } catch (error) {
        appendErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
        setLoading(false);
    }
});