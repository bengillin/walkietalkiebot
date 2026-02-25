import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { spawn } from 'child_process'
import { state, updateState } from './state.js'
import { isDbConnected } from './db/index.js'
import * as conversations from './db/repositories/conversations.js'
import * as messages from './db/repositories/messages.js'
import * as activities from './db/repositories/activities.js'
import * as search from './db/repositories/search.js'
import * as plans from './db/repositories/plans.js'
import { spawnClaude, isClaudeCliAvailable } from './jobs/runner.js'
import { jobRoutes } from './jobs/api.js'

export const api = new Hono()

// Enable CORS for all routes
api.use('*', cors())

// Mount job routes
api.route('/jobs', jobRoutes)

// GET /api/status - Check if running and get current state
api.get('/status', (c) => {
  return c.json({
    running: true,
    avatarState: state.avatarState,
    dbStatus: isDbConnected() ? 'connected' : 'unavailable',
    claudeCliAvailable: isClaudeCliAvailable(),
  })
})

// ============================================
// Conversation CRUD endpoints
// ============================================

// GET /api/conversations - List conversations (paginated)
api.get('/conversations', (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = parseInt(c.req.query('offset') || '0', 10)

  const convos = conversations.listConversations(limit, offset)
  const total = conversations.countConversations()

  return c.json({
    conversations: convos.map(conv => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      projectId: conv.project_id,
      parentId: conv.parent_id,
    })),
    total,
    limit,
    offset,
  })
})

// GET /api/conversations/:id - Get conversation with messages
api.get('/conversations/:id', (c) => {
  const id = c.req.param('id')
  const conv = conversations.getConversation(id)

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const msgs = messages.getMessagesForConversation(id)
  const messageIds = msgs.map(m => m.id)
  const imageMap = messages.getImagesForMessages(messageIds)
  const acts = activities.getActivitiesForConversation(id)

  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    projectId: conv.project_id,
    parentId: conv.parent_id,
    messages: msgs.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      source: m.source,
      images: (imageMap.get(m.id) || []).map(img => ({
        id: img.id,
        dataUrl: img.data_url,
        fileName: img.file_name,
        description: img.description,
      })),
    })),
    activities: acts.map(a => ({
      id: a.id,
      tool: a.tool,
      input: a.input,
      status: a.status,
      timestamp: a.timestamp,
      duration: a.duration,
      error: a.error,
    })),
  })
})

// POST /api/conversations - Create conversation
api.post('/conversations', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const id = body.id || crypto.randomUUID()
  const title = body.title || 'New conversation'

  const conv = conversations.createConversation({ id, title })

  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
  }, 201)
})

// PATCH /api/conversations/:id - Rename conversation
api.patch('/conversations/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const conv = conversations.updateConversation(id, {
    title: body.title,
    projectId: body.projectId,
    parentId: body.parentId,
  })

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
  })
})

// DELETE /api/conversations/:id - Delete conversation
api.delete('/conversations/:id', (c) => {
  const id = c.req.param('id')
  const deleted = conversations.deleteConversation(id)

  if (!deleted) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.json({ success: true })
})

// GET /api/conversations/:id/liner-notes - Get liner notes
api.get('/conversations/:id/liner-notes', (c) => {
  const id = c.req.param('id')
  const conv = conversations.getConversation(id)

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.json({
    linerNotes: conversations.getLinerNotes(id),
  })
})

// PUT /api/conversations/:id/liner-notes - Save liner notes
api.put('/conversations/:id/liner-notes', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const conv = conversations.getConversation(id)
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  conversations.updateLinerNotes(id, body.linerNotes || null)

  return c.json({ success: true })
})

// POST /api/conversations/:id/messages - Add message
api.post('/conversations/:id/messages', async (c) => {
  const conversationId = c.req.param('id')
  const body = await c.req.json()

  // Check conversation exists
  const conv = conversations.getConversation(conversationId)
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  const msg = messages.createMessage({
    id: body.id || crypto.randomUUID(),
    conversationId,
    role: body.role,
    content: body.content,
    timestamp: body.timestamp,
    source: body.source || 'web',
    images: body.images,
  })

  // Update conversation title if first user message
  if (msg.role === 'user' && msg.position === 0) {
    const title = msg.content.length > 40 ? msg.content.slice(0, 40) + '...' : msg.content
    conversations.updateConversation(conversationId, { title })
  }

  // Store activities if provided
  if (body.activities && Array.isArray(body.activities)) {
    activities.createActivitiesBatch(
      body.activities.map((a: { id?: string; tool: string; input?: string; status: 'complete' | 'error'; timestamp?: number; duration?: number; error?: string }) => ({
        id: a.id || crypto.randomUUID(),
        conversationId,
        messageId: msg.id,
        tool: a.tool,
        input: a.input,
        status: a.status,
        timestamp: a.timestamp,
        duration: a.duration,
        error: a.error,
      }))
    )
  }

  return c.json({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    source: msg.source,
  }, 201)
})

// PATCH /api/images/:id - Update image description
api.patch('/images/:id', async (c) => {
  const imageId = c.req.param('id')
  const { description } = await c.req.json()
  if (typeof description !== 'string') {
    return c.json({ error: 'description required' }, 400)
  }

  const updated = messages.updateImageDescription(imageId, description)
  if (!updated) {
    return c.json({ error: 'Image not found' }, 404)
  }

  return c.json({ success: true })
})

// ============================================
// Plans endpoints
// ============================================

// GET /api/plans - List all plans
api.get('/plans', (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10)
  const offset = parseInt(c.req.query('offset') || '0', 10)
  const planList = plans.listPlans(limit, offset)

  return c.json({
    plans: planList.map(p => ({
      id: p.id,
      title: p.title,
      content: p.content,
      status: p.status,
      conversationId: p.conversation_id,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    })),
  })
})

// GET /api/plans/:id - Get single plan
api.get('/plans/:id', (c) => {
  const id = c.req.param('id')
  const plan = plans.getPlan(id)

  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  return c.json({
    id: plan.id,
    title: plan.title,
    content: plan.content,
    status: plan.status,
    conversationId: plan.conversation_id,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  })
})

// POST /api/plans - Create a plan
api.post('/plans', async (c) => {
  const body = await c.req.json()
  const plan = plans.createPlan({
    id: body.id || crypto.randomUUID(),
    title: body.title || 'Untitled Plan',
    content: body.content || '',
    status: body.status,
    conversationId: body.conversationId,
  })

  return c.json({
    id: plan.id,
    title: plan.title,
    content: plan.content,
    status: plan.status,
    conversationId: plan.conversation_id,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  }, 201)
})

// PUT /api/plans/:id - Update a plan
api.put('/plans/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()

  const existing = plans.getPlan(id)
  if (!existing) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  plans.updatePlan(id, {
    title: body.title,
    content: body.content,
    status: body.status,
  })

  return c.json({ success: true })
})

// DELETE /api/plans/:id - Delete a plan
api.delete('/plans/:id', (c) => {
  const id = c.req.param('id')
  plans.deletePlan(id)
  return c.json({ success: true })
})

// GET /api/search - Full-text search
api.get('/search', (c) => {
  const query = c.req.query('q') || ''
  const limit = parseInt(c.req.query('limit') || '50', 10)

  if (!query.trim()) {
    return c.json({ results: [] })
  }

  const results = search.searchMessages(query, limit)

  return c.json({
    query,
    results: results.map(r => ({
      messageId: r.message_id,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title,
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
      snippet: r.snippet,
    })),
  })
})

// POST /api/migrate - Import from localStorage
api.post('/migrate', async (c) => {
  const body = await c.req.json()
  const localConversations = body.conversations as Array<{
    id: string
    title: string
    messages: Array<{
      id: string
      role: 'user' | 'assistant'
      content: string
      timestamp: number
      images?: Array<{
        id: string
        dataUrl: string
        fileName: string
        description?: string
      }>
    }>
    activities?: Array<{
      id: string
      tool: string
      input?: string
      status: 'complete' | 'error'
      timestamp: number
      duration?: number
      error?: string
    }>
    createdAt: number
    updatedAt: number
  }>

  if (!localConversations || !Array.isArray(localConversations)) {
    return c.json({ error: 'Invalid conversations data' }, 400)
  }

  let imported = 0
  let skipped = 0

  for (const conv of localConversations) {
    // Skip if already exists
    if (conversations.getConversation(conv.id)) {
      skipped++
      continue
    }

    // Create conversation
    conversations.createConversation({
      id: conv.id,
      title: conv.title,
    })

    // Import messages with images
    for (const msg of conv.messages || []) {
      messages.createMessage({
        id: msg.id,
        conversationId: conv.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        source: 'web',
        images: msg.images,
      })
    }

    // Import activities
    if (conv.activities && conv.activities.length > 0) {
      activities.createActivitiesBatch(
        conv.activities.map(a => ({
          id: a.id,
          conversationId: conv.id,
          tool: a.tool,
          input: a.input,
          status: a.status,
          timestamp: a.timestamp,
          duration: a.duration,
          error: a.error,
        }))
      )
    }

    imported++
  }

  return c.json({
    success: true,
    imported,
    skipped,
    total: localConversations.length,
  })
})

// GET /api/integrations - Get status of integrations (MCP, Telegram)
api.get('/integrations', (c) => {
  // Check if Telegram token is configured
  let telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN
  if (!telegramConfigured) {
    try {
      const { existsSync } = require('fs')
      const { join } = require('path')
      const { homedir } = require('os')
      const tokenPath = join(homedir(), '.wtb', 'telegram.token')
      telegramConfigured = existsSync(tokenPath)
    } catch {
      // ignore
    }
  }

  return c.json({
    mcp: {
      configured: true,
      toolCount: 30,
      tools: [
        'launch_wtb', 'get_wtb_status', 'get_transcript',
        'get_conversation_history', 'get_claude_session', 'set_claude_session',
        'disconnect_claude_session', 'get_pending_message', 'respond_to_wtb',
        'update_wtb_state', 'analyze_image', 'open_url',
        'create_wtb_job', 'get_wtb_job', 'list_wtb_jobs',
        'list_conversations', 'get_conversation', 'create_conversation',
        'rename_conversation', 'delete_conversation', 'search_conversations',
        'add_message', 'list_plans', 'get_plan',
        'create_plan', 'update_plan', 'delete_plan',
        'get_liner_notes', 'set_liner_notes', 'export_conversation',
      ],
      transport: 'stdio',
    },
    telegram: {
      configured: telegramConfigured,
    },
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

// POST /api/analyze-image-cc - Analyze image via Claude Code CLI (no API key needed)
api.post('/analyze-image-cc', async (c) => {
  const { dataUrl, fileName } = await c.req.json()
  if (!dataUrl) {
    return c.json({ error: 'Image data required' }, 400)
  }

  return new Promise((resolve) => {
    let description = ''
    const handle = spawnClaude({
      prompt: 'Describe this image in detail. If it appears to be a UI design, wireframe, or sketch, focus on the structure and components. Be thorough but concise. Output ONLY the description, no preamble.',
      images: [{ dataUrl, fileName: fileName || 'image.png' }],
      rawMode: true,
      callbacks: {
        onText: (text) => { description += text },
        onActivity: () => {},
        onError: (error) => {
          console.error('Image analysis via Claude Code failed:', error)
        },
        onComplete: () => {
          resolve(c.json({
            description: description.trim() || 'Unable to analyze image.',
            fileName,
          }))
        },
      },
    })

    // Timeout after 60 seconds
    setTimeout(() => {
      handle.kill()
      resolve(c.json({
        description: description.trim() || 'Analysis timed out.',
        fileName,
      }))
    }, 60000)
  })
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
  const { message, history, images } = await c.req.json()
  if (!message) {
    return c.json({ error: 'Message required' }, 400)
  }

  return streamSSE(c, async (stream) => {
    const handle = spawnClaude({
      prompt: message,
      history: history || state.messages || [],
      images,
      callbacks: {
        onText: (text) => {
          stream.writeSSE({ data: JSON.stringify({ text }) })
        },
        onActivity: (event) => {
          stream.writeSSE({ data: JSON.stringify({ activity: event }) })
        },
        onPlan: (plan) => {
          stream.writeSSE({ data: JSON.stringify({ plan }) })
        },
        onError: (error) => {
          stream.writeSSE({ data: JSON.stringify({ error }) })
        },
        onComplete: (code) => {
          stream.writeSSE({ data: JSON.stringify({ done: true, code }) })
        },
      },
    })

    await handle.promise
  })
})
