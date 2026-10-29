import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Conversation, Message } from '../types'

const apiMock = vi.hoisted(() => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  addMessage: vi.fn(),
  updateConversation: vi.fn(),
  updateConversationMode: vi.fn(),
  deleteConversation: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
  markMigrationComplete: vi.fn(),
  saveLinerNotes: vi.fn(),
}))

vi.mock('./api', () => apiMock)

import {
  useStore,
  enableServerSync,
  flushServerWrites,
  mergeMessages,
  migrateLocalStorageKeys,
  resetSyncStateForTesting,
} from './store'

function msg(id: string, timestamp: number, content = id): Message {
  return { id, role: 'user', content, timestamp }
}

function conv(id: string, overrides: Partial<Conversation> = {}): Conversation {
  return { id, title: id, messages: [], createdAt: 1, updatedAt: 1, ...overrides }
}

function meta(id: string, updatedAt: number) {
  return { id, title: `server ${id}`, createdAt: 1, updatedAt, mode: 'voice' }
}

function serverConv(id: string, messages: Message[], updatedAt = 100) {
  return { ...meta(id, updatedAt), messages, activities: [] }
}

// What the API client throws for a 404
function notFound() {
  return Object.assign(new Error('Conversation not found'), { status: 404 })
}

// ...and for a 410 (the tape was deleted)
function gone() {
  return Object.assign(new Error('Conversation was deleted'), { status: 410 })
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function setConversations(conversations: Conversation[], currentId: string) {
  const current = conversations.find((c) => c.id === currentId)
  useStore.setState({
    conversations,
    currentConversationId: currentId,
    messages: current?.messages ?? [],
    storedActivities: [],
    contextConversationIds: [],
  })
}

beforeEach(() => {
  localStorage.clear()
  resetSyncStateForTesting()
  for (const fn of Object.values(apiMock)) fn.mockReset()
  apiMock.createConversation.mockResolvedValue({})
  apiMock.addMessage.mockResolvedValue({})
  apiMock.updateConversation.mockResolvedValue({})
  apiMock.updateConversationMode.mockResolvedValue(undefined)
  apiMock.deleteConversation.mockResolvedValue({ success: true })
  apiMock.migrateFromLocalStorage.mockResolvedValue({ success: true, imported: 1, skipped: 0 })
  apiMock.saveLinerNotes.mockResolvedValue({ success: true })
  enableServerSync()
})

describe('mergeMessages', () => {
  it('keeps local messages newer than the server snapshot', () => {
    const server = [msg('a', 1)]
    const local = [msg('a', 1), msg('b', 5)]
    expect(mergeMessages(local, server).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('drops local messages older than the snapshot that the server lacks', () => {
    // e.g. synced before ids were shared: the server has it under another id
    const server = [msg('server-a', 1), msg('c', 10)]
    const local = [msg('local-a', 1)]
    expect(mergeMessages(local, server).map((m) => m.id)).toEqual(['server-a', 'c'])
  })
})

describe('syncFromServer', () => {
  it('does not drop a message sent while the sync was in flight (bug: first message vanishes)', async () => {
    setConversations([conv('c1', { updatedAt: 1, stale: true })], 'c1')
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('c1', 50)], total: 1 })
    const full = deferred<ReturnType<typeof serverConv>>()
    apiMock.getConversation.mockReturnValue(full.promise)

    const sync = useStore.getState().syncFromServer()
    await vi.waitFor(() => expect(apiMock.getConversation).toHaveBeenCalled())

    // The user sends before the snapshot arrives
    useStore.getState().addMessage({ role: 'user', content: 'hello' })
    full.resolve(serverConv('c1', [msg('old', 10, 'earlier')], 50))
    await sync

    const contents = useStore.getState().messages.map((m) => m.content)
    expect(contents).toEqual(['earlier', 'hello'])
    const stored = useStore.getState().conversations.find((c) => c.id === 'c1')
    expect(stored?.messages.map((m) => m.content)).toEqual(['earlier', 'hello'])
  })

  it('only fetches full messages for the current conversation', async () => {
    setConversations([conv('c1', { messages: [msg('m', 1)], updatedAt: 1 })], 'c1')
    apiMock.listConversations.mockResolvedValue({
      conversations: [meta('c1', 50), meta('c2', 40), meta('c3', 30)],
      total: 3,
    })
    apiMock.getConversation.mockResolvedValue(serverConv('c1', [msg('m', 1)], 50))

    await useStore.getState().syncFromServer()

    expect(apiMock.getConversation).toHaveBeenCalledTimes(1)
    expect(apiMock.getConversation).toHaveBeenCalledWith('c1')
    const others = useStore.getState().conversations.filter((c) => c.id !== 'c1')
    expect(others.map((c) => c.stale)).toEqual([true, true])
  })

  it('skips the full fetch when the cached copy is up to date', async () => {
    setConversations([conv('c1', { messages: [msg('m', 1)], updatedAt: 60 })], 'c1')
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('c1', 50)], total: 1 })
    await useStore.getState().syncFromServer()
    expect(apiMock.getConversation).not.toHaveBeenCalled()
    expect(useStore.getState().messages.map((m) => m.id)).toEqual(['m'])
  })

  it('pages through the whole list', async () => {
    setConversations([conv('c1', { updatedAt: 999 })], 'c1')
    apiMock.listConversations
      .mockResolvedValueOnce({ conversations: [meta('c1', 50)], total: 2 })
      .mockResolvedValueOnce({ conversations: [meta('c2', 40)], total: 2 })
    await useStore.getState().syncFromServer()
    expect(apiMock.listConversations).toHaveBeenNthCalledWith(2, 100, 1)
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['c1', 'c2'])
  })

  it('does not resurrect a conversation deleted on the server', async () => {
    setConversations(
      [
        conv('keep', { updatedAt: 999, localOnly: false }),
        conv('gone', { messages: [msg('x', 1)], localOnly: false }),
      ],
      'keep',
    )
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('keep', 50)], total: 1 })
    apiMock.getConversation.mockRejectedValue(notFound())
    await useStore.getState().syncFromServer()
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['keep'])
  })

  it('keeps local-only conversations that were never synced', async () => {
    setConversations([conv('fresh', { localOnly: true, updatedAt: 999 })], 'fresh')
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('s1', 50)], total: 1 })
    await useStore.getState().syncFromServer()
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['fresh', 's1'])
    expect(useStore.getState().currentConversationId).toBe('fresh')
  })

  it('falls back to a blank tape when the open one was deleted elsewhere', async () => {
    setConversations([conv('gone', { messages: [msg('x', 1)], localOnly: false })], 'gone')
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('s1', 50)], total: 1 })
    apiMock.getConversation.mockRejectedValue(notFound())
    await useStore.getState().syncFromServer()
    const state = useStore.getState()
    expect(state.currentConversationId).not.toBe('gone')
    expect(state.messages).toEqual([])
    expect(state.conversations.find((c) => c.id === state.currentConversationId)?.localOnly).toBe(
      true,
    )
  })

  it('uploads tapes cached before the localOnly marker existed instead of dropping them', async () => {
    // A pre-upgrade cache: no marker, and messages that never reached the server
    // because of the old create-id race.
    const legacy = conv('legacy', { messages: [msg('m', 5)], updatedAt: 999 })
    setConversations([legacy], 'legacy')
    apiMock.listConversations.mockResolvedValue({ conversations: [], total: 0 })
    await useStore.getState().syncFromServer()

    expect(apiMock.migrateFromLocalStorage).toHaveBeenCalledWith([legacy])
    const kept = useStore.getState().conversations.find((c) => c.id === 'legacy')
    expect(kept?.messages).toHaveLength(1)
    expect(kept?.localOnly).toBe(false)
  })

  it('keeps legacy tapes unmarked when the upload fails, so the next sync retries', async () => {
    setConversations([conv('legacy', { messages: [msg('m', 5)], updatedAt: 999 })], 'legacy')
    apiMock.listConversations.mockResolvedValue({ conversations: [], total: 0 })
    apiMock.migrateFromLocalStorage.mockRejectedValueOnce(new Error('offline'))
    await useStore.getState().syncFromServer()

    const kept = useStore.getState().conversations.find((c) => c.id === 'legacy')
    expect(kept).toBeDefined()
    expect(kept?.localOnly).toBeUndefined()

    await useStore.getState().syncFromServer()
    expect(apiMock.migrateFromLocalStorage).toHaveBeenCalledTimes(2)
    expect(useStore.getState().conversations.find((c) => c.id === 'legacy')?.localOnly).toBe(false)
  })

  it('does not upload empty legacy tapes', async () => {
    setConversations([conv('blank', { updatedAt: 999 })], 'blank')
    apiMock.listConversations.mockResolvedValue({ conversations: [], total: 0 })
    await useStore.getState().syncFromServer()
    expect(apiMock.migrateFromLocalStorage).not.toHaveBeenCalled()
  })

  it('does not resurrect a conversation deleted locally during the sync', async () => {
    setConversations([conv('a', { updatedAt: 999 }), conv('b')], 'a')
    const list = deferred<{ conversations: ReturnType<typeof meta>[]; total: number }>()
    apiMock.listConversations.mockReturnValue(list.promise)
    const sync = useStore.getState().syncFromServer()
    useStore.getState().deleteConversation('b')
    list.resolve({ conversations: [meta('a', 50), meta('b', 40)], total: 2 })
    await sync
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['a'])
  })
})

describe('lazy conversation creation', () => {
  it('reuses the current blank tape instead of creating another', () => {
    setConversations([conv('blank', { localOnly: true })], 'blank')
    useStore.getState().createConversation()
    expect(useStore.getState().conversations).toHaveLength(1)
    expect(useStore.getState().currentConversationId).toBe('blank')
    expect(apiMock.createConversation).not.toHaveBeenCalled()
  })

  it('switches to an existing unused blank tape', () => {
    setConversations(
      [conv('busy', { messages: [msg('x', 1)] }), conv('blank', { localOnly: true })],
      'busy',
    )
    useStore.getState().createConversation()
    expect(useStore.getState().conversations).toHaveLength(2)
    expect(useStore.getState().currentConversationId).toBe('blank')
  })

  it('creates a new tape locally only, and on the server with its first message', async () => {
    setConversations([conv('busy', { messages: [msg('x', 1)] })], 'busy')
    useStore.getState().createConversation()
    const id = useStore.getState().currentConversationId!
    expect(id).not.toBe('busy')
    await flushServerWrites()
    expect(apiMock.createConversation).not.toHaveBeenCalled()

    useStore.getState().addMessage({ role: 'user', content: 'first words' })
    await flushServerWrites()

    // Created with the client's id (no id swap), with the message's content in
    // one request (migrate carries the seeded messages)
    const created = apiMock.migrateFromLocalStorage.mock.calls[0]?.[0] as Conversation[]
    expect(created[0]?.id).toBe(id)
    expect(created[0]?.messages.map((m) => m.content)).toEqual(['first words'])
    // ...so the message is not posted a second time
    expect(apiMock.addMessage).not.toHaveBeenCalled()
    expect(useStore.getState().conversations.find((c) => c.id === id)?.localOnly).toBe(false)

    useStore.getState().addMessage({ role: 'assistant', content: 'reply' })
    await flushServerWrites()
    expect(apiMock.addMessage).toHaveBeenCalledTimes(1)
    expect(apiMock.addMessage.mock.calls[0]?.[0]).toBe(id)
    const sent = apiMock.addMessage.mock.calls[0]?.[1] as { id: string; content: string }
    expect(sent.content).toBe('reply')
    expect(sent.id).toBe(useStore.getState().messages[1]?.id)
  })

  it('waits for creation before posting messages', async () => {
    setConversations([conv('new', { localOnly: true })], 'new')
    const create = deferred<unknown>()
    apiMock.migrateFromLocalStorage.mockReturnValue(create.promise)
    useStore.getState().addMessage({ role: 'user', content: 'one' })
    useStore.getState().addMessage({ role: 'assistant', content: 'two' })
    await Promise.resolve()
    expect(apiMock.addMessage).not.toHaveBeenCalled()
    create.resolve({ success: true, imported: 1, skipped: 0 })
    await flushServerWrites()
    // Both were on the tape when it was created, so both went with the creation
    const created = apiMock.migrateFromLocalStorage.mock.calls[0]?.[0] as Conversation[]
    expect(created[0]?.messages.map((m) => m.content)).toEqual(['one', 'two'])
    expect(apiMock.addMessage).not.toHaveBeenCalled()
    expect(useStore.getState().messages.every((m) => !m.unsynced)).toBe(true)
  })

  it('deleting the last tape leaves a local-only blank one, without a server create', async () => {
    setConversations([conv('only', { messages: [msg('x', 1)] })], 'only')
    useStore.getState().deleteConversation('only')
    await flushServerWrites()
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('only')
    expect(apiMock.createConversation).not.toHaveBeenCalled()
    const [replacement] = useStore.getState().conversations
    expect(replacement?.localOnly).toBe(true)
    expect(useStore.getState().currentConversationId).toBe(replacement?.id)
  })

  it('deleting a never-synced tape still tells the server (it may exist there)', async () => {
    // e.g. another tab created this blank tape, or our creation's response was lost
    setConversations([conv('a', { messages: [msg('x', 1)] }), conv('b', { localOnly: true })], 'a')
    useStore.getState().deleteConversation('b')
    await flushServerWrites()
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('b')
  })

  it('migration skips empty tapes', async () => {
    localStorage.setItem(
      'wtb_conversations',
      JSON.stringify([conv('empty'), conv('full', { messages: [msg('x', 1)] })]),
    )
    await useStore.getState().migrateToServer()
    const sent = apiMock.migrateFromLocalStorage.mock.calls[0]?.[0] as Conversation[]
    expect(sent.map((c) => c.id)).toEqual(['full'])
  })

  it('mode changes on a blank tape stay local until it is created', async () => {
    setConversations([conv('new', { localOnly: true })], 'new')
    useStore.getState().setConversationMode('new', 'architect')
    await flushServerWrites()
    expect(apiMock.updateConversationMode).not.toHaveBeenCalled()
    useStore.getState().addMessage({ role: 'user', content: 'hi' })
    await flushServerWrites()
    expect(apiMock.updateConversationMode).toHaveBeenCalledWith('new', 'architect')
  })
})

// Data-loss bugs found in review of the first-message fix
describe('review: no lost messages or tapes', () => {
  it('keeps a tape created while the conversation list was in flight', async () => {
    setConversations([conv('t0', { localOnly: true })], 't0')
    const list = deferred<{ conversations: unknown[]; total: number }>()
    apiMock.listConversations.mockReturnValue(list.promise)
    const sync = useStore.getState().syncFromServer()
    await vi.waitFor(() => expect(apiMock.listConversations).toHaveBeenCalled())

    useStore.getState().addMessage({ role: 'user', content: 'hello' })
    await flushServerWrites() // the creation lands: t0 is no longer local-only
    list.resolve({ conversations: [], total: 0 }) // ...but the snapshot predates it
    await sync

    const s = useStore.getState()
    expect(s.currentConversationId).toBe('t0')
    expect(s.messages.map((m) => m.content)).toEqual(['hello'])
    expect(s.conversations.map((c) => c.id)).toEqual(['t0'])
  })

  it('still drops a synced tape missing from a list requested after our last write', async () => {
    setConversations([conv('t0', { localOnly: true }), conv('gone', { localOnly: false })], 't0')
    useStore.getState().addMessage({ role: 'user', content: 'hello' })
    await flushServerWrites()
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('t0', 5)], total: 1 })
    apiMock.getConversation.mockImplementation(async (id: string) => {
      if (id === 'gone') throw notFound()
      return serverConv('t0', [], 5)
    })
    await useStore.getState().syncFromServer()
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['t0'])
  })

  it('does not treat a "skipped" import as stored (lost response on the first send)', async () => {
    setConversations([conv('t0', { localOnly: true })], 't0')
    apiMock.migrateFromLocalStorage
      .mockRejectedValueOnce(new Error('network: response lost (server committed)'))
      // An older server answers a repeat with "already exists" and stores nothing
      .mockResolvedValueOnce({ success: true, imported: 0, skipped: 1 })
    useStore.getState().addMessage({ role: 'user', content: 'first' })
    await flushServerWrites()
    useStore.getState().addMessage({ role: 'user', content: 'second' })
    await flushServerWrites()

    const posted = apiMock.addMessage.mock.calls.map((c) => (c[1] as { content: string }).content)
    expect(posted).toContain('second')
  })

  it('retries the import with every message after a lost response, and trusts its per-tape result', async () => {
    setConversations([conv('t0', { localOnly: true })], 't0')
    apiMock.migrateFromLocalStorage
      .mockRejectedValueOnce(new Error('network: response lost'))
      .mockResolvedValueOnce({
        success: true,
        imported: 0,
        skipped: 1,
        results: [{ id: 't0', ok: true, created: false, messagesAdded: 1 }],
      })
    useStore.getState().addMessage({ role: 'user', content: 'first' })
    await flushServerWrites()
    expect(useStore.getState().conversations[0]?.localOnly).toBe(true)
    useStore.getState().addMessage({ role: 'user', content: 'second' })
    await flushServerWrites()

    const retry = apiMock.migrateFromLocalStorage.mock.calls[1]?.[0] as Conversation[]
    expect(retry[0]?.messages.map((m) => m.content)).toEqual(['first', 'second'])
    expect(apiMock.addMessage).not.toHaveBeenCalled()
    expect(useStore.getState().conversations[0]?.localOnly).toBe(false)
  })

  it('keeps a tape local-only when the server reports its import failed', async () => {
    setConversations([conv('t0', { localOnly: true })], 't0')
    apiMock.migrateFromLocalStorage.mockResolvedValueOnce({
      success: false,
      imported: 0,
      skipped: 0,
      results: [{ id: 't0', ok: false, error: 'boom' }],
    })
    useStore.getState().addMessage({ role: 'user', content: 'first' })
    await flushServerWrites()
    expect(useStore.getState().conversations[0]?.localOnly).toBe(true)
    expect(apiMock.addMessage).not.toHaveBeenCalled()
  })

  it('deleting a tape while its creation is in flight deletes it on the server', async () => {
    setConversations(
      [conv('t0', { localOnly: true }), conv('t1', { localOnly: false, messages: [msg('x', 1)] })],
      't0',
    )
    const create = deferred<unknown>()
    apiMock.migrateFromLocalStorage.mockReturnValue(create.promise)
    useStore.getState().addMessage({ role: 'user', content: 'oops' })
    await vi.waitFor(() => expect(apiMock.migrateFromLocalStorage).toHaveBeenCalled())
    useStore.getState().deleteConversation('t0')
    create.resolve({ success: true, imported: 1, skipped: 0 })
    await flushServerWrites()
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('t0')
  })

  it('a queued send for a deleted tape does not create it', async () => {
    setConversations([conv('t0', { localOnly: true }), conv('t1', { localOnly: false })], 't0')
    // Liner notes create the (empty) tape first; the send queues behind that
    const create = deferred<unknown>()
    apiMock.createConversation.mockReturnValueOnce(create.promise)
    void useStore.getState().saveLinerNotes('t0', 'notes')
    await vi.waitFor(() => expect(apiMock.createConversation).toHaveBeenCalled())
    useStore.getState().addMessage({ role: 'user', content: 'queued' })
    useStore.getState().deleteConversation('t0')
    create.resolve({})
    await flushServerWrites()
    expect(apiMock.migrateFromLocalStorage).not.toHaveBeenCalled()
    expect(apiMock.addMessage).not.toHaveBeenCalled()
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('t0')
  })

  it('"New tape" on an unhydrated server tape starts a new one', () => {
    setConversations([conv('old', { localOnly: false, stale: true, title: 'Important' })], 'old')
    useStore.getState().createConversation()
    expect(useStore.getState().currentConversationId).not.toBe('old')
  })

  it('the first message seen on an unhydrated server tape does not retitle it', async () => {
    setConversations([conv('old', { localOnly: false, stale: true, title: 'Important' })], 'old')
    useStore.getState().addMessage({ role: 'user', content: 'unrelated new topic' })
    await flushServerWrites()
    expect(apiMock.updateConversation).not.toHaveBeenCalled()
    expect(useStore.getState().conversations[0]?.title).toBe('Important')
  })
})

describe('migrateLocalStorageKeys', () => {
  it('keeps wtb_* data and renames legacy talkboy_/talkie_ keys', () => {
    localStorage.clear()
    localStorage.setItem('wtb_conversations', '[{"id":"keep"}]')
    localStorage.setItem('talkie_tts_voice', 'Samantha')
    localStorage.setItem('talkboy_theme', 'aol')
    migrateLocalStorageKeys()
    expect(localStorage.getItem('wtb_conversations')).toBe('[{"id":"keep"}]')
    expect(localStorage.getItem('wtb_tts_voice')).toBe('Samantha')
    expect(localStorage.getItem('wtb_theme')).toBe('aol')
    expect(localStorage.getItem('talkie_tts_voice')).toBeNull()
    expect(localStorage.getItem('_wtb_keys_migrated')).toBe('1')
  })
})

// Second review round
describe('review round 2: deletes always reach the server', () => {
  it('deleting a tape whose creation committed but whose response was lost sends the DELETE', async () => {
    setConversations([conv('t', { localOnly: true })], 't')
    apiMock.migrateFromLocalStorage.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    useStore.getState().addMessage({ role: 'user', content: 'hello' })
    await flushServerWrites()
    expect(useStore.getState().conversations.find((c) => c.id === 't')?.localOnly).toBe(true)

    useStore.getState().deleteConversation('t')
    await flushServerWrites()
    expect(apiMock.deleteConversation).toHaveBeenCalledWith('t')
  })

  it('a delete that fails is retried on the next sync, and the tape is not merged back', async () => {
    setConversations([conv('a', { localOnly: false }), conv('t', { localOnly: false })], 'a')
    apiMock.deleteConversation.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    useStore.getState().deleteConversation('t')
    await flushServerWrites()
    expect(localStorage.getItem('wtb_pending_deletes')).toBe('["t"]')

    // A reload: in-memory state is gone, the server still lists the tape
    resetSyncStateForTesting()
    enableServerSync()
    apiMock.listConversations.mockResolvedValue({
      conversations: [meta('a', 5), meta('t', 5)],
      total: 2,
    })
    apiMock.getConversation.mockResolvedValue(serverConv('a', [], 5))
    await useStore.getState().syncFromServer()
    await flushServerWrites()
    expect(apiMock.deleteConversation).toHaveBeenCalledTimes(2)
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['a'])
    expect(localStorage.getItem('wtb_pending_deletes')).toBeNull()
  })
})

describe('review round 2: unconfirmed messages are kept and retried', () => {
  it('mergeMessages keeps an unsynced local message however old it is', () => {
    const local = [msg('a', 1), { ...msg('lost', 2), unsynced: true }, msg('b', 3)]
    const server = [msg('a', 1), msg('b', 3)]
    expect(mergeMessages(local, server).map((m) => m.id)).toEqual(['a', 'b', 'lost'])
  })

  it('a failed post is retried, in order, on the next send, and survives a reload of the tape', async () => {
    setConversations([conv('s', { localOnly: false, messages: [msg('m1', 1000)] })], 's')
    apiMock.addMessage.mockRejectedValueOnce(new TypeError('Failed to fetch')) // server restarting
    useStore.getState().addMessage({ role: 'user', content: 'lost one' })
    await flushServerWrites()
    expect(useStore.getState().messages[1]?.unsynced).toBe(true)

    useStore.getState().addMessage({ role: 'user', content: 'later one' })
    await flushServerWrites()
    const posted = apiMock.addMessage.mock.calls.map((c) => (c[1] as { content: string }).content)
    expect(posted).toEqual(['lost one', 'lost one', 'later one'])
    expect(useStore.getState().messages.some((m) => m.unsynced)).toBe(false)
  })

  it('an unconfirmed message is not dropped when the server copy has newer messages', async () => {
    setConversations([conv('s', { localOnly: false, messages: [msg('m1', 1000)] })], 's')
    apiMock.addMessage.mockRejectedValue(new TypeError('Failed to fetch'))
    useStore.getState().addMessage({ role: 'user', content: 'lost one' })
    await flushServerWrites()
    // Another client added a newer message; ours never landed
    apiMock.getConversation.mockResolvedValue(
      serverConv('s', [msg('m1', 1000), msg('other', Date.now() + 1000, 'from elsewhere')]),
    )
    useStore.getState().loadConversation('s')
    await vi.waitFor(() =>
      expect(useStore.getState().messages.map((m) => m.content)).toContain('from elsewhere'),
    )
    expect(useStore.getState().messages.map((m) => m.content)).toContain('lost one')
  })

  it('persists the unsynced flag in the local cache', async () => {
    setConversations([conv('s', { localOnly: false })], 's')
    apiMock.addMessage.mockRejectedValue(new TypeError('Failed to fetch'))
    useStore.getState().addMessage({ role: 'user', content: 'queued' })
    await flushServerWrites()
    const cached = JSON.parse(localStorage.getItem('wtb_conversations')!) as Conversation[]
    expect(cached[0]?.messages[0]).toMatchObject({ content: 'queued', unsynced: true })
  })

  it('retries a failed post on its own, with backoff', async () => {
    vi.useFakeTimers()
    try {
      setConversations([conv('s', { localOnly: false })], 's')
      apiMock.addMessage.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      useStore.getState().addMessage({ role: 'user', content: 'retry me' })
      await vi.advanceTimersByTimeAsync(0)
      expect(apiMock.addMessage).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2000)
      expect(apiMock.addMessage).toHaveBeenCalledTimes(2)
      expect(useStore.getState().messages[0]?.unsynced).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('messages written while the server was unreachable are posted once sync starts', async () => {
    resetSyncStateForTesting() // sync never enabled: the server was down at load
    setConversations([conv('t0', { localOnly: true }), conv('s', { localOnly: false })], 't0')
    useStore.getState().addMessage({ role: 'user', content: 'offline new tape' })
    useStore.getState().loadConversation('s')
    useStore.getState().addMessage({ role: 'user', content: 'offline old tape' })
    expect(apiMock.migrateFromLocalStorage).not.toHaveBeenCalled()

    enableServerSync()
    apiMock.listConversations.mockResolvedValue({ conversations: [meta('s', 5)], total: 1 })
    apiMock.getConversation.mockResolvedValue(serverConv('s', [], 5))
    await useStore.getState().syncFromServer()
    await flushServerWrites()

    const created = apiMock.migrateFromLocalStorage.mock.calls[0]?.[0] as Conversation[]
    expect(created[0]?.messages.map((m) => m.content)).toEqual(['offline new tape'])
    const posted = apiMock.addMessage.mock.calls.map((c) => (c[1] as { content: string }).content)
    expect(posted).toEqual(['offline old tape'])
    const all = useStore.getState().conversations.flatMap((c) => c.messages)
    expect(all.map((m) => m.content).sort()).toEqual(['offline new tape', 'offline old tape'])
  })

  it('a message whose id the server says is taken is posted under a new id', async () => {
    setConversations([conv('s', { localOnly: false })], 's')
    apiMock.addMessage.mockRejectedValueOnce(Object.assign(new Error('taken'), { status: 409 }))
    useStore.getState().addMessage({ role: 'user', content: 'collide' })
    const original = useStore.getState().messages[0]!.id
    await flushServerWrites()
    const ids = apiMock.addMessage.mock.calls.map((c) => (c[1] as { id: string }).id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(original)
    expect(ids[1]).not.toBe(original)
    expect(useStore.getState().messages[0]).toMatchObject({ id: ids[1], content: 'collide' })
    expect(useStore.getState().messages[0]?.unsynced).toBeUndefined()
  })

  it('adopts ids the server remapped on import', async () => {
    setConversations([conv('t0', { localOnly: true })], 't0')
    apiMock.migrateFromLocalStorage.mockImplementationOnce(async (convs: Conversation[]) => {
      const id = convs[0]!.messages[0]!.id
      return {
        success: true,
        imported: 1,
        skipped: 0,
        results: [
          { id: 't0', ok: true, created: true, messagesAdded: 1, remapped: { [id]: 'new' } },
        ],
      }
    })
    useStore.getState().addMessage({ role: 'user', content: 'hi' })
    await flushServerWrites()
    expect(useStore.getState().messages[0]).toMatchObject({ id: 'new', content: 'hi' })
  })
})

describe('review round 2: tapes the list missed', () => {
  it('keeps a synced tape that offset paging skipped (it moved up a page)', async () => {
    const others = Array.from({ length: 100 }, (_, i) =>
      conv(`o${i}`, { localOnly: false, updatedAt: 500 - i }),
    )
    const open = conv('X', { localOnly: false, messages: [msg('x1', 10)], updatedAt: 10 })
    setConversations([...others, open], 'X')
    // Page 1 was read before X was touched elsewhere; page 2 after it moved to the top
    apiMock.listConversations.mockImplementation(async (_limit: number, offset: number) =>
      offset === 0
        ? { conversations: others.map((c) => meta(c.id, c.updatedAt)), total: 101 }
        : { conversations: [meta('o99', 401)], total: 101 },
    )
    apiMock.getConversation.mockResolvedValue(serverConv('X', [msg('x1', 10)], 600))
    await useStore.getState().syncFromServer()
    const s = useStore.getState()
    expect(s.currentConversationId).toBe('X')
    expect(s.messages.map((m) => m.id)).toEqual(['x1'])
  })

  it('keeps an unlisted tape when the server cannot be asked (not a 404)', async () => {
    setConversations([conv('a', { localOnly: false, messages: [msg('x', 1)] })], 'a')
    apiMock.listConversations.mockResolvedValue({ conversations: [], total: 0 })
    apiMock.getConversation.mockRejectedValue(new TypeError('Failed to fetch'))
    await useStore.getState().syncFromServer()
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['a'])
  })
})

describe('review round 2: migration gives up on a tape the server keeps rejecting', () => {
  it('stores the good tapes, and stops re-sending a rejected one after 3 tries', async () => {
    localStorage.setItem(
      'wtb_conversations',
      JSON.stringify([
        conv('good', { messages: [msg('g', 1)] }),
        conv('bad', { messages: [msg('b', 1)] }),
      ]),
    )
    setConversations(JSON.parse(localStorage.getItem('wtb_conversations')!), 'good')
    apiMock.migrateFromLocalStorage.mockImplementation(async (convs: Conversation[]) => ({
      success: false,
      imported: 1,
      skipped: 0,
      results: convs.map((c) =>
        c.id === 'bad' ? { id: 'bad', ok: false, error: 'boom' } : { id: c.id, ok: true },
      ),
    }))

    expect(await useStore.getState().migrateToServer()).toBe(false)
    expect(useStore.getState().conversations.find((c) => c.id === 'good')?.localOnly).toBe(false)
    expect(apiMock.markMigrationComplete).not.toHaveBeenCalled()

    expect(await useStore.getState().migrateToServer()).toBe(false)
    expect(await useStore.getState().migrateToServer()).toBe(true) // third strike: given up
    expect(apiMock.markMigrationComplete).toHaveBeenCalled()
    // ...and it is not sent again
    const calls = apiMock.migrateFromLocalStorage.mock.calls.length
    await useStore.getState().migrateToServer()
    expect(apiMock.migrateFromLocalStorage.mock.calls.length).toBe(calls)
  })

  it('a network failure does not count against a tape', async () => {
    localStorage.setItem(
      'wtb_conversations',
      JSON.stringify([conv('t', { messages: [msg('x', 1)] })]),
    )
    apiMock.migrateFromLocalStorage.mockRejectedValue(new TypeError('Failed to fetch'))
    for (let i = 0; i < 4; i++) expect(await useStore.getState().migrateToServer()).toBe(false)
    expect(localStorage.getItem('wtb_upload_failures')).toBeNull()
  })
})

describe('tapes deleted elsewhere are not resurrected (#12)', () => {
  it('drops a local-only tape whose import the server refuses as deleted', async () => {
    setConversations([conv('t0', { localOnly: true }), conv('keep', { localOnly: false })], 't0')
    apiMock.migrateFromLocalStorage.mockResolvedValue({
      success: false,
      imported: 0,
      skipped: 0,
      results: [{ id: 't0', ok: false, gone: true, error: 'Conversation was deleted' }],
    })
    useStore.getState().addMessage({ role: 'user', content: 'from a stale tab' })
    await flushServerWrites()
    const s = useStore.getState()
    expect(s.conversations.map((c) => c.id)).toEqual(['keep'])
    expect(s.currentConversationId).toBe('keep')
    expect(apiMock.migrateFromLocalStorage).toHaveBeenCalledTimes(1) // no retry
  })

  it('drops a tape whose message post answers 410', async () => {
    setConversations([conv('s', { localOnly: false }), conv('keep', { localOnly: false })], 's')
    apiMock.addMessage.mockRejectedValue(gone())
    useStore.getState().addMessage({ role: 'user', content: 'too late' })
    await flushServerWrites()
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['keep'])
    expect(apiMock.migrateFromLocalStorage).not.toHaveBeenCalled()
  })

  it('drops a gone tape found by migration', async () => {
    localStorage.setItem(
      'wtb_conversations',
      JSON.stringify([conv('old', { localOnly: true, messages: [msg('m', 1)] })]),
    )
    setConversations([conv('old', { localOnly: true, messages: [msg('m', 1)] })], 'old')
    apiMock.migrateFromLocalStorage.mockResolvedValue({
      success: false,
      imported: 0,
      skipped: 0,
      results: [{ id: 'old', ok: false, gone: true }],
    })
    expect(await useStore.getState().migrateToServer()).toBe(true)
    expect(useStore.getState().conversations.map((c) => c.id)).not.toContain('old')
  })
})

describe('unsynced messages survive a server that lost its database (#13)', () => {
  it('re-uploads the whole tape when a message post answers 404', async () => {
    setConversations([conv('s', { localOnly: false, messages: [msg('m1', 1000)] })], 's')
    apiMock.addMessage.mockRejectedValueOnce(notFound())
    apiMock.migrateFromLocalStorage.mockImplementation(async (convs: Conversation[]) => ({
      success: true,
      imported: 1,
      skipped: 0,
      results: [{ id: convs[0]!.id, ok: true, created: true }],
    }))
    useStore.getState().addMessage({ role: 'user', content: 'after restart' })
    await flushServerWrites()
    const uploaded = apiMock.migrateFromLocalStorage.mock.calls[0]?.[0] as Conversation[]
    expect(uploaded[0]?.messages.map((m) => m.content)).toEqual(['m1', 'after restart'])
    const s = useStore.getState()
    expect(s.messages.some((m) => m.unsynced)).toBe(false)
    expect(s.conversations[0]?.localOnly).toBe(false)
  })

  it('keeps and re-uploads an unlisted tape with unsynced messages on a 404', async () => {
    const pending = { ...msg('p', 2), unsynced: true }
    setConversations([conv('a', { localOnly: false, messages: [msg('x', 1), pending] })], 'a')
    apiMock.listConversations.mockResolvedValue({ conversations: [], total: 0 })
    apiMock.getConversation.mockRejectedValue(notFound())
    await useStore.getState().syncFromServer()
    await flushServerWrites()
    expect(useStore.getState().conversations.map((c) => c.id)).toEqual(['a'])
    const uploaded = apiMock.migrateFromLocalStorage.mock.calls[0]?.[0] as Conversation[]
    expect(uploaded[0]?.messages.map((m) => m.id)).toEqual(['x', 'p'])
  })

  it('still drops an unlisted tape the server says was deleted', async () => {
    const pending = { ...msg('p', 2), unsynced: true }
    setConversations([conv('a', { localOnly: false, messages: [pending] })], 'a')
    apiMock.listConversations.mockResolvedValue({ conversations: [], total: 0 })
    apiMock.getConversation.mockRejectedValue(gone())
    await useStore.getState().syncFromServer()
    await flushServerWrites()
    expect(useStore.getState().conversations.map((c) => c.id)).not.toContain('a')
    expect(apiMock.migrateFromLocalStorage).not.toHaveBeenCalled()
  })
})
