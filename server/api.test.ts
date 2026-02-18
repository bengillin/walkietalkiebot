import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from './test/helpers.js'
import { resetState } from './state.js'
import { api } from './api.js'

beforeEach(() => {
  createTestDb()
  resetState()
})

// Helper to make requests and parse JSON
async function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: {} }
  if (body) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await api.request(path, init)
  return { status: res.status, json: await res.json() }
}

describe('GET /api/status', () => {
  it('returns running status', async () => {
    const { status, json } = await req('GET', '/status')
    expect(status).toBe(200)
    expect(json.running).toBe(true)
    expect(json.dbStatus).toBe('connected')
  })
})

describe('Conversation CRUD', () => {
  it('creates a conversation', async () => {
    const { status, json } = await req('POST', '/conversations', { title: 'Test Tape' })
    expect(status).toBe(201)
    expect(json.title).toBe('Test Tape')
    expect(json.id).toBeDefined()
  })

  it('lists conversations', async () => {
    await req('POST', '/conversations', { title: 'Tape 1' })
    await req('POST', '/conversations', { title: 'Tape 2' })

    const { status, json } = await req('GET', '/conversations')
    expect(status).toBe(200)
    expect(json.conversations).toHaveLength(2)
    expect(json.total).toBe(2)
  })

  it('gets a conversation by ID', async () => {
    const { json: created } = await req('POST', '/conversations', { title: 'My Tape' })

    const { status, json } = await req('GET', `/conversations/${created.id}`)
    expect(status).toBe(200)
    expect(json.title).toBe('My Tape')
    expect(json.messages).toEqual([])
    expect(json.activities).toEqual([])
  })

  it('returns 404 for non-existing conversation', async () => {
    const { status } = await req('GET', '/conversations/nonexistent')
    expect(status).toBe(404)
  })

  it('renames a conversation', async () => {
    const { json: created } = await req('POST', '/conversations', { title: 'Old Title' })

    const { status, json } = await req('PATCH', `/conversations/${created.id}`, { title: 'New Title' })
    expect(status).toBe(200)
    expect(json.title).toBe('New Title')
  })

  it('deletes a conversation', async () => {
    const { json: created } = await req('POST', '/conversations', { title: 'To Delete' })

    const { status, json } = await req('DELETE', `/conversations/${created.id}`)
    expect(status).toBe(200)
    expect(json.success).toBe(true)

    const { status: getStatus } = await req('GET', `/conversations/${created.id}`)
    expect(getStatus).toBe(404)
  })

  it('paginates conversations', async () => {
    for (let i = 0; i < 5; i++) {
      await req('POST', '/conversations', { title: `Tape ${i}` })
    }

    const { json } = await req('GET', '/conversations?limit=2&offset=0')
    expect(json.conversations).toHaveLength(2)
    expect(json.total).toBe(5)

    const { json: page2 } = await req('GET', '/conversations?limit=2&offset=2')
    expect(page2.conversations).toHaveLength(2)
  })
})

describe('Messages', () => {
  it('adds a message to a conversation', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'Chat' })

    const { status, json } = await req('POST', `/conversations/${conv.id}/messages`, {
      role: 'user',
      content: 'Hello there',
    })
    expect(status).toBe(201)
    expect(json.role).toBe('user')
    expect(json.content).toBe('Hello there')
  })

  it('returns 404 when adding to non-existing conversation', async () => {
    const { status } = await req('POST', '/conversations/nonexistent/messages', {
      role: 'user',
      content: 'test',
    })
    expect(status).toBe(404)
  })

  it('auto-titles conversation from first user message', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'New conversation' })

    await req('POST', `/conversations/${conv.id}/messages`, {
      role: 'user',
      content: 'What is the meaning of life?',
    })

    const { json: updated } = await req('GET', `/conversations/${conv.id}`)
    expect(updated.title).toBe('What is the meaning of life?')
  })

  it('includes messages when getting a conversation', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'Chat' })

    await req('POST', `/conversations/${conv.id}/messages`, { role: 'user', content: 'Hi' })
    await req('POST', `/conversations/${conv.id}/messages`, { role: 'assistant', content: 'Hello!' })

    const { json } = await req('GET', `/conversations/${conv.id}`)
    expect(json.messages).toHaveLength(2)
    expect(json.messages[0].role).toBe('user')
    expect(json.messages[1].role).toBe('assistant')
  })
})

describe('Liner Notes', () => {
  it('gets empty liner notes', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'Notes Test' })

    const { status, json } = await req('GET', `/conversations/${conv.id}/liner-notes`)
    expect(status).toBe(200)
    expect(json.linerNotes).toBeNull()
  })

  it('sets and gets liner notes', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'Notes Test' })

    await req('PUT', `/conversations/${conv.id}/liner-notes`, { linerNotes: '# My Notes\n\nSome details.' })

    const { json } = await req('GET', `/conversations/${conv.id}/liner-notes`)
    expect(json.linerNotes).toBe('# My Notes\n\nSome details.')
  })

  it('returns 404 for non-existing conversation', async () => {
    const { status } = await req('GET', '/conversations/nonexistent/liner-notes')
    expect(status).toBe(404)
  })
})

describe('Search', () => {
  it('returns empty for empty query', async () => {
    const { json } = await req('GET', '/search?q=')
    expect(json.results).toEqual([])
  })

  it('finds messages by content', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'Search Test' })
    await req('POST', `/conversations/${conv.id}/messages`, { role: 'user', content: 'Tell me about quantum physics' })
    await req('POST', `/conversations/${conv.id}/messages`, { role: 'assistant', content: 'Quantum physics is fascinating' })

    const { json } = await req('GET', '/search?q=quantum')
    expect(json.results.length).toBeGreaterThanOrEqual(1)
    expect(json.results[0].conversationId).toBe(conv.id)
  })
})

describe('Plan CRUD', () => {
  it('creates a plan', async () => {
    const { status, json } = await req('POST', '/plans', {
      title: 'Build Feature X',
      content: '## Steps\n1. Do this\n2. Do that',
    })
    expect(status).toBe(201)
    expect(json.title).toBe('Build Feature X')
    expect(json.id).toBeDefined()
  })

  it('lists plans', async () => {
    await req('POST', '/plans', { title: 'Plan A', content: 'A' })
    await req('POST', '/plans', { title: 'Plan B', content: 'B' })

    const { json } = await req('GET', '/plans')
    expect(json.plans).toHaveLength(2)
  })

  it('gets a plan by ID', async () => {
    const { json: created } = await req('POST', '/plans', { title: 'My Plan', content: 'Details here' })

    const { status, json } = await req('GET', `/plans/${created.id}`)
    expect(status).toBe(200)
    expect(json.title).toBe('My Plan')
    expect(json.content).toBe('Details here')
  })

  it('returns 404 for non-existing plan', async () => {
    const { status } = await req('GET', '/plans/nonexistent')
    expect(status).toBe(404)
  })

  it('updates a plan', async () => {
    const { json: created } = await req('POST', '/plans', { title: 'Draft', content: 'v1' })

    const { status } = await req('PUT', `/plans/${created.id}`, {
      title: 'Final',
      status: 'approved',
    })
    expect(status).toBe(200)

    const { json: updated } = await req('GET', `/plans/${created.id}`)
    expect(updated.title).toBe('Final')
    expect(updated.status).toBe('approved')
  })

  it('deletes a plan', async () => {
    const { json: created } = await req('POST', '/plans', { title: 'To Delete', content: 'x' })

    const { status } = await req('DELETE', `/plans/${created.id}`)
    expect(status).toBe(200)

    const { status: getStatus } = await req('GET', `/plans/${created.id}`)
    expect(getStatus).toBe(404)
  })

  it('creates a plan linked to a conversation', async () => {
    const { json: conv } = await req('POST', '/conversations', { title: 'Linked Conv' })
    const { json } = await req('POST', '/plans', {
      title: 'Linked Plan',
      content: 'Linked content',
      conversationId: conv.id,
    })
    expect(json.conversationId).toBe(conv.id)
  })
})
