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

      // POST /api/analyze-image - Analyze image via Claude API (for Claude Code mode)
      server.middlewares.use('/api/analyze-image', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const { dataUrl, fileName, type, apiKey: clientApiKey } = JSON.parse(body)
              if (!dataUrl) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Image data required' }))
                return
              }

              // Get API key from request body or environment
              const apiKey = clientApiKey || process.env.ANTHROPIC_API_KEY
              if (!apiKey) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'API key required for image analysis - please add one in Settings even when using Claude Code mode' }))
                return
              }

              // Extract base64 data
              const base64Data = dataUrl.split(',')[1]
              const mediaType = type || 'image/png'

              // Call Claude API to analyze image
              const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                  model: 'claude-sonnet-4-20250514',
                  max_tokens: 1024,
                  system: `You are analyzing images for a voice assistant app. Describe the image in detail, focusing on:
- If it's a UI mockup/wireframe: describe the layout, components, navigation, and user flow
- If it's a screenshot: describe what app/website it is, the state shown, and key elements
- If it's a hand-drawn sketch: interpret the drawing and describe what it represents
- For any image: note colors, text visible, key visual elements

Be thorough but concise. This description will be used as context for building or discussing the content.`,
                  messages: [
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'image',
                          source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Data,
                          },
                        },
                        {
                          type: 'text',
                          text: 'Describe this image in detail. If it appears to be a UI design, wireframe, or sketch, focus on the structure and components.',
                        },
                      ],
                    },
                  ],
                }),
              })

              if (!response.ok) {
                const error = await response.text()
                res.statusCode = response.status
                res.end(JSON.stringify({ error: `API error: ${error}` }))
                return
              }

              const data = await response.json()
              const description = data.content[0]?.text || 'Unable to analyze image.'

              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ description, fileName }))

            } catch (err) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }))
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

      // POST /api/open-url - Open URL in default browser
      server.middlewares.use('/api/open-url', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { url } = JSON.parse(body)
              if (!url || typeof url !== 'string') {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'URL required' }))
                return
              }

              // Only allow http/https URLs for security
              if (!url.startsWith('http://') && !url.startsWith('https://')) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Only http/https URLs allowed' }))
                return
              }

              console.log('Opening URL in browser:', url)

              // Use macOS 'open' command to open in default browser
              const open = spawn('open', [url])

              open.on('error', (err) => {
                res.statusCode = 500
                res.end(JSON.stringify({ error: err.message }))
              })

              open.on('close', (code) => {
                if (code === 0) {
                  res.setHeader('Content-Type', 'application/json')
                  res.setHeader('Access-Control-Allow-Origin', '*')
                  res.end(JSON.stringify({ success: true }))
                } else {
                  res.statusCode = 500
                  res.end(JSON.stringify({ error: `Failed to open URL (code ${code})` }))
                }
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
              // Use stream-json format for structured output with tool call visibility
              const args = ['-p', voiceMessage, '--output-format', 'stream-json', '--verbose', '--allowedTools', 'Read,Edit,Write,Bash']
              const claudePath = '/Users/ben/.local/bin/claude'
              console.log('Spawning claude:', claudePath, args, state.claudeSessionId ? '(resuming session)' : '(new session)')
              const claude = spawn(claudePath, args, {
                cwd: process.cwd(),
                env: { ...process.env, FORCE_COLOR: '0', PATH: process.env.PATH + ':/Users/ben/.local/bin' },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false,
              })

              let buffer = ''
              // Track tool inputs for showing details in activity feed
              const toolInputs: Record<string, string> = {}
              // Track tool names by their IDs so we can match results to starts
              const toolNames: Record<string, string> = {}
              let currentToolId: string | null = null
              let currentToolName: string | null = null

              claude.stdout.on('data', (data: Buffer) => {
                buffer += data.toString()

                // Process complete JSON lines
                const lines = buffer.split('\n')
                buffer = lines.pop() || '' // Keep incomplete line in buffer

                for (const line of lines) {
                  if (!line.trim()) continue

                  try {
                    const event = JSON.parse(line)
                    console.log('Claude event:', event.type, event.subtype || '')

                    // Handle different event types from stream-json format
                    if (event.type === 'assistant') {
                      // Text response from Claude
                      const textContent = event.message?.content?.find((c: any) => c.type === 'text')
                      if (textContent?.text) {
                        // Strip thinking blocks
                        let text = textContent.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
                        if (text.trim()) {
                          res.write(`data: ${JSON.stringify({ text })}\n\n`)
                        }
                      }
                      // Also check for tool_use blocks in message content
                      const toolUseBlocks = event.message?.content?.filter((c: any) => c.type === 'tool_use') || []
                      for (const toolBlock of toolUseBlocks) {
                        // Store full input for display
                        if (toolBlock.id && toolBlock.input) {
                          toolInputs[toolBlock.id] = JSON.stringify(toolBlock.input)
                        }
                        // Extract human-readable input detail
                        let inputDetail = ''
                        if (toolBlock.input) {
                          if (toolBlock.input.file_path) {
                            inputDetail = toolBlock.input.file_path
                          } else if (toolBlock.input.command) {
                            inputDetail = toolBlock.input.command
                          } else if (toolBlock.input.pattern) {
                            inputDetail = toolBlock.input.pattern
                          }
                        }
                        res.write(`data: ${JSON.stringify({
                          activity: {
                            type: 'tool_start',
                            tool: toolBlock.name,
                            id: toolBlock.id,
                            input: inputDetail
                          }
                        })}\n\n`)
                      }
                    } else if (event.type === 'content_block_start') {
                      // Starting a new content block (could be tool use)
                      if (event.content_block?.type === 'tool_use') {
                        currentToolId = event.content_block.id
                        currentToolName = event.content_block.name
                        toolInputs[currentToolId] = ''
                        toolNames[currentToolId] = event.content_block.name
                        res.write(`data: ${JSON.stringify({
                          activity: {
                            type: 'tool_start',
                            tool: event.content_block.name,
                            id: event.content_block.id
                          }
                        })}\n\n`)
                      }
                    } else if (event.type === 'content_block_delta') {
                      // Delta update - could be text or tool input
                      if (event.delta?.type === 'text_delta' && event.delta?.text) {
                        let text = event.delta.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
                        if (text) {
                          res.write(`data: ${JSON.stringify({ text })}\n\n`)
                        }
                      } else if (event.delta?.type === 'input_json_delta' && currentToolId) {
                        // Accumulate tool input JSON
                        toolInputs[currentToolId] = (toolInputs[currentToolId] || '') + event.delta.partial_json
                      }
                    } else if (event.type === 'content_block_stop' && currentToolId) {
                      // Tool input complete - send the input details
                      try {
                        const inputJson = toolInputs[currentToolId]
                        if (inputJson) {
                          const input = JSON.parse(inputJson)
                          let inputDetail = ''
                          if (input.file_path) {
                            inputDetail = input.file_path
                          } else if (input.command) {
                            inputDetail = input.command
                          } else if (input.pattern) {
                            inputDetail = input.pattern
                          }
                          if (inputDetail) {
                            res.write(`data: ${JSON.stringify({
                              activity: {
                                type: 'tool_input',
                                id: currentToolId,
                                input: inputDetail
                              }
                            })}\n\n`)
                          }
                        }
                      } catch {
                        // Ignore parse errors
                      }
                      currentToolId = null
                    } else if (event.type === 'result') {
                      // Final result - mark all running tools as complete
                      const subtype = event.subtype || 'complete'
                      // Send a general completion signal
                      res.write(`data: ${JSON.stringify({
                        activity: {
                          type: 'all_complete',
                          status: subtype === 'error' ? 'error' : 'complete'
                        }
                      })}\n\n`)
                    } else if (event.type === 'user') {
                      // User message contains tool_result blocks
                      const toolResults = event.message?.content?.filter((c: any) => c.type === 'tool_result') || []
                      for (const result of toolResults) {
                        const toolId = result.tool_use_id
                        const toolName = toolNames[toolId] || 'tool'
                        const isError = result.is_error === true
                        let output = ''
                        if (typeof result.content === 'string') {
                          output = result.content.slice(0, 200)
                        } else if (Array.isArray(result.content)) {
                          const textContent = result.content.find((c: any) => c.type === 'text')
                          output = textContent?.text?.slice(0, 200) || ''
                        }
                        res.write(`data: ${JSON.stringify({
                          activity: {
                            type: 'tool_end',
                            tool: toolName,
                            id: toolId,
                            status: isError ? 'error' : 'complete',
                            output
                          }
                        })}\n\n`)
                      }
                    }
                  } catch (e) {
                    // Not valid JSON, might be partial - ignore
                    console.log('Parse error for line:', line.slice(0, 100))
                  }
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
