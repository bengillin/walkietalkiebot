// In-memory state store for API
export interface TalkieState {
  avatarState: string
  transcript: string
  lastUserMessage: string
  lastAssistantMessage: string
  messages: Array<{ role: string; content: string; timestamp: number }>
  claudeSessionId: string | null
  pendingMessage: { content: string; timestamp: number } | null
  responseCallbacks: Array<(response: string) => void>
}

export let state: TalkieState = {
  avatarState: 'idle',
  transcript: '',
  lastUserMessage: '',
  lastAssistantMessage: '',
  messages: [],
  claudeSessionId: null,
  pendingMessage: null,
  responseCallbacks: [],
}

export function updateState(update: Partial<TalkieState>) {
  state = { ...state, ...update }
}

export function resetState() {
  state = {
    avatarState: 'idle',
    transcript: '',
    lastUserMessage: '',
    lastAssistantMessage: '',
    messages: [],
    claudeSessionId: null,
    pendingMessage: null,
    responseCallbacks: [],
  }
}
