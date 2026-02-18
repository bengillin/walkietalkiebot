import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import type { ChildProcess } from 'child_process'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const TALKIE_PORT = parseInt(process.env.TALKIE_PORT || '5173', 10)
const TALKIE_URL = `https://localhost:${TALKIE_PORT}`

// ─── Anonymous telemetry (opt out: TALKIE_TELEMETRY=0) ───
const POSTHOG_KEY = 'phc_j7rWavXkXFqSjJIvxhnnAMX3I5UmkcCsnU8J0sKAzog'
const TELEMETRY = process.env.TALKIE_TELEMETRY !== '0'
function trackTool(toolName: string, category: string, ok: boolean): void {
  if (!TELEMETRY) return
  fetch('https://us.i.posthog.com/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event: 'mcp_tool_called',
      distinct_id: 'anon',
      properties: { tool: toolName, category, success: ok },
    }),
  }).catch(() => {}) // fire-and-forget
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let talkieProcess: ChildProcess | null = null

// ─── Types ───

interface ToolResult {
  content: Array<{ type: string; text: string }>
}

interface ApiResult {
  error?: string
  [key: string]: unknown
}

// Tool argument interfaces
interface SetSessionArgs {
  sessionId: string
}

interface RespondArgs {
  content: string
}

interface UpdateStateArgs {
  avatarState?: 'idle' | 'listening' | 'thinking' | 'speaking'
  transcript?: string
}

interface AnalyzeImageArgs {
  dataUrl: string
  fileName?: string
  apiKey?: string
}

interface OpenUrlArgs {
  url: string
}

interface CreateJobArgs {
  conversationId: string
  prompt: string
}

interface GetJobArgs {
  jobId: string
}

interface ListJobsArgs {
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
}

interface ListConversationsArgs {
  limit?: number
  offset?: number
}

interface GetConversationArgs {
  conversationId: string
}

interface CreateConversationArgs {
  title?: string
  id?: string
}

interface RenameConversationArgs {
  conversationId: string
  title: string
}

interface DeleteConversationArgs {
  conversationId: string
}

interface SearchConversationsArgs {
  query: string
  limit?: number
}

interface AddMessageArgs {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  source?: string
}

interface ListPlansArgs {
  limit?: number
  offset?: number
}

interface GetPlanArgs {
  planId: string
}

interface CreatePlanArgs {
  title: string
  content: string
  status?: 'draft' | 'approved' | 'in_progress' | 'completed' | 'archived'
  conversationId?: string
}

interface UpdatePlanArgs {
  planId: string
  title?: string
  content?: string
  status?: 'draft' | 'approved' | 'in_progress' | 'completed' | 'archived'
}

interface DeletePlanArgs {
  planId: string
}

interface GetLinerNotesArgs {
  conversationId: string
}

interface SetLinerNotesArgs {
  conversationId: string
  linerNotes?: string | null
}

interface ExportConversationArgs {
  conversationId: string
  format?: 'markdown' | 'json'
}

type ToolArgs =
  | SetSessionArgs
  | RespondArgs
  | UpdateStateArgs
  | AnalyzeImageArgs
  | OpenUrlArgs
  | CreateJobArgs
  | GetJobArgs
  | ListJobsArgs
  | ListConversationsArgs
  | GetConversationArgs
  | CreateConversationArgs
  | RenameConversationArgs
  | DeleteConversationArgs
  | SearchConversationsArgs
  | AddMessageArgs
  | ListPlansArgs
  | GetPlanArgs
  | CreatePlanArgs
  | UpdatePlanArgs
  | DeletePlanArgs
  | GetLinerNotesArgs
  | SetLinerNotesArgs
  | ExportConversationArgs
  | Record<string, never>

// Database module interfaces
interface ConversationsModule {
  listConversations(limit: number, offset: number): Array<Record<string, unknown>>
  getConversation(id: string): Record<string, unknown> | null
  createConversation(input: { id: string; title?: string }): Record<string, unknown>
  updateConversation(id: string, input: { title?: string }): Record<string, unknown> | null
  deleteConversation(id: string): boolean
  touchConversation(id: string): void
  updateLinerNotes(id: string, linerNotes: string | null): void
  getLinerNotes(id: string): string | null
  countConversations(): number
}

interface MessagesModule {
  getMessagesForConversation(conversationId: string): Array<Record<string, unknown>>
  getImagesForMessages(messageIds: string[]): Map<string, Array<Record<string, unknown>>>
  createMessage(input: {
    id: string
    conversationId: string
    role: string
    content: string
    source: string
  }): Record<string, unknown>
}

interface PlansModule {
  listPlans(limit: number, offset: number): Array<Record<string, unknown>>
  getPlan(id: string): Record<string, unknown> | undefined
  createPlan(plan: {
    id: string
    title: string
    content: string
    status?: string
    conversationId?: string | null
  }): Record<string, unknown>
  updatePlan(id: string, updates: { title?: string; content?: string; status?: string }): void
  deletePlan(id: string): void
}

interface SearchModule {
  searchMessages(query: string, limit: number): Array<Record<string, unknown>>
}

interface ActivitiesModule {
  getActivitiesForConversation(conversationId: string, limit?: number): Array<Record<string, unknown>>
}

interface DbModules {
  convos: ConversationsModule
  msgs: MessagesModule
  plans: PlansModule
  search: SearchModule
  activities: ActivitiesModule
}

// ─── JSON response wrapper ───
function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

// ─── HTTP helpers (for server-dependent tools) ───
async function apiGet(path: string): Promise<ApiResult> {
  const r = await fetch(`${TALKIE_URL}${path}`)
  return r.ok ? await r.json() as ApiResult : { error: `API error (${r.status}): ${await r.text()}` }
}
async function apiPost(path: string, body: unknown): Promise<ApiResult> {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.ok ? await r.json() as ApiResult : { error: `API error (${r.status}): ${await r.text()}` }
}
async function apiPatch(path: string, body: unknown): Promise<ApiResult> {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.ok ? await r.json() as ApiResult : { error: `API error (${r.status}): ${await r.text()}` }
}
async function apiPut(path: string, body: unknown): Promise<ApiResult> {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.ok ? await r.json() as ApiResult : { error: `API error (${r.status}): ${await r.text()}` }
}
async function apiDelete(path: string): Promise<ApiResult> {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'DELETE' })
  return r.ok ? await r.json() as ApiResult : { error: `API error (${r.status}): ${await r.text()}` }
}

// ─── Database layer (lazy-loaded, for data tools) ───
let db: DbModules | null = null

async function getDb(): Promise<DbModules | null> {
  if (db) return db
  try {
    const dbIndex = await import(join(__dirname, '..', 'server', 'db', 'index.js'))
    dbIndex.initDb()
    db = {
      convos: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'conversations.js')),
      msgs: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'messages.js')),
      plans: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'plans.js')),
      search: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'search.js')),
      activities: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'activities.js')),
    }
    return db
  } catch (err) {
    console.error('DB init failed, falling back to HTTP:', (err as Error).message)
    return null
  }
}

// ─── Server detection ───
async function isTalkieRunning(): Promise<boolean> {
  try { return (await fetch(`${TALKIE_URL}/api/status`)).ok }
  catch { return false }
}

function serverNotRunning(): ApiResult {
  return { error: 'Talkie server not running. Data tools work offline. Start server with: npx talkiebot' }
}

async function serverCall(fn: () => Promise<ApiResult>): Promise<ApiResult> {
  try { return await fn() }
  catch { return serverNotRunning() }
}

// ─── Launch ───
interface LaunchResult {
  success: boolean
  message: string
  url?: string
}

async function launchTalkie(): Promise<LaunchResult> {
  if (await isTalkieRunning()) {
    exec(`open -a "Google Chrome" ${TALKIE_URL} 2>/dev/null || open ${TALKIE_URL}`)
    return { success: true, message: 'Talkie is already running', url: TALKIE_URL }
  }
  return new Promise((resolve) => {
    talkieProcess = spawn('npx', ['talkie'], { detached: true, stdio: 'ignore', env: { ...process.env, TALKIE_PORT: String(TALKIE_PORT) } })
    talkieProcess.unref()
    let attempts = 0
    const check = setInterval(async () => {
      if (await isTalkieRunning()) { clearInterval(check); resolve({ success: true, message: 'Talkie launched', url: TALKIE_URL }) }
      else if (++attempts > 30) { clearInterval(check); resolve({ success: false, message: 'Talkie failed to start' }) }
    }, 500)
  })
}

// ─── Export formatter ───
interface ConversationData {
  title?: string
  created_at?: string
  [key: string]: unknown
}

interface MessageData {
  role: string
  content: string
  [key: string]: unknown
}

interface ActivityData {
  tool: string
  status: string
  duration?: number
  [key: string]: unknown
}

function formatMarkdown(conv: ConversationData, messages: MessageData[], activities: ActivityData[]): string {
  let md = `# ${conv.title || 'Untitled'}\n\n`
  if (conv.created_at) md += `*Created: ${new Date(conv.created_at).toLocaleString()}*\n\n---\n\n`
  for (const msg of messages) {
    md += `**${msg.role === 'user' ? 'You' : 'Assistant'}:**\n\n${msg.content}\n\n---\n\n`
  }
  if (activities.length) {
    md += '## Tool Activity\n\n'
    for (const a of activities) md += `- **${a.tool}** (${a.status})${a.duration ? ` ${a.duration}ms` : ''}\n`
  }
  return md
}

// ─── MCP Server ───
const server = new Server(
  { name: 'talkie', version: '0.3.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions (30 tools) ───
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Server tools (require running Talkie server) ──
    { name: 'launch_talkie', description: 'Launch the Talkie voice interface in a browser.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'get_talkie_status', description: 'Check if Talkie is running and get its current state.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'get_transcript', description: 'Get the latest voice transcript from Talkie.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'get_conversation_history', description: 'Get the full conversation history from the current tape in Talkie.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'get_claude_session', description: 'Get the current Claude Code session ID.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'set_claude_session', description: 'Connect Talkie to a Claude Code session.', inputSchema: { type: 'object' as const, properties: { sessionId: { type: 'string', description: 'Session ID to connect to' } }, required: ['sessionId'] } },
    { name: 'disconnect_claude_session', description: 'Disconnect the current Claude Code session.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'get_pending_message', description: 'Poll for a pending user message in IPC mode.', inputSchema: { type: 'object' as const, properties: {}, required: [] } },
    { name: 'respond_to_talkie', description: 'Send a response back to Talkie in IPC mode.', inputSchema: { type: 'object' as const, properties: { content: { type: 'string', description: 'Response content' } }, required: ['content'] } },
    { name: 'update_talkie_state', description: 'Update Talkie UI state (avatar state, transcript).', inputSchema: { type: 'object' as const, properties: { avatarState: { type: 'string', enum: ['idle', 'listening', 'thinking', 'speaking'], description: 'Avatar state' }, transcript: { type: 'string', description: 'Transcript text' } }, required: [] } },
    { name: 'analyze_image', description: 'Analyze an image using Claude vision API.', inputSchema: { type: 'object' as const, properties: { dataUrl: { type: 'string', description: 'Base64 data URL of the image' }, fileName: { type: 'string', description: 'Optional filename' }, apiKey: { type: 'string', description: 'Optional Anthropic API key' } }, required: ['dataUrl'] } },
    { name: 'open_url', description: 'Open a URL in the default browser.', inputSchema: { type: 'object' as const, properties: { url: { type: 'string', description: 'URL to open' } }, required: ['url'] } },
    { name: 'create_talkie_job', description: 'Create a background job in Talkie.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' }, prompt: { type: 'string', description: 'Task/prompt to execute' } }, required: ['conversationId', 'prompt'] } },
    { name: 'get_talkie_job', description: 'Get the status and result of a background job.', inputSchema: { type: 'object' as const, properties: { jobId: { type: 'string', description: 'Job ID' } }, required: ['jobId'] } },
    { name: 'list_talkie_jobs', description: 'List background jobs, optionally filtered by status.', inputSchema: { type: 'object' as const, properties: { status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], description: 'Filter by status' } }, required: [] } },

    // ── Data tools (work offline via direct SQLite) ──
    { name: 'list_conversations', description: 'List all saved conversations (cassette tapes). Works offline.', inputSchema: { type: 'object' as const, properties: { limit: { type: 'number', description: 'Max results (default 50)' }, offset: { type: 'number', description: 'Pagination offset (default 0)' } }, required: [] } },
    { name: 'get_conversation', description: 'Get a full conversation by ID with messages, images, and tool activity. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' } }, required: ['conversationId'] } },
    { name: 'create_conversation', description: 'Create a new conversation (cassette tape). Works offline.', inputSchema: { type: 'object' as const, properties: { title: { type: 'string', description: 'Conversation title' }, id: { type: 'string', description: 'Optional custom ID' } }, required: [] } },
    { name: 'rename_conversation', description: 'Rename an existing conversation. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' }, title: { type: 'string', description: 'New title' } }, required: ['conversationId', 'title'] } },
    { name: 'delete_conversation', description: 'Delete a conversation permanently. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' } }, required: ['conversationId'] } },
    { name: 'search_conversations', description: 'Full-text search across all conversations. Uses FTS5 for ranked results. Works offline.', inputSchema: { type: 'object' as const, properties: { query: { type: 'string', description: 'Search query' }, limit: { type: 'number', description: 'Max results (default 50)' } }, required: ['query'] } },
    { name: 'add_message', description: 'Add a message to a conversation. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' }, role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role' }, content: { type: 'string', description: 'Message content' }, source: { type: 'string', description: 'Source (default "mcp")' } }, required: ['conversationId', 'role', 'content'] } },
    { name: 'list_plans', description: 'List all plans. Works offline.', inputSchema: { type: 'object' as const, properties: { limit: { type: 'number', description: 'Max results (default 50)' }, offset: { type: 'number', description: 'Pagination offset (default 0)' } }, required: [] } },
    { name: 'get_plan', description: 'Get a plan by ID with full content. Works offline.', inputSchema: { type: 'object' as const, properties: { planId: { type: 'string', description: 'Plan ID' } }, required: ['planId'] } },
    { name: 'create_plan', description: 'Create a new plan with status workflow (draft > approved > in_progress > completed > archived). Works offline.', inputSchema: { type: 'object' as const, properties: { title: { type: 'string', description: 'Plan title' }, content: { type: 'string', description: 'Plan content (markdown)' }, status: { type: 'string', enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'], description: 'Initial status (default "draft")' }, conversationId: { type: 'string', description: 'Link to conversation' } }, required: ['title', 'content'] } },
    { name: 'update_plan', description: 'Update a plan\'s title, content, or status. Works offline.', inputSchema: { type: 'object' as const, properties: { planId: { type: 'string', description: 'Plan ID' }, title: { type: 'string', description: 'New title' }, content: { type: 'string', description: 'New content' }, status: { type: 'string', enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'], description: 'New status' } }, required: ['planId'] } },
    { name: 'delete_plan', description: 'Delete a plan permanently. Works offline.', inputSchema: { type: 'object' as const, properties: { planId: { type: 'string', description: 'Plan ID' } }, required: ['planId'] } },
    { name: 'get_liner_notes', description: 'Get liner notes (markdown annotations) for a conversation. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' } }, required: ['conversationId'] } },
    { name: 'set_liner_notes', description: 'Set or clear liner notes for a conversation. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' }, linerNotes: { type: 'string', description: 'Markdown content (or null to clear)' } }, required: ['conversationId'] } },
    { name: 'export_conversation', description: 'Export a conversation as markdown or JSON. Works offline.', inputSchema: { type: 'object' as const, properties: { conversationId: { type: 'string', description: 'Conversation ID' }, format: { type: 'string', enum: ['markdown', 'json'], description: 'Export format (default "markdown")' } }, required: ['conversationId'] } },
  ],
}))

// ─── Tool Call Handler ───
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params
  const typedArgs = args as ToolArgs

  try {
    // ════════════════════════════════════════
    // SERVER TOOLS (require Talkie running)
    // ════════════════════════════════════════
    const serverTools: Record<string, () => Promise<ApiResult | LaunchResult>> = {
      launch_talkie: () => launchTalkie(),
      get_talkie_status: () => serverCall(() => apiGet('/api/status')),
      get_transcript: () => serverCall(() => apiGet('/api/transcript')),
      get_conversation_history: () => serverCall(() => apiGet('/api/history')),
      get_claude_session: () => serverCall(() => apiGet('/api/session')),
      set_claude_session: () => serverCall(() => apiPost('/api/session', { sessionId: (typedArgs as SetSessionArgs).sessionId })),
      disconnect_claude_session: () => serverCall(() => apiDelete('/api/session')),
      get_pending_message: () => serverCall(() => apiGet('/api/pending')),
      respond_to_talkie: () => serverCall(() => apiPost('/api/respond', { content: (typedArgs as RespondArgs).content })),
      update_talkie_state: () => serverCall(() => apiPost('/api/state', typedArgs)),
      analyze_image: () => serverCall(() => {
        const a = typedArgs as AnalyzeImageArgs
        return apiPost('/api/analyze-image', { dataUrl: a.dataUrl, fileName: a.fileName, apiKey: a.apiKey })
      }),
      open_url: () => serverCall(() => apiPost('/api/open-url', { url: (typedArgs as OpenUrlArgs).url })),
      create_talkie_job: () => serverCall(() => {
        const a = typedArgs as CreateJobArgs
        return apiPost('/api/jobs', { conversationId: a.conversationId, prompt: a.prompt, source: 'mcp' })
      }),
      get_talkie_job: () => serverCall(() => apiGet(`/api/jobs/${(typedArgs as GetJobArgs).jobId}`)),
      list_talkie_jobs: () => serverCall(() => {
        const a = typedArgs as ListJobsArgs
        return apiGet(`/api/jobs${a.status ? `?status=${a.status}` : ''}`)
      }),
    }
    if (serverTools[name]) {
      const result = await serverTools[name]()
      trackTool(name, 'server', !('error' in result))
      return jsonResult(result)
    }

    // ════════════════════════════════════════
    // DATA TOOLS (direct SQLite, work offline)
    // ════════════════════════════════════════
    const d = await getDb()
    if (!d) {
      // DB unavailable — fall back to HTTP proxy
      return jsonResult(await serverCall(async () => {
        switch (name) {
          case 'list_conversations': {
            const a = typedArgs as ListConversationsArgs
            return await apiGet(`/api/conversations?limit=${a.limit || 50}&offset=${a.offset || 0}`)
          }
          case 'get_conversation':
            return await apiGet(`/api/conversations/${(typedArgs as GetConversationArgs).conversationId}`)
          case 'create_conversation': {
            const a = typedArgs as CreateConversationArgs
            return await apiPost('/api/conversations', { title: a.title || 'New conversation', ...(a.id && { id: a.id }) })
          }
          case 'rename_conversation': {
            const a = typedArgs as RenameConversationArgs
            return await apiPatch(`/api/conversations/${a.conversationId}`, { title: a.title })
          }
          case 'delete_conversation':
            return await apiDelete(`/api/conversations/${(typedArgs as DeleteConversationArgs).conversationId}`)
          case 'search_conversations': {
            const a = typedArgs as SearchConversationsArgs
            return await apiGet(`/api/search?q=${encodeURIComponent(a.query)}&limit=${a.limit || 50}`)
          }
          case 'add_message': {
            const a = typedArgs as AddMessageArgs
            return await apiPost(`/api/conversations/${a.conversationId}/messages`, { role: a.role, content: a.content, source: a.source || 'mcp' })
          }
          case 'list_plans': {
            const a = typedArgs as ListPlansArgs
            return await apiGet(`/api/plans?limit=${a.limit || 50}&offset=${a.offset || 0}`)
          }
          case 'get_plan':
            return await apiGet(`/api/plans/${(typedArgs as GetPlanArgs).planId}`)
          case 'create_plan': {
            const a = typedArgs as CreatePlanArgs
            return await apiPost('/api/plans', { title: a.title, content: a.content, status: a.status || 'draft', conversationId: a.conversationId })
          }
          case 'update_plan': {
            const a = typedArgs as UpdatePlanArgs
            const b: Record<string, string> = {}
            if (a.title !== undefined) b.title = a.title
            if (a.content !== undefined) b.content = a.content
            if (a.status !== undefined) b.status = a.status
            return await apiPut(`/api/plans/${a.planId}`, b)
          }
          case 'delete_plan':
            return await apiDelete(`/api/plans/${(typedArgs as DeletePlanArgs).planId}`)
          case 'get_liner_notes':
            return await apiGet(`/api/conversations/${(typedArgs as GetLinerNotesArgs).conversationId}/liner-notes`)
          case 'set_liner_notes': {
            const a = typedArgs as SetLinerNotesArgs
            return await apiPut(`/api/conversations/${a.conversationId}/liner-notes`, { linerNotes: a.linerNotes ?? null })
          }
          case 'export_conversation': {
            const a = typedArgs as ExportConversationArgs
            const conv = await apiGet(`/api/conversations/${a.conversationId}`) as ApiResult & { messages?: MessageData[]; activities?: ActivityData[] }
            if (conv.error) return conv
            return a.format === 'json'
              ? { format: 'json', data: conv }
              : { format: 'markdown', data: formatMarkdown(conv as ConversationData, conv.messages || [], conv.activities || []) }
          }
          default: throw new Error(`Unknown tool: ${name}`)
        }
      }))
    }

    // Direct SQLite calls
    trackTool(name, 'data', true)
    switch (name) {
      case 'list_conversations': {
        const a = typedArgs as ListConversationsArgs
        const convos = d.convos.listConversations(a.limit || 50, a.offset || 0)
        const total = d.convos.countConversations()
        return jsonResult({ conversations: convos, total })
      }
      case 'get_conversation': {
        const a = typedArgs as GetConversationArgs
        const conv = d.convos.getConversation(a.conversationId)
        if (!conv) return jsonResult({ error: 'Conversation not found' })
        const messages = d.msgs.getMessagesForConversation(a.conversationId)
        const imageMap = d.msgs.getImagesForMessages(messages.map(m => m.id as string))
        const messagesWithImages = messages.map(m => ({ ...m, images: imageMap.get(m.id as string) || [] }))
        const activities = d.activities.getActivitiesForConversation(a.conversationId)
        const linerNotes = d.convos.getLinerNotes(a.conversationId)
        return jsonResult({ ...conv, messages: messagesWithImages, activities, liner_notes: linerNotes })
      }
      case 'create_conversation': {
        const a = typedArgs as CreateConversationArgs
        const id = a.id || randomUUID()
        const conv = d.convos.createConversation({ id, title: a.title })
        return jsonResult(conv)
      }
      case 'rename_conversation': {
        const a = typedArgs as RenameConversationArgs
        const conv = d.convos.updateConversation(a.conversationId, { title: a.title })
        return jsonResult(conv || { error: 'Conversation not found' })
      }
      case 'delete_conversation': {
        const a = typedArgs as DeleteConversationArgs
        const ok = d.convos.deleteConversation(a.conversationId)
        return jsonResult({ success: ok })
      }
      case 'search_conversations': {
        const a = typedArgs as SearchConversationsArgs
        const results = d.search.searchMessages(a.query, a.limit || 50)
        return jsonResult({ results })
      }
      case 'add_message': {
        const a = typedArgs as AddMessageArgs
        const msg = d.msgs.createMessage({
          id: randomUUID(),
          conversationId: a.conversationId,
          role: a.role,
          content: a.content,
          source: a.source || 'mcp',
        })
        return jsonResult(msg)
      }
      case 'list_plans': {
        const a = typedArgs as ListPlansArgs
        const plans = d.plans.listPlans(a.limit || 50, a.offset || 0)
        return jsonResult({ plans })
      }
      case 'get_plan': {
        const a = typedArgs as GetPlanArgs
        const plan = d.plans.getPlan(a.planId)
        return jsonResult(plan || { error: 'Plan not found' })
      }
      case 'create_plan': {
        const a = typedArgs as CreatePlanArgs
        const plan = d.plans.createPlan({
          id: randomUUID(),
          title: a.title,
          content: a.content,
          status: a.status || 'draft',
          conversationId: a.conversationId || null,
        })
        return jsonResult(plan)
      }
      case 'update_plan': {
        const a = typedArgs as UpdatePlanArgs
        const updates: { title?: string; content?: string; status?: string } = {}
        if (a.title !== undefined) updates.title = a.title
        if (a.content !== undefined) updates.content = a.content
        if (a.status !== undefined) updates.status = a.status
        d.plans.updatePlan(a.planId, updates)
        return jsonResult({ success: true })
      }
      case 'delete_plan': {
        const a = typedArgs as DeletePlanArgs
        d.plans.deletePlan(a.planId)
        return jsonResult({ success: true })
      }
      case 'get_liner_notes': {
        const a = typedArgs as GetLinerNotesArgs
        const notes = d.convos.getLinerNotes(a.conversationId)
        return jsonResult({ conversationId: a.conversationId, linerNotes: notes })
      }
      case 'set_liner_notes': {
        const a = typedArgs as SetLinerNotesArgs
        d.convos.updateLinerNotes(a.conversationId, a.linerNotes ?? null)
        return jsonResult({ success: true })
      }
      case 'export_conversation': {
        const a = typedArgs as ExportConversationArgs
        const conv = d.convos.getConversation(a.conversationId)
        if (!conv) return jsonResult({ error: 'Conversation not found' })
        const messages = d.msgs.getMessagesForConversation(a.conversationId)
        const activities = d.activities.getActivitiesForConversation(a.conversationId)
        if (a.format === 'json') {
          const imageMap = d.msgs.getImagesForMessages(messages.map(m => m.id as string))
          const msgsWithImages = messages.map(m => ({ ...m, images: imageMap.get(m.id as string) || [] }))
          return jsonResult({ format: 'json', data: { ...conv, messages: msgsWithImages, activities } })
        }
        return jsonResult({ format: 'markdown', data: formatMarkdown(conv as ConversationData, messages as unknown as MessageData[], activities as unknown as ActivityData[]) })
      }
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err) {
    trackTool(name, 'data', false)
    return jsonResult({ error: (err as Error).message })
  }
})

// ─── Start ───
async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Talkie MCP server running (30 tools — 15 data + 15 server)')
}

main().catch(console.error)
