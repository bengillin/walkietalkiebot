/**
 * Smoke test for the built MCP server: spawn mcp-server/dist/index.js over
 * stdio exactly as Claude Code does, and talk raw JSON-RPC to it.
 *
 * Every run uses a throwaway HOME (and WTB_DIR) so it never touches the real
 * ~/.wtb database, and points WTB_URL at either a closed port (server down) or
 * a stub HTTP server that records what the proxy tools send.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { createServer, type IncomingMessage, type Server } from 'http'
import { createServer as createNetServer, type AddressInfo } from 'net'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENTRY = join(ROOT, 'mcp-server', 'dist', 'index.js')

interface ToolCallResult {
  content: { type: string; text: string }[]
  isError?: boolean
}

class McpClient {
  private readonly proc: ChildProcessWithoutNullStreams
  private buffer = ''
  private nextId = 1
  private readonly pending = new Map<number, (msg: Record<string, unknown>) => void>()
  /** Every line the server wrote to stdout, for protocol-hygiene checks. */
  readonly stdoutLines: string[] = []
  stderr = ''

  constructor(env: Record<string, string>) {
    this.proc = spawn(process.execPath, [ENTRY], {
      env: { PATH: process.env.PATH ?? '', ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.proc.stderr.on('data', (chunk: Buffer) => (this.stderr += chunk.toString()))
    this.proc.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      let nl: number
      while ((nl = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, nl)
        this.buffer = this.buffer.slice(nl + 1)
        if (!line.trim()) continue
        this.stdoutLines.push(line)
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(line)
        } catch {
          continue // asserted on separately via stdoutLines
        }
        const resolveFn = this.pending.get(msg.id as number)
        if (resolveFn) {
          this.pending.delete(msg.id as number)
          resolveFn(msg)
        }
      }
    })
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.nextId++
    return new Promise((resolveFn, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${method}\nstderr:\n${this.stderr}`)),
        15_000,
      )
      this.pending.set(id, (msg) => {
        clearTimeout(timer)
        resolveFn(msg)
      })
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }

  notify(method: string): void {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n')
  }

  async initialize(): Promise<Record<string, unknown>> {
    const res = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'wtb-smoke-test', version: '1.0.0' },
    })
    this.notify('notifications/initialized')
    return res
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    const res = await this.request('tools/call', { name, arguments: args })
    if (res.error) throw new Error(`tools/call ${name} failed: ${JSON.stringify(res.error)}`)
    return res.result as ToolCallResult
  }

  close(): Promise<void> {
    return new Promise((resolveFn) => {
      if (this.proc.exitCode !== null) return resolveFn()
      this.proc.once('exit', () => resolveFn())
      this.proc.kill()
    })
  }
}

const text = (r: ToolCallResult) => r.content[0]?.text ?? ''
const json = (r: ToolCallResult) => JSON.parse(text(r)) as Record<string, unknown>

/** A port with nothing listening on it. */
async function closedPort(): Promise<number> {
  const srv = createNetServer()
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
  const { port } = srv.address() as AddressInfo
  await new Promise<void>((r) => srv.close(() => r()))
  return port
}

function scratchEnv(home: string, wtbUrl: string): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    WTB_DIR: join(home, '.wtb'),
    WTB_URL: wtbUrl,
    WTB_TELEMETRY: '0',
    // Debug logging makes the server's db modules chatty; none of it may reach stdout.
    WTB_LOG_LEVEL: 'debug',
  }
}

beforeAll(() => {
  if (!existsSync(ENTRY)) {
    throw new Error(`${ENTRY} not found: run \`npm run build:server\` before this test`)
  }
})

describe('MCP server with the WTB server down', () => {
  let home: string
  let client: McpClient

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), 'wtb-mcp-smoke-'))
    client = new McpClient(scratchEnv(home, `http://127.0.0.1:${await closedPort()}`))
  })

  afterAll(async () => {
    await client?.close()
    rmSync(home, { recursive: true, force: true })
  })

  it('initializes and lists all 30 tools', async () => {
    const init = await client.initialize()
    expect((init.result as { serverInfo: { name: string } }).serverInfo.name).toBe('wtb')

    const list = await client.request('tools/list')
    const tools = (list.result as { tools: { name: string }[] }).tools
    expect(tools).toHaveLength(30)
    expect(tools.map((t) => t.name)).toContain('list_conversations')
  })

  it('runs data tools offline against SQLite', async () => {
    const created = await client.call('create_conversation', { title: 'Smoke tape' })
    expect(created.isError).toBeFalsy()
    const conv = json(created)
    expect(conv.title).toBe('Smoke tape')
    expect(typeof conv.id).toBe('string')

    const added = await client.call('add_message', {
      conversationId: conv.id,
      role: 'user',
      content: 'flux capacitor calibration',
    })
    expect(added.isError).toBeFalsy()

    const listed = json(await client.call('list_conversations'))
    expect(listed.total).toBe(1)
    expect((listed.conversations as { id: string }[])[0]?.id).toBe(conv.id)

    const found = json(await client.call('search_conversations', { query: 'capacitor' }))
    expect((found.results as unknown[]).length).toBeGreaterThan(0)

    // It really went to the database under the scratch HOME, not over HTTP.
    expect(existsSync(join(home, '.wtb', 'wtb.db'))).toBe(true)
    expect(client.stderr).not.toContain('Direct SQLite access unavailable')
  })

  it('flags not-found data results as errors', async () => {
    const r = await client.call('get_conversation', { conversationId: 'nope' })
    expect(r.isError).toBe(true)
    // Writes to ids that don't exist used to report success.
    for (const [tool, args] of [
      ['delete_conversation', { conversationId: 'nope' }],
      ['set_liner_notes', { conversationId: 'nope', linerNotes: 'x' }],
      ['update_plan', { planId: 'nope', title: 'x' }],
      ['delete_plan', { planId: 'nope' }],
    ] as const) {
      expect((await client.call(tool, args)).isError, tool).toBe(true)
    }
  })

  it('rejects missing required arguments', async () => {
    const r = await client.call('get_conversation', {})
    expect(r.isError).toBe(true)
    expect(json(r).error).toContain('missing required argument "conversationId"')
  })

  it('reports server tools as "not running" with isError', async () => {
    const r = await client.call('get_wtb_status')
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('not running')
  })

  it('keeps stdout pure JSON-RPC even at WTB_LOG_LEVEL=debug', () => {
    // The db modules did log (schema migrations at debug), just not to stdout.
    expect(client.stderr).toContain('[db]')
    expect(client.stdoutLines.length).toBeGreaterThan(0)
    for (const line of client.stdoutLines) {
      expect(() => JSON.parse(line), `non-JSON on stdout: ${line}`).not.toThrow()
    }
  })
})

describe('MCP server proxying to a WTB server', () => {
  interface Seen {
    method: string
    url: string
    auth: string | undefined
    body: string
  }
  const seen: Seen[] = []
  let stub: Server
  let home: string
  let client: McpClient

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((r) => {
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString()))
      req.on('end', () => r(body))
    })

  beforeAll(async () => {
    stub = createServer(async (req, res) => {
      const body = await readBody(req)
      seen.push({
        method: req.method ?? '',
        url: req.url ?? '',
        auth: req.headers.authorization,
        body,
      })
      res.setHeader('Content-Type', 'application/json')
      if (req.url === '/api/transcript') {
        res.statusCode = 401
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }
      res.end(JSON.stringify({ ok: true }))
    })
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', () => r()))
    const { port } = stub.address() as AddressInfo

    home = mkdtempSync(join(tmpdir(), 'wtb-mcp-smoke-'))
    client = new McpClient({
      ...scratchEnv(home, `http://127.0.0.1:${port}`),
      WTB_AUTH_TOKEN: 'smoke-secret',
    })
    await client.initialize()
  })

  afterAll(async () => {
    await client?.close()
    await new Promise<void>((r) => stub.close(() => r()))
    rmSync(home, { recursive: true, force: true })
  })

  const last = () => seen[seen.length - 1] as Seen

  it('sends the bearer token', async () => {
    await client.call('get_wtb_status')
    expect(last().auth).toBe('Bearer smoke-secret')
  })

  it('URL-encodes ids in proxied paths', async () => {
    await client.call('get_wtb_job', { jobId: '../status' })
    expect(last().url).toBe('/api/jobs/..%2Fstatus')
  })

  it('passes the list_wtb_jobs status filter', async () => {
    await client.call('list_wtb_jobs', { status: 'running' })
    expect(last().url).toBe('/api/jobs?status=running')
  })

  it('forwards only documented update_wtb_state fields', async () => {
    await client.call('update_wtb_state', { avatarState: 'thinking', messages: ['injected'] })
    expect(last().url).toBe('/api/state')
    expect(JSON.parse(last().body)).toEqual({ avatarState: 'thinking' })

    const bad = await client.call('update_wtb_state', { avatarState: 'dancing' })
    expect(bad.isError).toBe(true)
  })

  it('posts analyze_image to the route that exists', async () => {
    await client.call('analyze_image', { dataUrl: 'data:image/png;base64,AAAA' })
    expect(last().url).toBe('/api/analyze-image-cc')
    expect(JSON.parse(last().body)).toEqual({ dataUrl: 'data:image/png;base64,AAAA' })
  })

  it('explains a 401 in terms of WTB_AUTH_TOKEN', async () => {
    const r = await client.call('get_transcript')
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('WTB_AUTH_TOKEN')
    expect(text(r)).not.toContain('not running')
  })
})
