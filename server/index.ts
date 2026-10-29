import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer as createHttpsServer, ServerOptions } from 'https'
import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server } from 'http'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getSSLCerts, ensureWtbDir } from './ssl.js'
import { api } from './api.js'
import { initDb, closeDb } from './db/index.js'
import * as conversationsRepo from './db/repositories/conversations.js'
import * as messagesRepo from './db/repositories/messages.js'
import { updateState } from './state.js'
import { getNotificationDispatcher } from './notifications/dispatcher.js'
import { MacOSNotificationChannel } from './notifications/macos.js'
import { getJobManager } from './jobs/manager.js'
import { authMiddleware, getAuthToken, hasValidCredentials } from './auth.js'
import { assertSafeBind, isLoopbackHost, requestGuard, resolveBindHosts } from './security.js'

import { createLogger } from './logger.js'

const log = createLogger('server')

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist')

// Max accepted request body. Generous enough for base64 image payloads;
// override with WTB_MAX_BODY_BYTES.
const MAX_BODY_BYTES = Number(process.env.WTB_MAX_BODY_BYTES) || 50 * 1024 * 1024

type AnyServer = Server | import('https').Server
// One listener per bound address (loopback by default means both 127.0.0.1 and ::1).
let servers: AnyServer[] = []

export function startServer(port: number = 5173): Promise<void> {
  return new Promise((resolve, reject) => {
    const hosts = resolveBindHosts()
    try {
      hosts.forEach(assertSafeBind)
    } catch (err) {
      reject(err)
      return
    }

    // Verify dist exists
    if (!existsSync(distPath)) {
      reject(new Error(`dist/ not found at ${distPath}. Run 'npm run build' first.`))
      return
    }

    // Initialize database
    try {
      initDb()
    } catch (err) {
      log.error('Failed to initialize database:', err)
      reject(err)
      return
    }

    // Hydrate in-memory state from most recent conversation
    try {
      const [mostRecent] = conversationsRepo.listConversations(1, 0)
      if (mostRecent) {
        const msgs = messagesRepo.getMessagesForConversation(mostRecent.id)
        const stateMessages = msgs.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        }))
        const lastUser = msgs.filter((m) => m.role === 'user').pop()
        const lastAssistant = msgs.filter((m) => m.role === 'assistant').pop()
        updateState({
          messages: stateMessages,
          lastUserMessage: lastUser?.content || '',
          lastAssistantMessage: lastAssistant?.content || '',
        })
      }
    } catch {
      // Non-critical — state will be updated on first frontend connect
    }

    // Initialize notification system
    const dispatcher = getNotificationDispatcher()
    dispatcher.register(new MacOSNotificationChannel())

    // Initialize job manager (cleans up stale jobs from previous runs)
    const jobManager = getJobManager()
    jobManager.init()

    const app = new Hono()

    // Host / Origin / content-type checks that keep other web pages from driving the
    // API. Runs first so a rejected request never reaches auth or a route.
    app.use('*', requestGuard)

    // Optional shared-secret auth (no-op unless WTB_AUTH_TOKEN is set). Gates both
    // the API and the web UI; must run before any route.
    app.use('*', authMiddleware)

    // Mount API routes
    app.route('/api', api)
    // Unknown API routes are a client bug; don't answer them with the SPA's index.html.
    app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

    // Serve static files from dist/
    app.use('/*', serveStatic({ root: distPath.replace(process.cwd(), '.') }))

    // Fallback to index.html for SPA routing
    app.get('*', (c) => {
      const indexPath = join(distPath, 'index.html')
      if (existsSync(indexPath)) {
        const html = readFileSync(indexPath, 'utf-8')
        return c.html(html)
      }
      return c.text('Not found', 404)
    })

    // Use HTTPS only when Tailscale certs are available (for remote access).
    // Localhost is a secure context in all browsers — HTTP works fine.
    ensureWtbDir()
    const certs = getSSLCerts()
    const protocol = certs ? 'https' : 'http'

    const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
      // Convert Node request to Web Request
      const url = new URL(req.url || '/', `${protocol}://localhost:${port}`)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, v))
          } else {
            headers.set(key, value)
          }
        }
      }

      // Collect request body for POST/PUT/PATCH, bounded to avoid memory-exhaustion DoS.
      let body: Buffer | null = null
      if (req.method && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        // Turn away unauthenticated uploads before reading them, so a client without
        // the token can't make the server buffer MAX_BODY_BYTES per connection.
        if (!hasValidCredentials(req.headers.authorization, req.headers.cookie)) {
          req.resume()
          res.writeHead(401, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }
        const chunks: Buffer[] = []
        let total = 0
        let tooLarge = false
        for await (const chunk of req) {
          total += (chunk as Buffer).length
          if (total > MAX_BODY_BYTES) {
            tooLarge = true
            break
          }
          chunks.push(chunk as Buffer)
        }
        if (tooLarge) {
          req.destroy()
          res.writeHead(413, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Payload too large' }))
          return
        }
        // An empty POST (e.g. /api/modes/reload) has no body, not an empty one.
        body = chunks.length > 0 ? Buffer.concat(chunks) : null
      }

      const request = new Request(url.toString(), {
        method: req.method || 'GET',
        headers,
        body: body,
        // Node-specific; present in @types/node, so no suppression needed.
        duplex: 'half',
      })

      // Call Hono app
      const response = await app.fetch(request)

      // Write response headers
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()))

      // Write response body
      if (response.body) {
        const reader = response.body.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(value)
          }
        } finally {
          reader.releaseLock()
        }
      }
      res.end()
    }

    // An exception in one request (a malformed header, a bug in a route) must
    // answer that request with a 500, not take the whole process down.
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      handleRequest(req, res).catch((err) => {
        log.error('Request failed:', err)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Internal server error' }))
        } else {
          res.destroy()
        }
      })
    }

    const createServer = () =>
      certs
        ? createHttpsServer({ key: certs.key, cert: certs.cert } satisfies ServerOptions, handler)
        : createHttpServer(handler)

    listenAll(createServer, port, hosts)
      .then((bound) => {
        servers = bound
        const loopback = hosts.every(isLoopbackHost)
        const shownHost = loopback ? 'localhost' : hosts[0]
        const url = `${protocol}://${shownHost}:${port}`
        log.info(`Talkie server running at ${url}`)
        if (!loopback) {
          log.info(
            `Listening on ${hosts.join(', ')}, so other machines can reach it. Auth is required.`,
          )
        }
        if (getAuthToken()) {
          log.info(`Auth enabled. Sign in once with: ${url}/?token=<your WTB_AUTH_TOKEN>`)
        }
        resolve()
      })
      .catch(reject)
  })
}

/**
 * Listen on every host, or on none. Loopback means both 127.0.0.1 and ::1: binding
 * only one leaves the other free for another program (Vite binds ::1 on macOS), and
 * `localhost` would then quietly reach that program instead of this one. A missing
 * IPv6 stack is fine; a port taken on either address is an error.
 */
async function listenAll(
  createServer: () => AnyServer,
  port: number,
  hosts: string[],
): Promise<AnyServer[]> {
  const bound: AnyServer[] = []
  try {
    for (const host of hosts) {
      const srv = createServer()
      try {
        await new Promise<void>((resolve, reject) => {
          srv.once('error', reject)
          srv.listen(port, host, () => {
            srv.off('error', reject)
            resolve()
          })
        })
        bound.push(srv)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'EADDRINUSE') throw new Error(`Port ${port} is already in use`)
        if (host === '::1' && (code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT')) {
          log.debug('IPv6 loopback unavailable; listening on 127.0.0.1 only')
          continue
        }
        throw err
      }
    }
    return bound
  } catch (err) {
    bound.forEach((srv) => srv.close())
    throw err
  }
}

export async function stopServer(): Promise<void> {
  closeDb()

  await Promise.all(
    servers.map((srv) => new Promise<void>((resolve) => srv.close(() => resolve()))),
  )
  servers = []
}

// Graceful shutdown handlers
function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    log.debug(`\nReceived ${signal}, shutting down gracefully...`)
    await stopServer()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupShutdownHandlers()
  const port = parseInt(process.env.PORT || '5173', 10)
  startServer(port).catch((err) => {
    log.error('Server failed to start:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
