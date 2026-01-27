import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { spawn } from 'child_process'
import { state, updateState } from './state.js'

export const api = new Hono()

// Enable CORS for all routes
api.use('*', cors())

// GET /api/status - Check if running and get current state
api.get('/status', (c) => {
  return c.json({
    running: true,
    avatarState: state.avatarState,
  })
})

// GET /api/transcript - Get latest transcript
api.get('/transcript', (c) => {
  return c.json({
    transcript: state.transcript,
    lastUserMessage: state.lastUserMessage,
    lastAssistantMessage: state.lastAssistantMessage,
  })
})

// GET /api/history - Get conversation history
api.get('/history', (c) => {
  return c.json({
    messages: state.messages,
  })
})

// POST /api/state - Update state from browser
api.post('/state', async (c) => {
  const update = await c.req.json()
  updateState(update)
  return c.json({ success: true })
})

// GET /api/session - Get Claude session ID
api.get('/session', (c) => {
  return c.json({ sessionId: state.claudeSessionId })
})

// POST /api/session - Set Claude session ID
api.post('/session', async (c) => {
  const { sessionId } = await c.req.json()
  updateState({ claudeSessionId: sessionId || null })
  console.log('Claude session ID set:', state.claudeSessionId)
  return c.json({ success: true, sessionId: state.claudeSessionId })
})

// DELETE /api/session - Clear Claude session ID
api.delete('/session', (c) => {
  updateState({ claudeSessionId: null })
  console.log('Claude session ID cleared')
  return c.json({ success: true })
})

// GET /api/pending - Get pending message waiting for response (for IPC)
api.get('/pending', (c) => {
  return c.json({
    pending: state.pendingMessage,
    sessionConnected: !!state.claudeSessionId
  })
})

// POST /api/respond - Claude posts response here (for IPC)
api.post('/respond', async (c) => {
  const { content } = await c.req.json()
  if (!content) {
    return c.json({ error: 'Content required' }, 400)
  }

  console.log('IPC response received:', content.slice(0, 100) + '...')

  // Clear pending message
  updateState({ pendingMessage: null })

  // Notify waiting callbacks
  for (const callback of state.responseCallbacks) {
    callback(content)
  }
  updateState({ responseCallbacks: [] })

  return c.json({ success: true })
})

// POST /api/send - Frontend sends message, waits for IPC response
api.post('/send', async (c) => {
  const { message } = await c.req.json()
  if (!message) {
    return c.json({ error: 'Message required' }, 400)
  }

  console.log('IPC message received from frontend:', message.slice(0, 100))

  // Set pending message for Claude to pick up
  updateState({
    pendingMessage: {
      content: message,
      timestamp: Date.now()
    }
  })

  return streamSSE(c, async (stream) => {
    // Wait for response (timeout after 2 minutes)
    const timeout = setTimeout(() => {
      const callbacks = state.responseCallbacks.filter(cb => cb !== callback)
      updateState({ responseCallbacks: callbacks })
      stream.writeSSE({ data: JSON.stringify({ error: 'Timeout waiting for response' }) })
      stream.close()
    }, 120000)

    const callback = (response: string) => {
      clearTimeout(timeout)
      stream.writeSSE({ data: JSON.stringify({ text: response }) })
      stream.writeSSE({ data: JSON.stringify({ done: true }) })
      stream.close()
    }

    state.responseCallbacks.push(callback)

    // Keep connection open
    await new Promise<void>((resolve) => {
      const checkClosed = setInterval(() => {
        if (!state.responseCallbacks.includes(callback)) {
          clearInterval(checkClosed)
          resolve()
        }
      }, 100)
    })
  })
})

// POST /api/analyze-image - Analyze image via Claude API (for Claude Code mode)
api.post('/analyze-image', async (c) => {
  const { dataUrl, fileName, type, apiKey: clientApiKey } = await c.req.json()
  if (!dataUrl) {
    return c.json({ error: 'Image data required' }, 400)
  }

  // Get API key from request body or environment
  const apiKey = clientApiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return c.json({ error: 'API key required for image analysis - please add one in Settings even when using Claude Code mode' }, 400)
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
    return c.json({ error: `API error: ${error}` }, response.status)
  }

  const data = await response.json() as { content: Array<{ text?: string }> }
  const description = data.content[0]?.text || 'Unable to analyze image.'

  return c.json({ description, fileName })
})

// POST /api/open-url - Open URL in default browser
api.post('/open-url', async (c) => {
  const { url } = await c.req.json()
  if (!url || typeof url !== 'string') {
    return c.json({ error: 'URL required' }, 400)
  }

  // Only allow http/https URLs for security
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return c.json({ error: 'Only http/https URLs allowed' }, 400)
  }

  console.log('Opening URL in browser:', url)

  return new Promise((resolve) => {
    // Use macOS 'open' command to open in default browser
    const open = spawn('open', [url])

    open.on('error', (err) => {
      resolve(c.json({ error: err.message }, 500))
    })

    open.on('close', (code) => {
      if (code === 0) {
        resolve(c.json({ success: true }))
      } else {
        resolve(c.json({ error: `Failed to open URL (code ${code})` }, 500))
      }
    })
  })
})

// POST /api/claude-code - Execute claude CLI and stream response
api.post('/claude-code', async (c) => {
  const { message, history } = await c.req.json()
  if (!message) {
    return c.json({ error: 'Message required' }, 400)
  }

  return streamSSE(c, async (stream) => {
    // Build context from provided history or server state (last 10)
    const recentMessages = (history || state.messages || []).slice(-10)
    let contextBlock = ''
    if (recentMessages.length > 0) {
      contextBlock = '[Recent conversation]\n' +
        recentMessages.map((m: { role: string; content: string }) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') +
        '\n[/Recent conversation]\n\n'
    }

    // Build prompt with context and voice rules
    const voiceMessage = `${contextBlock}[VOICE MODE - Keep responses to 1-2 sentences, no markdown, speak naturally]

User: ${message}`
    // Use stream-json format for structured output with tool call visibility
    // Use bypassPermissions mode and no-session-persistence to avoid concurrency conflicts
    const args = ['-p', voiceMessage, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--no-session-persistence']

    // Find claude in PATH
    const claudePath = process.env.CLAUDE_PATH || 'claude'
    console.log('Spawning claude:', claudePath, args, state.claudeSessionId ? '(resuming session)' : '(new session)')

    const claude = spawn(claudePath, args, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    let buffer = ''
    // Track tool inputs for showing details in activity feed
    const toolInputs: Record<string, string> = {}
    // Track tool names by their IDs so we can match results to starts
    const toolNames: Record<string, string> = {}
    let currentToolId: string | null = null

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
            const textContent = event.message?.content?.find((c: { type: string }) => c.type === 'text')
            if (textContent?.text) {
              // Strip thinking blocks
              let text = textContent.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
              if (text.trim()) {
                stream.writeSSE({ data: JSON.stringify({ text }) })
              }
            }
            // Also check for tool_use blocks in message content
            const toolUseBlocks = event.message?.content?.filter((c: { type: string }) => c.type === 'tool_use') || []
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
              stream.writeSSE({ data: JSON.stringify({
                activity: {
                  type: 'tool_start',
                  tool: toolBlock.name,
                  id: toolBlock.id,
                  input: inputDetail
                }
              }) })
            }
          } else if (event.type === 'content_block_start') {
            // Starting a new content block (could be tool use)
            if (event.content_block?.type === 'tool_use') {
              currentToolId = event.content_block.id
              toolInputs[currentToolId] = ''
              toolNames[currentToolId] = event.content_block.name
              stream.writeSSE({ data: JSON.stringify({
                activity: {
                  type: 'tool_start',
                  tool: event.content_block.name,
                  id: event.content_block.id
                }
              }) })
            }
          } else if (event.type === 'content_block_delta') {
            // Delta update - could be text or tool input
            if (event.delta?.type === 'text_delta' && event.delta?.text) {
              let text = event.delta.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
              if (text) {
                stream.writeSSE({ data: JSON.stringify({ text }) })
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
                  stream.writeSSE({ data: JSON.stringify({
                    activity: {
                      type: 'tool_input',
                      id: currentToolId,
                      input: inputDetail
                    }
                  }) })
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
            stream.writeSSE({ data: JSON.stringify({
              activity: {
                type: 'all_complete',
                status: subtype === 'error' ? 'error' : 'complete'
              }
            }) })
          } else if (event.type === 'user') {
            // User message contains tool_result blocks
            const toolResults = event.message?.content?.filter((c: { type: string }) => c.type === 'tool_result') || []
            for (const result of toolResults) {
              const toolId = result.tool_use_id
              const toolName = toolNames[toolId] || 'tool'
              const isError = result.is_error === true
              let output = ''
              if (typeof result.content === 'string') {
                output = result.content.slice(0, 200)
              } else if (Array.isArray(result.content)) {
                const textContent = result.content.find((c: { type: string }) => c.type === 'text')
                output = textContent?.text?.slice(0, 200) || ''
              }
              stream.writeSSE({ data: JSON.stringify({
                activity: {
                  type: 'tool_end',
                  tool: toolName,
                  id: toolId,
                  status: isError ? 'error' : 'complete',
                  output
                }
              }) })
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
      stream.writeSSE({ data: JSON.stringify({ error: text }) })
    })

    await new Promise<void>((resolve) => {
      claude.on('close', (code) => {
        stream.writeSSE({ data: JSON.stringify({ done: true, code }) })
        resolve()
      })

      claude.on('error', (err) => {
        stream.writeSSE({ data: JSON.stringify({ error: err.message }) })
        resolve()
      })
    })
  })
})
