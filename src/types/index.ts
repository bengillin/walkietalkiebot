export type AvatarState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'confused'

export type ActivityType = 'tool_start' | 'tool_end' | 'thinking' | 'text'

export interface DroppedFile {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
  description?: string
}

export interface ImageAnalysis {
  id: string
  fileId: string
  fileName: string
  description: string
  timestamp: number
  status: 'analyzing' | 'complete' | 'error'
  error?: string
}

export interface Activity {
  id: string
  type: ActivityType
  tool?: string
  input?: string
  output?: string
  content?: string
  timestamp: number
  status?: 'running' | 'complete' | 'error'
}

export interface MessageImage {
  id: string
  dataUrl: string
  fileName: string
  description?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  images?: MessageImage[]
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
  addMessage: (message: Omit<Message, 'id' | 'timestamp' | 'images'>, images?: MessageImage[]) => void

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

  // Text-to-speech enabled
  ttsEnabled: boolean
  setTtsEnabled: (enabled: boolean) => void

  // Continuous listening (always-on with "over" trigger)
  continuousListeningEnabled: boolean
  setContinuousListeningEnabled: (enabled: boolean) => void

  // Wake word detection (hands-free activation)
  wakeWordEnabled: boolean
  setWakeWordEnabled: (enabled: boolean) => void
  customWakeWord: string
  setCustomWakeWord: (word: string) => void

  // Custom trigger word for ending messages
  customTriggerWord: string
  setCustomTriggerWord: (word: string) => void

  transcript: string
  setTranscript: (text: string) => void

  // Activity feed
  activities: Activity[]
  addActivity: (activity: Omit<Activity, 'id' | 'timestamp'>) => string
  updateActivity: (id: string, updates: Partial<Activity>) => void
  clearActivities: () => void

  // File attachments
  attachedFiles: DroppedFile[]
  addFiles: (files: DroppedFile[]) => void
  removeFile: (id: string) => void
  updateFile: (id: string, updates: Partial<DroppedFile>) => void
  clearFiles: () => void

  // Image analysis (cross-mode context)
  imageAnalyses: ImageAnalysis[]
  addImageAnalysis: (analysis: Omit<ImageAnalysis, 'id' | 'timestamp'>) => string
  updateImageAnalysis: (id: string, updates: Partial<ImageAnalysis>) => void
  clearImageAnalyses: () => void
  getImageContext: () => string // Returns formatted string of all analyzed images for context
}
