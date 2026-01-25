export type AvatarState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'confused'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface AppState {
  avatarState: AvatarState
  setAvatarState: (state: AvatarState) => void

  // Current conversation
  currentConversationId: string | null
  messages: Message[]
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void

  // All conversations
  conversations: Conversation[]
  createConversation: () => void
  loadConversation: (id: string) => void
  deleteConversation: (id: string) => void

  // Context from past conversations
  contextConversationIds: string[]
  toggleContextConversation: (id: string) => void
  clearContext: () => void

  isVoiceEnabled: boolean
  setVoiceEnabled: (enabled: boolean) => void

  transcript: string
  setTranscript: (text: string) => void
}
