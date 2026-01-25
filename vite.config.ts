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
}

let state: TalkboyState = {
  avatarState: 'idle',
  transcript: '',
  lastUserMessage: '',
  lastAssistantMessage: '',
  messages: [],
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

      // POST /api/claude-code - Execute claude CLI and stream response
      server.middlewares.use('/api/claude-code', (req, res, next) => {
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

              res.setHeader('Content-Type', 'text/event-stream')
              res.setHeader('Cache-Control', 'no-cache')
              res.setHeader('Connection', 'keep-alive')
              res.setHeader('Access-Control-Allow-Origin', '*')

              // Spawn claude CLI with the message
              const claude = spawn('claude', ['-p', message, '--output-format', 'stream-json'], {
                cwd: process.cwd(),
                env: { ...process.env, FORCE_COLOR: '0' },
              })

              claude.stdout.on('data', (data: Buffer) => {
                const text = data.toString()
                // Parse stream-json format and extract assistant text
                const lines = text.split('\n').filter(l => l.trim())
                for (const line of lines) {
                  try {
                    const parsed = JSON.parse(line)
                    // Handle different message types from claude CLI
                    if (parsed.type === 'assistant' && parsed.message?.content) {
                      for (const block of parsed.message.content) {
                        if (block.type === 'text') {
                          res.write(`data: ${JSON.stringify({ text: block.text })}\n\n`)
                        }
                      }
                    } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                      res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`)
                    } else if (parsed.type === 'result' && parsed.result) {
                      // Final result
                      res.write(`data: ${JSON.stringify({ text: parsed.result })}\n\n`)
                    }
                  } catch {
                    // Not JSON, might be raw text - send it
                    if (line.trim() && !line.startsWith('{')) {
                      res.write(`data: ${JSON.stringify({ text: line })}\n\n`)
                    }
                  }
                }
              })

              claude.stderr.on('data', (data: Buffer) => {
                console.error('Claude CLI stderr:', data.toString())
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
