import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { spawn } from 'child_process'

// In-memory state store for API
interface TalkboyState {
  avatarState: string
  transcript: string
  lastUserMessage: string
  lastAssistantMessage: string
  messages: Array<{ role: string; content: string; timestamp: number }>
  claudeSessionId: string | null
  pendingMessage: { content: string; timestamp: number } | null
  responseCallbacks: Array<(response: string) => void>
}

let state: TalkboyState = {
  avatarState: 'idle',
  transcript: '',
  lastUserMessage: '',
  lastAssistantMessage: '',
  messages: [],
  claudeSessionId: null,
  pendingMessage: null,
  responseCallbacks: [],
}

// Vite plugin to add API routes
function talkboyApi(): Plugin {
  return {
    name: 'talkboy-api',
    configureServer(server) {
      // GET /api/status - Check if running and get current state
      server.middlewares.use('/api/status', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({
            running: true,
            avatarState: state.avatarState,
          }))
        } else {
          next()
        }
      })

      // GET /api/transcript - Get latest transcript
      server.middlewares.use('/api/transcript', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({
            transcript: state.transcript,
            lastUserMessage: state.lastUserMessage,
            lastAssistantMessage: state.lastAssistantMessage,
          }))
        } else {
          next()
        }
      })

      // GET /api/history - Get conversation history
      server.middlewares.use('/api/history', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({
            messages: state.messages,
          }))
        } else {
          next()
        }
      })

      // POST /api/state - Update state from browser
      server.middlewares.use('/api/state', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const update = JSON.parse(body)
              state = { ...state, ...update }
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ success: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
        } else if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
        } else {
          next()
        }
      })

      // GET/POST /api/session - Manage Claude session ID for handoff
      server.middlewares.use('/api/session', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ sessionId: state.claudeSessionId }))
        } else if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { sessionId } = JSON.parse(body)
              state.claudeSessionId = sessionId || null
              console.log('Claude session ID set:', state.claudeSessionId)
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ success: true, sessionId: state.claudeSessionId }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
        } else if (req.method === 'DELETE') {
          state.claudeSessionId = null
          console.log('Claude session ID cleared')
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ success: true }))
        } else if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
        } else {
          next()
        }
      })

      // GET /api/pending - Get pending message waiting for response (for IPC)
      server.middlewares.use('/api/pending', (req, res, next) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({
            pending: state.pendingMessage,
            sessionConnected: !!state.claudeSessionId
          }))
        } else {
          next()
        }
      })

      // POST /api/respond - Claude posts response here (for IPC)
      server.middlewares.use('/api/respond', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { content } = JSON.parse(body)
              if (!content) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Content required' }))
                return
              }

              console.log('IPC response received:', content.slice(0, 100) + '...')

              // Clear pending message
              state.pendingMessage = null

              // Notify waiting callbacks
              for (const callback of state.responseCallbacks) {
                callback(content)
              }
              state.responseCallbacks = []

              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ success: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
        } else if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
        } else {
          next()
        }
      })

      // POST /api/send - Frontend sends message, waits for IPC response
      server.middlewares.use('/api/send', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { message } = JSON.parse(body)
              if (!message) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Message required' }))
                return
              }

              console.log('IPC message received from frontend:', message.slice(0, 100))

              // Set pending message for Claude to pick up
              state.pendingMessage = {
                content: message,
                timestamp: Date.now()
              }

              // Set up SSE for response
              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Access-Control-Allow-Origin', '*')

              // Wait for response (timeout after 2 minutes)
              const timeout = setTimeout(() => {
                state.responseCallbacks = state.responseCallbacks.filter(cb => cb !== callback)
                res.write(`data: ${JSON.stringify({ error: 'Timeout waiting for response' })}\n\n`)
                res.end()
              }, 120000)

              const callback = (response: string) => {
                clearTimeout(timeout)
                res.write(`data: ${JSON.stringify({ text: response })}\n\n`)
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
                res.end()
              }

              state.responseCallbacks.push(callback)

            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
        } else if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
        } else {
          next()
        }
      })

      // POST /api/claude-code - Execute claude CLI and stream response
      server.middlewares.use('/api/claude-code', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { message, history } = JSON.parse(body)
              if (!message) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Message required' }))
                return
              }

              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Access-Control-Allow-Origin', '*')

              // Build context from provided history or server state (last 10)
              const recentMessages = (history || state.messages || []).slice(-10)
              let contextBlock = ''
              if (recentMessages.length > 0) {
                contextBlock = '[Recent conversation]\n' +
                  recentMessages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') +
                  '\n[/Recent conversation]\n\n'
              }

              // Build prompt with context and voice rules
              const voiceMessage = `${contextBlock}[VOICE MODE - Keep responses to 1-2 sentences, no markdown, speak naturally]

User: ${message}`
              const args = ['-p', voiceMessage, '--output-format', 'text']
              const claudePath = '/Users/ben/.local/bin/claude'
              console.log('Spawning claude:', claudePath, args, state.claudeSessionId ? '(resuming session)' : '(new session)')
              const claude = spawn(claudePath, args, {
                cwd: process.cwd(),
                env: { ...process.env, FORCE_COLOR: '0', PATH: process.env.PATH + ':/Users/ben/.local/bin' },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
              })

              claude.stdout.on('data', (data: Buffer) => {
                let text = data.toString()
                console.log('Claude stdout:', text)
                // Strip thinking blocks from output
                text = text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
                // Plain text output - send directly
                if (text.trim()) {
                  res.write(`data: ${JSON.stringify({ text })}\n\n`)
                }
              })

              claude.stderr.on('data', (data: Buffer) => {
                const text = data.toString()
                console.error('Claude stderr:', text)
                // Also send errors to client
                res.write(`data: ${JSON.stringify({ error: text })}\n\n`)
              })

              claude.on('close', (code) => {
                res.write(`data: ${JSON.stringify({ done: true, code })}\n\n`)
                res.end()
              })

              claude.on('error', (err) => {
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
                res.end()
              })

            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
        } else if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
        } else {
          next()
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), basicSsl(), talkboyApi()],
  server: {
    https: true,
  },
})
