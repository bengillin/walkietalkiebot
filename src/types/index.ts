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

export interface AppState {
  avatarState: AvatarState
  setAvatarState: (state: AvatarState) => void

  messages: Message[]
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void

  isVoiceEnabled: boolean
  setVoiceEnabled: (enabled: boolean) => void

  transcript: string
  setTranscript: (text: string) => void
}
