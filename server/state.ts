// In-memory state store for API
export interface TalkboyState {
  avatarState: string
  transcript: string
  lastUserMessage: string
  lastAssistantMessage: string
  messages: Array<{ role: string; content: string; timestamp: number }>
  claudeSessionId: string | null
  pendingMessage: { content: string; timestamp: number } | null
  responseCallbacks: Array<(response: string) => void>
}

export let state: TalkboyState = {
  avatarState: 'idle',
  transcript: '',
  lastUserMessage: '',
  lastAssistantMessage: '',
  messages: [],
  claudeSessionId: null,
  pendingMessage: null,
  responseCallbacks: [],
}

export function updateState(update: Partial<TalkboyState>) {
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
