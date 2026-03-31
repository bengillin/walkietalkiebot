// In-memory state store for API
// Hydrated from DB on startup, updated by frontend via POST /api/state

export interface PendingRequest {
  content: string
  timestamp: number
  callback: (response: string) => void
  timeoutId: ReturnType<typeof setTimeout>
}

export interface WtbState {
  avatarState: string
  transcript: string
  lastUserMessage: string
  lastAssistantMessage: string
  messages: Array<{ role: string; content: string; timestamp: number }>
  claudeSessionId: string | null
  // IPC: per-request queue keyed by request ID
  pendingRequests: Map<string, PendingRequest>
}

export let state: WtbState = {
  avatarState: 'idle',
  transcript: '',
  lastUserMessage: '',
  lastAssistantMessage: '',
  messages: [],
  claudeSessionId: null,
  pendingRequests: new Map(),
}

export function updateState(update: Partial<Omit<WtbState, 'pendingRequests'>>) {
  state = { ...state, ...update }
}

export function resetState() {
  // Clean up pending request timeouts
  for (const req of state.pendingRequests.values()) {
    clearTimeout(req.timeoutId)
  }
  state = {
    avatarState: 'idle',
    transcript: '',
    lastUserMessage: '',
    lastAssistantMessage: '',
    messages: [],
    claudeSessionId: null,
    pendingRequests: new Map(),
  }
}

// Generate a unique request ID
export function generateRequestId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
