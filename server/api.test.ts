import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from './test/helpers.js'
import { resetState } from './state.js'
import { api } from './api.js'

beforeEach(() => {
  createTestDb()
  resetState()
})

// Response bodies are assertion targets, not contracts; keep them indexable.
type JsonBody = Record<string, any>

// Helper to make requests and parse JSON
async function req(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: JsonBody }> {
  const init: RequestInit = { method, headers: {} }
  if (body) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await api.request(path, init)
  return { status: res.status, json: (await res.json()) as JsonBody }
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

    const { status, json } = await req('PATCH', `/conversations/${created.id}`, {
      title: 'New Title',
    })
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

describe('Idempotent creation and import', () => {
  const m = (id: string, content: string, role = 'user') => ({ id, role, content, timestamp: 1 })
  const tape = (id: string, msgs: Array<ReturnType<typeof m> & { images?: unknown[] }>) => ({
    id,
    title: 'Tape',
    messages: msgs,
    createdAt: 1,
    updatedAt: 1,
  })
  const contents = async (id: string) =>
    (await req('GET', `/conversations/${id}`)).json.messages.map(
      (x: { content: string }) => x.content,
    )

  it('POST /conversations with an existing id returns the existing tape', async () => {
    const first = await req('POST', '/conversations', { id: 'dup', title: 'Original' })
    expect(first.status).toBe(201)

    const again = await req('POST', '/conversations', { id: 'dup', title: 'Retry' })
    expect(again.status).toBe(200)
    expect(again.json.id).toBe('dup')
    expect(again.json.title).toBe('Original')
    expect((await req('GET', '/conversations')).json.total).toBe(1)
  })

  it('migrate retry adds only the messages the server is missing', async () => {
    const one = await req('POST', '/migrate', { conversations: [tape('t', [m('a', 'first')])] })
    expect(one.json).toMatchObject({ success: true, imported: 1, skipped: 0 })

    // Same tape again (lost response, or a second tab) with one new message
    const two = await req('POST', '/migrate', {
      conversations: [tape('t', [m('a', 'first'), m('b', 'second')])],
    })
    expect(two.status).toBe(200)
    expect(two.json.success).toBe(true)
    expect(two.json.results).toEqual([{ id: 't', ok: true, created: false, messagesAdded: 1 }])
    expect(await contents('t')).toEqual(['first', 'second'])
  })

  it('migrate rolls back a conversation that fails part-way, and keeps the others', async () => {
    const { json } = await req('POST', '/migrate', {
      conversations: [
        tape('good', [m('g1', 'fine')]),
        // The second message violates the role CHECK constraint
        tape('bad', [m('b1', 'lands first'), m('b2', 'boom', 'system')]),
      ],
    })
    expect(json.success).toBe(false)
    expect(json.results.map((r: { id: string; ok: boolean }) => [r.id, r.ok])).toEqual([
      ['good', true],
      ['bad', false],
    ])
    expect(await contents('good')).toEqual(['fine'])
    // Nothing of the failed tape is left behind: not the tape, not its first message
    expect((await req('GET', '/conversations/bad')).status).toBe(404)

    // A corrected retry imports it whole
    const retry = await req('POST', '/migrate', { conversations: [tape('bad', [m('b1', 'ok')])] })
    expect(retry.json.success).toBe(true)
    expect(await contents('bad')).toEqual(['ok'])
  })

  it('migrate stores a message whose id another conversation already uses, under a new id', async () => {
    await req('POST', '/migrate', { conversations: [tape('A', [m('shared', 'in A')])] })
    const one = await req('POST', '/migrate', { conversations: [tape('B', [m('shared', 'in B')])] })
    expect(one.json.results).toEqual([
      { id: 'B', ok: true, created: true, messagesAdded: 1, remapped: { shared: 'shared~B' } },
    ])
    expect(await contents('A')).toEqual(['in A'])
    expect(await contents('B')).toEqual(['in B'])

    // The new id is deterministic, so a retry finds it instead of duplicating
    const again = await req('POST', '/migrate', {
      conversations: [tape('B', [m('shared', 'in B')])],
    })
    expect(again.json.results[0]).toMatchObject({ ok: true, messagesAdded: 0 })
    expect(await contents('B')).toEqual(['in B'])
  })

  it('migrate handles a branch that copied its parent ids in the same batch', async () => {
    const { json } = await req('POST', '/migrate', {
      conversations: [tape('P', [m('x', 'p')]), tape('Br', [m('x', 'p'), m('y', 'branch only')])],
    })
    expect(json.success).toBe(true)
    expect(await contents('Br')).toEqual(['p', 'branch only'])
  })

  it('migrate gives a colliding image id a new id instead of failing the tape', async () => {
    const img = { id: 'img1', dataUrl: 'data:x', fileName: 'a.png' }
    await req('POST', '/migrate', {
      conversations: [tape('A', [{ ...m('a1', 'a'), images: [img] }])],
    })
    const { json } = await req('POST', '/migrate', {
      conversations: [tape('B', [{ ...m('b1', 'b'), images: [img] }])],
    })
    expect(json.success).toBe(true)
    const b = (await req('GET', '/conversations/B')).json
    expect(b.messages[0].images).toHaveLength(1)
  })

  it('POST /conversations/:id/messages is idempotent on the message id', async () => {
    await req('POST', '/conversations', { id: 'A' })
    const first = await req('POST', '/conversations/A/messages', m('a1', 'hello'))
    expect(first.status).toBe(201)
    const retry = await req('POST', '/conversations/A/messages', m('a1', 'hello'))
    expect(retry.status).toBe(200)
    expect(retry.json.id).toBe('a1')
    expect(await contents('A')).toEqual(['hello'])

    await req('POST', '/conversations', { id: 'B' })
    const elsewhere = await req('POST', '/conversations/B/messages', m('a1', 'hello'))
    expect(elsewhere.status).toBe(409)
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
    await req('POST', `/conversations/${conv.id}/messages`, {
      role: 'assistant',
      content: 'Hello!',
    })

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

    await req('PUT', `/conversations/${conv.id}/liner-notes`, {
      linerNotes: '# My Notes\n\nSome details.',
    })

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
    await req('POST', `/conversations/${conv.id}/messages`, {
      role: 'user',
      content: 'Tell me about quantum physics',
    })
    await req('POST', `/conversations/${conv.id}/messages`, {
      role: 'assistant',
      content: 'Quantum physics is fascinating',
    })

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
    const { json: created } = await req('POST', '/plans', {
      title: 'My Plan',
      content: 'Details here',
    })

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
