import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer as createHttpsServer, ServerOptions, Server } from 'https'
import { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { getSSLCerts } from './ssl.js'
import { api } from './api.js'
import { initDb, closeDb } from './db/index.js'
import { startTelegramBot, stopTelegramBot } from './telegram/index.js'
import { getNotificationDispatcher } from './notifications/dispatcher.js'
import { MacOSNotificationChannel } from './notifications/macos.js'
import { getJobManager } from './jobs/manager.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, '..', 'dist')

let server: Server | null = null

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

    // Initialize notification system
    const dispatcher = getNotificationDispatcher()
    dispatcher.register(new MacOSNotificationChannel())

    // Initialize job manager (cleans up stale jobs from previous runs)
    const jobManager = getJobManager()
    jobManager.init()

    // Start Telegram bot (non-blocking, will log if token not found)
    startTelegramBot().catch(err => {
      console.log('Telegram bot not started:', err.message)
    })

    const app = new Hono()

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

    // Get SSL certificates
    const certs = getSSLCerts()

    // Create HTTPS server with Hono handler
    const serverOptions: ServerOptions = {
      key: certs.key,
      cert: certs.cert,
    }

    server = createHttpsServer(serverOptions, async (req: IncomingMessage, res: ServerResponse) => {
      // Convert Node request to Web Request
      const url = new URL(req.url || '/', `https://localhost:${port}`)
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach(v => headers.append(key, v))
          } else {
            headers.set(key, value)
          }
        }
      }

      // Collect request body for POST/PUT/PATCH
      let body: Buffer | null = null
      if (req.method && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        body = Buffer.concat(chunks)
      }

      const request = new Request(url.toString(), {
        method: req.method || 'GET',
        headers,
        body: body,
        // @ts-expect-error - Node.js specific
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
    })

    server.listen(port, () => {
      console.log(`Talkboy server running at https://localhost:${port}`)
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
  stopTelegramBot()
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
