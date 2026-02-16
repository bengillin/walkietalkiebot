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

// Liner Notes
export async function getLinerNotes(conversationId: string): Promise<{ linerNotes: string | null }> {
  return fetchJson(`${API_BASE}/conversations/${conversationId}/liner-notes`)
}

export async function saveLinerNotes(conversationId: string, linerNotes: string | null): Promise<{ success: boolean }> {
  return fetchJson(`${API_BASE}/conversations/${conversationId}/liner-notes`, {
    method: 'PUT',
    body: JSON.stringify({ linerNotes }),
  })
}

// Integrations
export interface IntegrationsStatus {
  mcp: {
    configured: boolean
    toolCount: number
    tools: string[]
    transport: string
  }
  telegram: {
    configured: boolean
  }
}

export async function getIntegrations(): Promise<IntegrationsStatus> {
  return fetchJson(`${API_BASE}/integrations`)
}

// Jobs
export interface Job {
  id: string
  conversation_id: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  source: string
  result: string | null
  error: string | null
  pid: number | null
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
}

export async function createJob(params: {
  conversationId: string
  prompt: string
  source?: string
  history?: Array<{ role: string; content: string }>
}): Promise<{ id: string; status: string }> {
  return fetchJson(`${API_BASE}/jobs`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function listJobs(filters?: {
  status?: string
  conversationId?: string
}): Promise<{ jobs: Job[] }> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.conversationId) params.set('conversationId', filters.conversationId)
  const query = params.toString()
  return fetchJson(`${API_BASE}/jobs${query ? `?${query}` : ''}`)
}

export async function getJob(id: string): Promise<Job> {
  return fetchJson(`${API_BASE}/jobs/${id}`)
}

export async function cancelJob(id: string): Promise<{ success: boolean }> {
  return fetchJson(`${API_BASE}/jobs/${id}`, { method: 'DELETE' })
}

export function subscribeToJobEvents(
  jobId: string,
  onEvent: (event: { type: string; data: string }) => void,
  onDone?: () => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/jobs/${jobId}/events`)

  eventSource.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data)
      if (parsed.done) {
        onDone?.()
        eventSource.close()
        return
      }
      onEvent(parsed)
    } catch {
      // Ignore parse errors
    }
  }

  eventSource.onerror = () => {
    eventSource.close()
    onDone?.()
  }

  return () => eventSource.close()
}
