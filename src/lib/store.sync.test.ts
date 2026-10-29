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
    // 'one' went with the creation; 'two' was added after it
    expect(apiMock.addMessage).toHaveBeenCalledTimes(1)
    expect((apiMock.addMessage.mock.calls[0]?.[1] as { content: string }).content).toBe('two')
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

  it('deleting a never-synced tape makes no server call', async () => {
    setConversations([conv('a', { messages: [msg('x', 1)] }), conv('b', { localOnly: true })], 'a')
    useStore.getState().deleteConversation('b')
    await flushServerWrites()
    expect(apiMock.deleteConversation).not.toHaveBeenCalled()
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
    apiMock.getConversation.mockResolvedValue(serverConv('t0', [], 5))
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
