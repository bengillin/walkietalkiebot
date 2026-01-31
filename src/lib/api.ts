// API client for Talkboy server

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  projectId?: string
  parentId?: string
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
  source?: string
  images?: MessageImage[]
}

export interface Activity {
  id: string
  tool: string
  input?: string
  status: 'complete' | 'error'
  timestamp: number
  duration?: number
  error?: string
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[]
  activities: Activity[]
}

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  role: string
  content: string
  timestamp: number
  snippet: string
}

export interface ServerStatus {
  running: boolean
  avatarState: string
  dbStatus: 'connected' | 'unavailable'
}

export interface MigrationResult {
  success: boolean
  imported: number
  skipped: number
  total: number
}

const API_BASE = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(error.error || `API error: ${response.status}`)
  }

  return response.json()
}

// Status
export async function getStatus(): Promise<ServerStatus> {
  return fetchJson<ServerStatus>(`${API_BASE}/status`)
}

// Conversations
export async function listConversations(limit = 50, offset = 0): Promise<{ conversations: Conversation[]; total: number }> {
  return fetchJson(`${API_BASE}/conversations?limit=${limit}&offset=${offset}`)
}

export async function getConversation(id: string): Promise<ConversationWithMessages> {
  return fetchJson(`${API_BASE}/conversations/${id}`)
}

export async function createConversation(title?: string): Promise<Conversation> {
  return fetchJson(`${API_BASE}/conversations`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export async function updateConversation(id: string, updates: { title?: string }): Promise<Conversation> {
  return fetchJson(`${API_BASE}/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteConversation(id: string): Promise<{ success: boolean }> {
  return fetchJson(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE',
  })
}

// Messages
export async function addMessage(
  conversationId: string,
  message: {
    role: 'user' | 'assistant'
    content: string
    source?: string
    images?: Array<{ id: string; dataUrl: string; fileName: string; description?: string }>
    activities?: Activity[]
  }
): Promise<Message> {
  return fetchJson(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(message),
  })
}

// Search
export async function searchMessages(query: string, limit = 50): Promise<{ results: SearchResult[] }> {
  return fetchJson(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=${limit}`)
}

// Migration
export async function migrateFromLocalStorage(conversations: Array<{
  id: string
  title: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    images?: MessageImage[]
  }>
  activities?: Activity[]
  createdAt: number
  updatedAt: number
}>): Promise<MigrationResult> {
  return fetchJson(`${API_BASE}/migrate`, {
    method: 'POST',
    body: JSON.stringify({ conversations }),
  })
}

// Check if migration is needed
export function needsMigration(): boolean {
  return localStorage.getItem('talkboy_migrated') !== 'true'
}

// Mark migration as complete
export function markMigrationComplete(): void {
  localStorage.setItem('talkboy_migrated', 'true')
}

// Check if database is available
export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    const status = await getStatus()
    return status.dbStatus === 'connected'
  } catch {
    return false
  }
}
