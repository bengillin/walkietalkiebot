let state = {
  avatarState: "idle",
  transcript: "",
  lastUserMessage: "",
  lastAssistantMessage: "",
  messages: [],
  claudeSessionId: null,
  pendingMessage: null,
  responseCallbacks: []
};
function updateState(update) {
  state = { ...state, ...update };
}
function resetState() {
  state = {
    avatarState: "idle",
    transcript: "",
    lastUserMessage: "",
    lastAssistantMessage: "",
    messages: [],
    claudeSessionId: null,
    pendingMessage: null,
    responseCallbacks: []
  };
}
export {
  resetState,
  state,
  updateState
};
