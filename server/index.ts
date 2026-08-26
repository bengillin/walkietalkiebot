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
import { authMiddleware, getAuthToken } from './auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist')

// Max accepted request body. Generous enough for base64 image payloads;
// override with WTB_MAX_BODY_BYTES.
const MAX_BODY_BYTES = Number(process.env.WTB_MAX_BODY_BYTES) || 50 * 1024 * 1024

let server: Server | import('https').Server | null = null

export function startServer(port: number = 5173): Promise<void> {
  return new Promise((resolve, reject) => {
    // Verify dist exists
    if (!existsSync(distPath)) {
      reject(new Error(`dist/ not found at ${distPath}. Run 'npm run build' first.`))
      return
    }

    // Initialize database
    try {
      initDb()
    } catch (err) {
      console.error('Failed to initialize database:', err)
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

    // Optional shared-secret auth (no-op unless WTB_AUTH_TOKEN is set). Gates both
    // the API and the web UI; must run before any route.
    app.use('*', authMiddleware)

    // Mount API routes
    app.route('/api', api)

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

    const handler = async (req: IncomingMessage, res: ServerResponse) => {
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
        body = Buffer.concat(chunks)
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

    if (certs) {
      const serverOptions: ServerOptions = { key: certs.key, cert: certs.cert }
      server = createHttpsServer(serverOptions, handler)
    } else {
      server = createHttpServer(handler)
    }

    server.listen(port, () => {
      const url = `${protocol}://localhost:${port}`
      console.log(`Talkie server running at ${url}`)
      const authToken = getAuthToken()
      if (authToken) {
        console.log(`Auth enabled. Open the UI with: ${url}/?token=${authToken}`)
      }
      resolve()
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`))
      } else {
        reject(err)
      }
    })
  })
}

export async function stopServer(): Promise<void> {
  closeDb()

  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve())
    })
    server = null
  }
}

// Graceful shutdown handlers
function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`)
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
  startServer(port).catch(console.error)
}
