let state = {
  avatarState: "idle",
  transcript: "",
  lastUserMessage: "",
  lastAssistantMessage: "",
  messages: [],
  claudeSessionId: null,
  pendingRequests: /* @__PURE__ */ new Map()
};
function updateState(update) {
  state = { ...state, ...update };
}
function resetState() {
  for (const req of state.pendingRequests.values()) {
    clearTimeout(req.timeoutId);
  }
  state = {
    avatarState: "idle",
    transcript: "",
    lastUserMessage: "",
    lastAssistantMessage: "",
    messages: [],
    claudeSessionId: null,
    pendingRequests: /* @__PURE__ */ new Map()
  };
}
function generateRequestId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export {
  generateRequestId,
  resetState,
  state,
  updateState
};
