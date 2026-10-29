import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'
import { spawn, exec } from 'child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import type { ChildProcess } from 'child_process'

// stdout is the JSON-RPC channel: anything else written to it corrupts the
// protocol. The server modules this process imports for the data tools log
// through console.log/info/debug (e.g. schema migrations at
// WTB_LOG_LEVEL=debug), so route those to stderr before any of them load. The
// SDK's stdio transport writes to process.stdout directly and is unaffected.
console.log = console.error
console.info = console.error
console.debug = console.error

const __dirname = dirname(fileURLToPath(import.meta.url))
const WTB_URL = (
  process.env.WTB_URL || `http://localhost:${process.env.WTB_PORT || '5173'}`
).replace(/\/+$/, '')
// The port launch_wtb starts the server on. Derived from WTB_URL so the two can
// never disagree (they used to: launch on WTB_PORT, probe WTB_URL, time out).
const WTB_PORT = (() => {
  const url = new URL(WTB_URL)
  return Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
})()

// When the server is started with WTB_AUTH_TOKEN, server-dependent tools must
// present it as a bearer token.
function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  const token = process.env.WTB_AUTH_TOKEN
  return token ? { ...base, Authorization: `Bearer ${token}` } : base
}

/**
 * Root of the walkietalkiebot package (the directory whose package.json is
 * named "walkietalkiebot"). Found by walking up rather than a fixed number of
 * `..` hops, so it is right whether this runs as the bundle
 * (mcp-server/dist/index.js), from source (mcp-server/index.ts), or from an npm
 * install (node_modules/walkietalkiebot/...).
 */
function findPackageRoot(start: string): string | null {
  let dir = start
  for (;;) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        if (JSON.parse(readFileSync(pkgPath, 'utf-8')).name === 'walkietalkiebot') return dir
      } catch {
        // unreadable package.json: keep walking
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const PACKAGE_ROOT = findPackageRoot(__dirname)

// ─── Anonymous telemetry: OFF by default, opt in with WTB_TELEMETRY=1 ───
// When enabled it records only the tool name, its category and whether it
// succeeded: never arguments or conversation content. It is opt-in because
// this tool reads your conversations, and nothing should leave the machine
// without the user asking for it.
const POSTHOG_KEY = 'phc_j7rWavXkXFqSjJIvxhnnAMX3I5UmkcCsnU8J0sKAzog'
const TELEMETRY = process.env.WTB_TELEMETRY === '1'
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

let wtbProcess: ChildProcess | null = null

// ─── Types ───

// Alias the SDK's own result type rather than hand-rolling a shape: the local
// interface widened `type` to `string`, which stopped matching the tools/call
// handler signature once the SDK added the `task` result variant.
type ToolResult = CallToolResult

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
  getActivitiesForConversation(
    conversationId: string,
    limit?: number,
  ): Array<Record<string, unknown>>
}

interface DbModules {
  convos: ConversationsModule
  msgs: MessagesModule
  plans: PlansModule
  search: SearchModule
  activities: ActivitiesModule
}

// ─── Results ───

/**
 * Wrap a tool's payload. Any payload carrying an `error` string is flagged
 * `isError` so the client can tell a failed call from a successful one.
 */
function jsonResult(data: unknown): ToolResult {
  const isError =
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { error?: unknown }).error === 'string'
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    ...(isError && { isError: true }),
  }
}

/** The caller passed arguments the tool can't use. */
class InputError extends Error {}

/** The WTB server answered, but not with a 2xx. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}`)
  }
}

/** Percent-encode a value used as a single URL path segment. */
const seg = (value: string) => encodeURIComponent(value)

// ─── HTTP helpers (for server-dependent tools) ───
async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const r = await fetch(`${WTB_URL}${path}`, {
    method,
    headers: authHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  if (!r.ok) throw new HttpError(r.status, await r.text())
  return (await r.json()) as ApiResult
}
const apiGet = (path: string) => api('GET', path)
const apiPost = (path: string, body: unknown) => api('POST', path, body)
const apiPatch = (path: string, body: unknown) => api('PATCH', path, body)
const apiPut = (path: string, body: unknown) => api('PUT', path, body)
const apiDelete = (path: string) => api('DELETE', path)

/** Pull the server's `{ error }` message out of an error response body, if any. */
function serverMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
  } catch {
    // not JSON
  }
  return body.slice(0, 500)
}

/** True when fetch failed because nothing answered at WTB_URL. */
function isConnectionFailure(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  // undici reports network failures as TypeError('fetch failed') with the
  // socket error as `cause` (sometimes an AggregateError carrying the code).
  const cause = (err as TypeError & { cause?: { code?: string; errors?: { code?: string }[] } })
    .cause
  const code = cause?.code ?? cause?.errors?.[0]?.code
  if (code === undefined) return err.message === 'fetch failed'
  return [
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
  ].includes(code)
}

/** Turn a failed server call into a message that says what actually went wrong. */
function describeServerError(err: unknown): string {
  if (err instanceof InputError) return `Invalid input: ${err.message}`
  if (err instanceof HttpError) {
    const detail = serverMessage(err.body)
    if (err.status === 401) {
      return process.env.WTB_AUTH_TOKEN
        ? `The WTB server at ${WTB_URL} rejected the request (401 Unauthorized): the WTB_AUTH_TOKEN set for this MCP server does not match the server's token.`
        : `The WTB server at ${WTB_URL} requires authentication (401 Unauthorized). Set WTB_AUTH_TOKEN in this MCP server's env to the token the server was started with.`
    }
    if (err.status === 404) return `Not found (404): ${detail}`
    if (err.status === 400) return `Bad request (400): ${detail}`
    return `WTB server error (${err.status}): ${detail}`
  }
  if (isConnectionFailure(err)) {
    return `The WTB server is not running at ${WTB_URL}. This is a server tool: start the server with \`npx -y walkietalkiebot\` (or the launch_wtb tool). Data tools (conversations, plans, search, export) work without it.`
  }
  return `Request to the WTB server failed: ${(err as Error)?.message ?? String(err)}`
}

async function serverCall(fn: () => Promise<ApiResult>): Promise<ApiResult> {
  try {
    return await fn()
  } catch (err) {
    return { error: describeServerError(err) }
  }
}

// ─── Database layer (lazy-loaded, for data tools) ───
let db: DbModules | null = null
let dbUnavailableReason: string | null = null

async function getDb(): Promise<DbModules | null> {
  if (db) return db
  if (dbUnavailableReason) return null

  const serverDir = PACKAGE_ROOT ? join(PACKAGE_ROOT, 'server') : null
  const load = (...parts: string[]) =>
    import(pathToFileURL(join(serverDir as string, 'db', ...parts)).href)

  try {
    if (!serverDir) {
      throw new Error(
        `could not locate the walkietalkiebot package root above ${__dirname}, so the server's database modules can't be loaded`,
      )
    }
    const entry = join(serverDir, 'db', 'index.js')
    if (!existsSync(entry)) {
      throw new Error(
        `compiled database module not found at ${entry} (in a source checkout, run \`npm run build:server\`)`,
      )
    }
    const dbIndex = await load('index.js')
    dbIndex.initDb()
    db = {
      convos: await load('repositories', 'conversations.js'),
      msgs: await load('repositories', 'messages.js'),
      plans: await load('repositories', 'plans.js'),
      search: await load('repositories', 'search.js'),
      activities: await load('repositories', 'activities.js'),
    }
    return db
  } catch (err) {
    dbUnavailableReason = (err as Error).message
    console.error(
      `[wtb-mcp] Direct SQLite access unavailable: ${dbUnavailableReason}. Data tools will fall back to the HTTP API at ${WTB_URL}, which only works while the WTB server is running.`,
    )
    return null
  }
}

// ─── Server detection ───

/**
 * Probe the server. `reachable` means something answered HTTP at WTB_URL, even
 * if it was a 401: a running server that wants a token is still running.
 */
async function probeWtb(): Promise<{ reachable: boolean; status?: number }> {
  try {
    const r = await fetch(`${WTB_URL}/api/status`, { headers: authHeaders() })
    return { reachable: true, status: r.status }
  } catch {
    return { reachable: false }
  }
}

// ─── Launch ───
interface LaunchResult {
  success: boolean
  message: string
  url?: string
  error?: string
}

function openBrowser(url: string): void {
  if (process.platform === 'darwin') {
    exec(`open -a "Google Chrome" "${url}" 2>/dev/null || open "${url}"`)
  } else if (process.platform === 'win32') {
    exec(`start "" "${url}"`)
  } else {
    exec(`xdg-open "${url}"`)
  }
}

/**
 * How to start the web server. Prefer this package's own bin/wtb.js under the
 * current Node; only if it isn't on disk fall back to npx with the package
 * named explicitly. (Never bare `npx wtb`: `wtb` on npm is an unrelated
 * package.)
 */
function launchCommand(): { command: string; args: string[] } {
  const localBin = PACKAGE_ROOT ? join(PACKAGE_ROOT, 'bin', 'wtb.js') : null
  if (localBin && existsSync(localBin)) return { command: process.execPath, args: [localBin] }
  return { command: 'npx', args: ['-y', '-p', 'walkietalkiebot', 'wtb'] }
}

function tail(path: string, max = 2000): string {
  try {
    const text = readFileSync(path, 'utf-8').trim()
    return text.length > max ? `…${text.slice(-max)}` : text
  } catch {
    return ''
  }
}

async function launchWtb(): Promise<LaunchResult> {
  const probe = await probeWtb()
  if (probe.reachable) {
    openBrowser(WTB_URL)
    return {
      success: true,
      message:
        probe.status === 401
          ? 'Walkie Talkie Bot is already running (it requires WTB_AUTH_TOKEN to use the API)'
          : 'Walkie Talkie Bot is already running',
      url: WTB_URL,
    }
  }

  // The server is detached so it outlives this MCP process, which means it
  // can't inherit a pipe from us (a closed pipe would kill it with EPIPE).
  // Capture its output in a log file instead, and quote it back on failure.
  // A fresh private directory, not a fixed name in the shared tmp dir, where a
  // pre-planted symlink would make us truncate whatever it points at.
  const logPath = join(mkdtempSync(join(tmpdir(), 'wtb-launch-')), 'server.log')
  const { command, args } = launchCommand()
  const logFd = openSync(logPath, 'wx')

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: LaunchResult) => {
      if (settled) return
      settled = true
      clearInterval(check)
      resolve(result)
    }
    const failure = (why: string): LaunchResult => {
      const output = tail(logPath)
      const message = `Walkie Talkie Bot failed to start: ${why}`
      return {
        success: false,
        message,
        error: output ? `${message}\n\nServer output (${logPath}):\n${output}` : message,
      }
    }

    try {
      wtbProcess = spawn(command, args, {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env, WTB_PORT: String(WTB_PORT) },
      })
    } finally {
      closeSync(logFd)
    }
    wtbProcess.on('error', (err) =>
      finish(failure(`could not run ${command}: ${(err as Error).message}`)),
    )
    wtbProcess.on('exit', (code, signal) => {
      if (code !== 0) finish(failure(`process exited with ${signal ?? `code ${code}`}`))
    })
    wtbProcess.unref()

    let attempts = 0
    const check = setInterval(async () => {
      if ((await probeWtb()).reachable) {
        finish({ success: true, message: 'Walkie Talkie Bot launched', url: WTB_URL })
      } else if (++attempts > 30) {
        finish(failure(`no response at ${WTB_URL} after 15s`))
      }
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

function formatMarkdown(
  conv: ConversationData,
  messages: MessageData[],
  activities: ActivityData[],
): string {
  let md = `# ${conv.title || 'Untitled'}\n\n`
  if (conv.created_at) md += `*Created: ${new Date(conv.created_at).toLocaleString()}*\n\n---\n\n`
  for (const msg of messages) {
    md += `**${msg.role === 'user' ? 'You' : 'Assistant'}:**\n\n${msg.content}\n\n---\n\n`
  }
  if (activities.length) {
    md += '## Tool Activity\n\n'
    for (const a of activities)
      md += `- **${a.tool}** (${a.status})${a.duration ? ` ${a.duration}ms` : ''}\n`
  }
  return md
}

// ─── Tool Definitions (30 tools) ───
const TOOLS: Tool[] = [
  // ── Server tools (require running WTB server) ──
  {
    name: 'launch_wtb',
    description: 'Launch the Walkie Talkie Bot voice interface in a browser.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_wtb_status',
    description: 'Check if Walkie Talkie Bot is running and get its current state.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_transcript',
    description: 'Get the latest voice transcript.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_conversation_history',
    description: 'Get the full conversation history from the current tape.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_claude_session',
    description: 'Get the current Claude Code session ID.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'set_claude_session',
    description: 'Connect to a Claude Code session.',
    inputSchema: {
      type: 'object' as const,
      properties: { sessionId: { type: 'string', description: 'Session ID to connect to' } },
      required: ['sessionId'],
    },
  },
  {
    name: 'disconnect_claude_session',
    description: 'Disconnect the current Claude Code session.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_pending_message',
    description: 'Poll for a pending user message in IPC mode.',
    inputSchema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'respond_to_wtb',
    description: 'Send a response back in IPC mode.',
    inputSchema: {
      type: 'object' as const,
      properties: { content: { type: 'string', description: 'Response content' } },
      required: ['content'],
    },
  },
  {
    name: 'update_wtb_state',
    description: 'Update UI state (avatar state, transcript).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        avatarState: {
          type: 'string',
          enum: ['idle', 'listening', 'thinking', 'speaking'],
          description: 'Avatar state',
        },
        transcript: { type: 'string', description: 'Transcript text' },
      },
      required: [],
    },
  },
  {
    name: 'analyze_image',
    description:
      'Analyze an image with Claude vision (runs through Claude Code on the WTB server).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dataUrl: { type: 'string', description: 'Base64 data URL of the image' },
        fileName: { type: 'string', description: 'Optional filename' },
      },
      required: ['dataUrl'],
    },
  },
  {
    name: 'open_url',
    description: 'Open a URL in the default browser.',
    inputSchema: {
      type: 'object' as const,
      properties: { url: { type: 'string', description: 'URL to open' } },
      required: ['url'],
    },
  },
  {
    name: 'create_wtb_job',
    description: 'Create a background job.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        prompt: { type: 'string', description: 'Task/prompt to execute' },
      },
      required: ['conversationId', 'prompt'],
    },
  },
  {
    name: 'get_wtb_job',
    description: 'Get the status and result of a background job.',
    inputSchema: {
      type: 'object' as const,
      properties: { jobId: { type: 'string', description: 'Job ID' } },
      required: ['jobId'],
    },
  },
  {
    name: 'list_wtb_jobs',
    description: 'List background jobs, optionally filtered by status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Filter by status',
        },
      },
      required: [],
    },
  },

  // ── Data tools (work offline via direct SQLite) ──
  {
    name: 'list_conversations',
    description: 'List all saved conversations (cassette tapes). Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
      required: [],
    },
  },
  {
    name: 'get_conversation',
    description:
      'Get a full conversation by ID with messages, images, and tool activity. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: { conversationId: { type: 'string', description: 'Conversation ID' } },
      required: ['conversationId'],
    },
  },
  {
    name: 'create_conversation',
    description: 'Create a new conversation (cassette tape). Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Conversation title' },
        id: { type: 'string', description: 'Optional custom ID' },
      },
      required: [],
    },
  },
  {
    name: 'rename_conversation',
    description: 'Rename an existing conversation. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        title: { type: 'string', description: 'New title' },
      },
      required: ['conversationId', 'title'],
    },
  },
  {
    name: 'delete_conversation',
    description: 'Delete a conversation permanently. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: { conversationId: { type: 'string', description: 'Conversation ID' } },
      required: ['conversationId'],
    },
  },
  {
    name: 'search_conversations',
    description:
      'Full-text search across all conversations. Uses FTS5 for ranked results. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'add_message',
    description: 'Add a message to a conversation. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role' },
        content: { type: 'string', description: 'Message content' },
        source: { type: 'string', description: 'Source (default "mcp")' },
      },
      required: ['conversationId', 'role', 'content'],
    },
  },
  {
    name: 'list_plans',
    description: 'List all plans. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
        offset: { type: 'number', description: 'Pagination offset (default 0)' },
      },
      required: [],
    },
  },
  {
    name: 'get_plan',
    description: 'Get a plan by ID with full content. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: { planId: { type: 'string', description: 'Plan ID' } },
      required: ['planId'],
    },
  },
  {
    name: 'create_plan',
    description:
      'Create a new plan with status workflow (draft > approved > in_progress > completed > archived). Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Plan title' },
        content: { type: 'string', description: 'Plan content (markdown)' },
        status: {
          type: 'string',
          enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'],
          description: 'Initial status (default "draft")',
        },
        conversationId: { type: 'string', description: 'Link to conversation' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'update_plan',
    description: "Update a plan's title, content, or status. Works offline.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        title: { type: 'string', description: 'New title' },
        content: { type: 'string', description: 'New content' },
        status: {
          type: 'string',
          enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'],
          description: 'New status',
        },
      },
      required: ['planId'],
    },
  },
  {
    name: 'delete_plan',
    description: 'Delete a plan permanently. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: { planId: { type: 'string', description: 'Plan ID' } },
      required: ['planId'],
    },
  },
  {
    name: 'get_liner_notes',
    description: 'Get liner notes (markdown annotations) for a conversation. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: { conversationId: { type: 'string', description: 'Conversation ID' } },
      required: ['conversationId'],
    },
  },
  {
    name: 'set_liner_notes',
    description: 'Set or clear liner notes for a conversation. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        linerNotes: { type: 'string', description: 'Markdown content (or null to clear)' },
      },
      required: ['conversationId'],
    },
  },
  {
    name: 'export_conversation',
    description: 'Export a conversation as markdown or JSON. Works offline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        conversationId: { type: 'string', description: 'Conversation ID' },
        format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Export format (default "markdown")',
        },
      },
      required: ['conversationId'],
    },
  },
]

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]))

interface PropertySchema {
  type?: string
  enum?: unknown[]
}

/**
 * Check arguments against the tool's declared schema: required fields present
 * and non-empty, declared types and enums respected. The client is supposed to
 * do this, but nothing guarantees it, and a missing id would otherwise turn
 * into a request for `/api/jobs/undefined`.
 */
function validateArgs(tool: Tool, args: Record<string, unknown>): void {
  const properties = (tool.inputSchema.properties ?? {}) as Record<string, PropertySchema>
  for (const key of tool.inputSchema.required ?? []) {
    const value = args[key]
    if (value === undefined || value === null || value === '') {
      throw new InputError(`missing required argument "${key}"`)
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const schema = properties[key]
    if (!schema || value === undefined || value === null) continue
    if (schema.type && typeof value !== schema.type) {
      throw new InputError(`"${key}" must be a ${schema.type}`)
    }
    if (schema.enum && !schema.enum.includes(value)) {
      throw new InputError(`"${key}" must be one of: ${schema.enum.join(', ')}`)
    }
  }
}

// ─── MCP Server ───
const server = new Server({ name: 'wtb', version: '0.4.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

// ─── Tool Call Handler ───
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params
  const typedArgs = args as ToolArgs

  const tool = TOOLS_BY_NAME.get(name)
  if (!tool) return jsonResult({ error: `Unknown tool: ${name}` })
  try {
    validateArgs(tool, args)
  } catch (err) {
    return jsonResult({ error: describeServerError(err) })
  }

  try {
    // ════════════════════════════════════════
    // SERVER TOOLS (require WTB server running)
    // ════════════════════════════════════════
    const serverTools: Record<string, () => Promise<ApiResult | LaunchResult>> = {
      launch_wtb: () => launchWtb(),
      get_wtb_status: () => serverCall(() => apiGet('/api/status')),
      get_transcript: () => serverCall(() => apiGet('/api/transcript')),
      get_conversation_history: () => serverCall(() => apiGet('/api/history')),
      get_claude_session: () => serverCall(() => apiGet('/api/session')),
      set_claude_session: () =>
        serverCall(() =>
          apiPost('/api/session', { sessionId: (typedArgs as SetSessionArgs).sessionId }),
        ),
      disconnect_claude_session: () => serverCall(() => apiDelete('/api/session')),
      get_pending_message: () => serverCall(() => apiGet('/api/pending')),
      respond_to_wtb: () =>
        serverCall(() => apiPost('/api/respond', { content: (typedArgs as RespondArgs).content })),
      update_wtb_state: () =>
        serverCall(() => {
          // Forward only the fields this tool documents, never arbitrary keys:
          // the server merges the body straight into its shared UI state.
          const a = typedArgs as UpdateStateArgs
          const update: UpdateStateArgs = {}
          if (a.avatarState !== undefined) update.avatarState = a.avatarState
          if (a.transcript !== undefined) update.transcript = a.transcript
          if (Object.keys(update).length === 0) {
            throw new InputError('provide at least one of "avatarState" or "transcript"')
          }
          return apiPost('/api/state', update)
        }),
      analyze_image: () =>
        serverCall(() => {
          const a = typedArgs as AnalyzeImageArgs
          return apiPost('/api/analyze-image-cc', { dataUrl: a.dataUrl, fileName: a.fileName })
        }),
      open_url: () =>
        serverCall(() => apiPost('/api/open-url', { url: (typedArgs as OpenUrlArgs).url })),
      create_wtb_job: () =>
        serverCall(() => {
          const a = typedArgs as CreateJobArgs
          return apiPost('/api/jobs', {
            conversationId: a.conversationId,
            prompt: a.prompt,
            source: 'mcp',
          })
        }),
      get_wtb_job: () =>
        serverCall(() => apiGet(`/api/jobs/${seg((typedArgs as GetJobArgs).jobId)}`)),
      list_wtb_jobs: () =>
        serverCall(() => {
          const a = typedArgs as ListJobsArgs
          const query = a.status ? `?${new URLSearchParams({ status: a.status })}` : ''
          return apiGet(`/api/jobs${query}`)
        }),
    }
    const serverTool = serverTools[name]
    if (serverTool) {
      const result = await serverTool()
      trackTool(name, 'server', !('error' in result))
      return jsonResult(result)
    }

    // ════════════════════════════════════════
    // DATA TOOLS (direct SQLite, work offline)
    // ════════════════════════════════════════
    const d = await getDb()
    if (!d) {
      // DB unavailable — fall back to HTTP proxy
      const result = await serverCall(async () => {
        switch (name) {
          case 'list_conversations': {
            const a = typedArgs as ListConversationsArgs
            return await apiGet(`/api/conversations?limit=${a.limit || 50}&offset=${a.offset || 0}`)
          }
          case 'get_conversation':
            return await apiGet(
              `/api/conversations/${seg((typedArgs as GetConversationArgs).conversationId)}`,
            )
          case 'create_conversation': {
            const a = typedArgs as CreateConversationArgs
            return await apiPost('/api/conversations', {
              title: a.title || 'New conversation',
              ...(a.id && { id: a.id }),
            })
          }
          case 'rename_conversation': {
            const a = typedArgs as RenameConversationArgs
            return await apiPatch(`/api/conversations/${seg(a.conversationId)}`, {
              title: a.title,
            })
          }
          case 'delete_conversation':
            return await apiDelete(
              `/api/conversations/${seg((typedArgs as DeleteConversationArgs).conversationId)}`,
            )
          case 'search_conversations': {
            const a = typedArgs as SearchConversationsArgs
            return await apiGet(
              `/api/search?q=${encodeURIComponent(a.query)}&limit=${a.limit || 50}`,
            )
          }
          case 'add_message': {
            const a = typedArgs as AddMessageArgs
            return await apiPost(`/api/conversations/${seg(a.conversationId)}/messages`, {
              role: a.role,
              content: a.content,
              source: a.source || 'mcp',
            })
          }
          case 'list_plans': {
            const a = typedArgs as ListPlansArgs
            return await apiGet(`/api/plans?limit=${a.limit || 50}&offset=${a.offset || 0}`)
          }
          case 'get_plan':
            return await apiGet(`/api/plans/${seg((typedArgs as GetPlanArgs).planId)}`)
          case 'create_plan': {
            const a = typedArgs as CreatePlanArgs
            return await apiPost('/api/plans', {
              title: a.title,
              content: a.content,
              status: a.status || 'draft',
              conversationId: a.conversationId,
            })
          }
          case 'update_plan': {
            const a = typedArgs as UpdatePlanArgs
            const b: Record<string, string> = {}
            if (a.title !== undefined) b.title = a.title
            if (a.content !== undefined) b.content = a.content
            if (a.status !== undefined) b.status = a.status
            return await apiPut(`/api/plans/${seg(a.planId)}`, b)
          }
          case 'delete_plan':
            return await apiDelete(`/api/plans/${seg((typedArgs as DeletePlanArgs).planId)}`)
          case 'get_liner_notes':
            return await apiGet(
              `/api/conversations/${seg((typedArgs as GetLinerNotesArgs).conversationId)}/liner-notes`,
            )
          case 'set_liner_notes': {
            const a = typedArgs as SetLinerNotesArgs
            return await apiPut(`/api/conversations/${seg(a.conversationId)}/liner-notes`, {
              linerNotes: a.linerNotes ?? null,
            })
          }
          case 'export_conversation': {
            const a = typedArgs as ExportConversationArgs
            const conv = (await apiGet(
              `/api/conversations/${seg(a.conversationId)}`,
            )) as ApiResult & {
              messages?: MessageData[]
              activities?: ActivityData[]
            }
            return a.format === 'json'
              ? { format: 'json', data: conv }
              : {
                  format: 'markdown',
                  data: formatMarkdown(
                    conv as ConversationData,
                    conv.messages || [],
                    conv.activities || [],
                  ),
                }
          }
          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      })
      if (result.error) {
        result.error += `\n\n(Direct database access is unavailable: ${dbUnavailableReason})`
      }
      trackTool(name, 'data-http', !result.error)
      return jsonResult(result)
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
        const imageMap = d.msgs.getImagesForMessages(messages.map((m) => m.id as string))
        const messagesWithImages = messages.map((m) => ({
          ...m,
          images: imageMap.get(m.id as string) || [],
        }))
        const activities = d.activities.getActivitiesForConversation(a.conversationId)
        const linerNotes = d.convos.getLinerNotes(a.conversationId)
        return jsonResult({
          ...conv,
          messages: messagesWithImages,
          activities,
          liner_notes: linerNotes,
        })
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
        if (!d.convos.deleteConversation(a.conversationId)) {
          return jsonResult({ error: 'Conversation not found' })
        }
        return jsonResult({ success: true })
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
        if (!d.plans.getPlan(a.planId)) return jsonResult({ error: 'Plan not found' })
        d.plans.updatePlan(a.planId, updates)
        return jsonResult({ success: true })
      }
      case 'delete_plan': {
        const a = typedArgs as DeletePlanArgs
        if (!d.plans.getPlan(a.planId)) return jsonResult({ error: 'Plan not found' })
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
        if (!d.convos.getConversation(a.conversationId)) {
          return jsonResult({ error: 'Conversation not found' })
        }
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
          const imageMap = d.msgs.getImagesForMessages(messages.map((m) => m.id as string))
          const msgsWithImages = messages.map((m) => ({
            ...m,
            images: imageMap.get(m.id as string) || [],
          }))
          return jsonResult({
            format: 'json',
            data: { ...conv, messages: msgsWithImages, activities },
          })
        }
        return jsonResult({
          format: 'markdown',
          data: formatMarkdown(
            conv as ConversationData,
            messages as unknown as MessageData[],
            activities as unknown as ActivityData[],
          ),
        })
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
  const probe = await probeWtb()
  if (probe.reachable) {
    console.error(
      `Walkie Talkie Bot MCP ready — all 30 tools available (server detected at ${WTB_URL})`,
    )
  } else {
    console.error(
      'Walkie Talkie Bot MCP ready — 15 data tools available (conversations, plans, search, export). Start the server for voice/UI tools: npx -y walkietalkiebot',
    )
  }
}

main().catch((err) => console.error(err))
