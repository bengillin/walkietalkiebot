import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

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
    },
  }
}

export default defineConfig({
  plugins: [react(), basicSsl(), talkboyApi()],
  server: {
    https: true,
  },
})
