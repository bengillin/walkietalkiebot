import { create } from 'zustand'
import type {
  Activity,
  AppState,
  AvatarState,
  Conversation,
  DroppedFile,
  ImageAnalysis,
  Message,
  StoredActivity,
} from '../types'
import * as api from './api'

import { createLogger } from './logger'

const log = createLogger('store')

// Convert live activities to compact stored format
function activityToStored(activity: Activity): StoredActivity | null {
  // Only store completed tool activities
  if (activity.type !== 'tool_start' || !activity.tool) return null
  if (activity.status !== 'complete' && activity.status !== 'error') return null

  return {
    id: activity.id,
    tool: activity.tool,
    input: activity.input ? activity.input.slice(0, 100) : undefined, // Truncate for storage
    status: activity.status,
    timestamp: activity.timestamp,
    error: activity.status === 'error' ? activity.output : undefined,
  }
}

// One-time migration: rename talkboy_*/talkie_* localStorage keys → wtb_*.
// Only legacy-prefixed keys are touched: a wtb_* key maps to itself, and
// removing it would delete the very data being migrated to.
export function migrateLocalStorageKeys() {
  if (localStorage.getItem('_wtb_keys_migrated')) return
  const keysToMigrate: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('talkboy_') || key?.startsWith('talkie_')) keysToMigrate.push(key)
  }
  for (const oldKey of keysToMigrate) {
    const newKey = oldKey.replace(/^talkboy_|^talkie_/, 'wtb_')
    if (!localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, localStorage.getItem(oldKey)!)
    }
    localStorage.removeItem(oldKey)
  }
  if (keysToMigrate.length > 0) {
    log.debug(`Migrated ${keysToMigrate.length} localStorage keys to wtb_*`)
  }
  localStorage.setItem('_wtb_keys_migrated', '1')
}

migrateLocalStorageKeys()

const STORAGE_KEY = 'wtb_conversations'

// Load conversations from localStorage (used as fallback/cache)
function loadConversationsFromStorage(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (err) {
    log.warn('Could not read cached conversations; starting empty:', err)
    return []
  }
}

// Save conversations to localStorage (cache for offline access)
function saveConversationsToStorage(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  } catch (err) {
    // Usually a full quota. The server remains the source of truth, so this is
    // recoverable, but it should not vanish silently.
    log.warn('Could not cache conversations locally (storage full?):', err)
  }
}

// Generate a title from the first user message
function generateTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user')
  if (!firstUserMessage) return 'New conversation'
  const content = firstUserMessage.content.trim()
  return content.length > 40 ? content.slice(0, 40) + '...' : content
}

// Create a new conversation object. It is local-only until its first message:
// the server copy is created lazily (see ensureServerConversation).
function createNewConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New conversation',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    localOnly: true,
  }
}

type ServerConversation = Awaited<ReturnType<typeof api.getConversation>>

function messagesFromServer(serverConv: ServerConversation): Message[] {
  return serverConv.messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    source: m.source,
    images: m.images,
  }))
}

function activitiesFromServer(serverConv: ServerConversation): StoredActivity[] {
  return serverConv.activities.map((a) => ({
    id: a.id,
    tool: a.tool,
    input: a.input,
    status: a.status as 'complete' | 'error',
    timestamp: a.timestamp,
    duration: a.duration,
    error: a.error,
  }))
}

/**
 * Merge a server snapshot of a conversation's messages with the local copy.
 * The server wins for everything it has. Local messages it doesn't have are
 * kept when they are `unsynced` (not yet confirmed: always kept, however old)
 * or newer than the snapshot. Other local-only messages are dropped: they
 * predate the snapshot and were confirmed, so the server already reflects them
 * (possibly under another id — messages synced before ids were shared).
 */
export function mergeMessages(local: Message[], server: Message[]): Message[] {
  const serverIds = new Set(server.map((m) => m.id))
  const latestServer = server.reduce((max, m) => Math.max(max, m.timestamp), -Infinity)
  const pending = local.filter(
    (m) => !serverIds.has(m.id) && (m.unsynced === true || m.timestamp > latestServer),
  )
  return pending.length > 0 ? [...server, ...pending] : server
}

const isNotFound = (err: unknown) => (err as { status?: unknown } | null)?.status === 404
// 410: the tape was deleted. 404 alone means the server never had it (or lost
// its database), which is not a reason to throw away unsynced messages.
const isGone = (err: unknown) => (err as { status?: unknown } | null)?.status === 410
const isConflict = (err: unknown) => (err as { status?: unknown } | null)?.status === 409

/** Run fn over items, a few at a time. */
async function forEachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker))
}

// Deletes the server hasn't confirmed, persisted so a reload or a server
// restart can't resurrect the tape: retried on every sync until they land.
const PENDING_DELETES_KEY = 'wtb_pending_deletes'
function readPendingDeletes(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PENDING_DELETES_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function writePendingDeletes(ids: Set<string>) {
  try {
    if (ids.size === 0) localStorage.removeItem(PENDING_DELETES_KEY)
    else localStorage.setItem(PENDING_DELETES_KEY, JSON.stringify([...ids]))
  } catch (err) {
    log.warn('Could not record a pending delete:', err)
  }
}

// Uploads of cached tapes the server keeps rejecting: after a few, stop
// re-sending them (with their images) on every load.
const UPLOAD_FAILURES_KEY = 'wtb_upload_failures'
const MAX_UPLOAD_FAILURES = 3
function readUploadFailures(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_FAILURES_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

// Server sync state
let serverSyncEnabled = false
let serverProjectId: string | null = null

// Ids deleted locally this session, so an in-flight sync can't resurrect them
const deletedIds = new Set<string>()

// Per-conversation server write queue: keeps creation → messages → title in
// order, so the server never sees a message for a conversation it lacks.
const writeQueues = new Map<string, Promise<unknown>>()

// When each conversation's writes last settled, on a counter shared with
// syncFromServer (Infinity while a write is queued or in flight). A server list
// requested before that point can't reflect our writes, so a tape missing from
// it was not "deleted elsewhere" — it may have been created after the snapshot.
let writeClock = 0
const lastWriteSettled = new Map<string, number>()

function enqueueWrite(id: string, label: string, task: () => Promise<unknown>): Promise<void> {
  const prev = writeQueues.get(id) ?? Promise.resolve()
  lastWriteSettled.set(id, Infinity)
  const next: Promise<void> = prev.then(task).then(
    () => undefined,
    (err) => log.warn(`${label}:`, err),
  )
  writeQueues.set(id, next)
  void next.then(() => {
    if (writeQueues.get(id) === next) lastWriteSettled.set(id, ++writeClock)
  })
  return next
}

// Retry timers for tapes whose messages didn't reach the server
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const retryAttempts = new Map<string, number>()
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 60_000

/** Test hook: wait for all queued server writes to settle. */
export async function flushServerWrites(): Promise<void> {
  await Promise.all([...writeQueues.values()])
}

/** Test hook: reset module-level sync state. */
export function resetSyncStateForTesting() {
  serverSyncEnabled = false
  serverProjectId = null
  deletedIds.clear()
  writeQueues.clear()
  lastWriteSettled.clear()
  writeClock = 0
  for (const timer of retryTimers.values()) clearTimeout(timer)
  retryTimers.clear()
  retryAttempts.clear()
}

export const useStore = create<AppState>((set, get) => {
  // Initialize with saved conversations from localStorage
  const savedConversations = loadConversationsFromStorage()
  // No tapes yet: start with a local-only one. It reaches the server (and the
  // tape collection of other clients) only once something is said on it.
  const initialConversation = savedConversations[0] ?? createNewConversation()

  if (savedConversations.length === 0) {
    savedConversations.push(initialConversation)
    saveConversationsToStorage(savedConversations)
  }

  const updateConversations = (fn: (c: Conversation) => Conversation) => {
    set((state) => {
      const conversations = state.conversations.map(fn)
      saveConversationsToStorage(conversations)
      return { conversations }
    })
  }

  /**
   * The server confirmed these messages: clear their `unsynced` flag, and adopt
   * any new id it stored them under.
   */
  const markSynced = (convId: string, ids: Set<string>, remap?: Record<string, string>) => {
    const confirm = (m: Message): Message => {
      if (!ids.has(m.id)) return m
      const confirmed: Message = { ...m, id: remap?.[m.id] ?? m.id }
      delete confirmed.unsynced
      return confirmed
    }
    set((state) => {
      const conversations = state.conversations.map((c) =>
        c.id === convId ? { ...c, messages: c.messages.map(confirm) } : c,
      )
      saveConversationsToStorage(conversations)
      return state.currentConversationId === convId
        ? { conversations, messages: state.messages.map(confirm) }
        : { conversations }
    })
  }

  /** Give one local message a new id (the server says its id is taken). */
  const renameMessage = (convId: string, oldId: string, newId: string) => {
    const rename = (m: Message) => (m.id === oldId ? { ...m, id: newId } : m)
    set((state) => {
      const conversations = state.conversations.map((c) =>
        c.id === convId ? { ...c, messages: c.messages.map(rename) } : c,
      )
      saveConversationsToStorage(conversations)
      return state.currentConversationId === convId
        ? { conversations, messages: state.messages.map(rename) }
        : { conversations }
    })
  }

  /**
   * Upload tapes through POST /api/migrate. Applies each tape's result locally
   * (localOnly cleared, messages confirmed, remapped ids adopted) and counts
   * rejected tapes, giving up on one after MAX_UPLOAD_FAILURES. Resolves to the
   * ids the server stored. Throws on a network error (nothing is counted).
   */
  const uploadTapes = async (tapes: Conversation[]): Promise<Set<string>> => {
    const result = await api.migrateFromLocalStorage(tapes)
    const failures = readUploadFailures()
    const stored = new Set<string>()
    for (const tape of tapes) {
      const outcome = result.results?.find((r) => r.id === tape.id)
      if (outcome ? outcome.ok : result.success && result.imported > 0) {
        stored.add(tape.id)
        delete failures[tape.id]
        updateConversations((c) => (c.id === tape.id ? { ...c, localOnly: false } : c))
        markSynced(tape.id, new Set(tape.messages.map((m) => m.id)), outcome?.remapped)
      } else if (outcome?.gone) {
        delete failures[tape.id]
        dropDeletedTape(tape.id)
      } else if (outcome && !outcome.ok) {
        const count = (failures[tape.id] ?? 0) + 1
        failures[tape.id] = count
        const verdict =
          count >= MAX_UPLOAD_FAILURES
            ? 'giving up on it'
            : `will retry (${count}/${MAX_UPLOAD_FAILURES})`
        log.warn(
          `The server rejected tape "${tape.title}" (${tape.id}); ${verdict}:`,
          outcome.error,
        )
      }
    }
    try {
      localStorage.setItem(UPLOAD_FAILURES_KEY, JSON.stringify(failures))
    } catch {
      /* the count is advisory */
    }
    return stored
  }

  const uploadable = (c: Conversation) =>
    c.messages.length > 0 && (readUploadFailures()[c.id] ?? 0) < MAX_UPLOAD_FAILURES

  /**
   * Make sure a conversation exists on the server, confirming the messages the
   * creation carried. Must be called from inside the conversation's write queue.
   *
   * Both server calls are idempotent: creating an existing id returns it, and
   * the import adds only the messages the server lacks. That matters because a
   * "local-only" tape may already exist server-side — the creation's response
   * was lost, or another tab created the same blank tape first.
   */
  const ensureServerConversation = async (id: string): Promise<void> => {
    const conv = get().conversations.find((c) => c.id === id)
    if (!conv || !conv.localOnly) return

    if (conv.messages.length === 0) {
      await api.createConversation({ id, title: conv.title, mode: conv.mode })
    } else {
      // The tape and its messages in one request. Only a per-tape `ok` (or a
      // fresh import) confirms the messages: a bare "skipped" from an older
      // server means it had the tape, not these messages, so they stay
      // unsynced and are posted one by one.
      const result = await api.migrateFromLocalStorage([conv])
      const outcome = result.results?.find((r) => r.id === id)
      if (outcome?.gone) {
        throw Object.assign(new Error(`Conversation ${id} was deleted`), { status: 410 })
      }
      if (outcome ? !outcome.ok : !result.success) {
        throw new Error(`Server did not store conversation ${id}: ${outcome?.error ?? 'unknown'}`)
      }
      if (outcome || result.imported > 0) {
        markSynced(id, new Set(conv.messages.map((m) => m.id)), outcome?.remapped)
      }
      if (conv.mode) await api.updateConversationMode(id, conv.mode)
    }
    if (conv.projectId || conv.parentId) {
      await api
        .updateConversation(id, {
          projectId: conv.projectId ?? undefined,
          parentId: conv.parentId ?? undefined,
        })
        .catch((err) => log.warn('Failed to set conversation project/parent:', err))
    }
    updateConversations((c) => (c.id === id ? { ...c, localOnly: false } : c))
  }

  const postMessage = (convId: string, m: Message) =>
    api.addMessage(convId, {
      id: m.id,
      timestamp: m.timestamp,
      role: m.role,
      content: m.content,
      source: 'web',
      images: m.images?.map((img) => ({
        id: img.id,
        dataUrl: img.dataUrl,
        fileName: img.fileName,
        description: img.description,
      })),
    })

  const scheduleRetry = (id: string) => {
    if (retryTimers.has(id)) return
    const attempt = retryAttempts.get(id) ?? 0
    retryAttempts.set(id, attempt + 1)
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS)
    retryTimers.set(
      id,
      setTimeout(() => {
        retryTimers.delete(id)
        syncConversation(id)
      }, delay),
    )
  }

  /**
   * Bring a tape's server copy up to date: create it if needed, then post its
   * unsynced messages in order. Posting is idempotent by message id, so a
   * request whose response was lost is safely repeated. On failure the
   * messages stay unsynced and the tape is retried with backoff (and on the
   * next send or sync).
   */
  const syncConversation = (id: string): Promise<void> | undefined => {
    if (!serverSyncEnabled) return undefined
    return enqueueWrite(id, 'Failed to sync messages to server', async () => {
      if (deletedIds.has(id)) return
      let reuploaded = false
      try {
        await ensureServerConversation(id)
        for (;;) {
          const next = get()
            .conversations.find((c) => c.id === id)
            ?.messages.find((m) => m.unsynced)
          if (!next || deletedIds.has(id)) break
          try {
            await postMessage(id, next)
          } catch (err) {
            if (isNotFound(err) && !reuploaded) {
              // The server lost the tape (e.g. it now runs on another
              // database) without it being deleted: upload it again, whole
              reuploaded = true
              updateConversations((c) => (c.id === id ? { ...c, localOnly: true } : c))
              await ensureServerConversation(id)
              continue
            }
            if (!isConflict(err)) throw err
            // Its id is taken by another tape: post it under a fresh one
            const fresh = crypto.randomUUID()
            renameMessage(id, next.id, fresh)
            await postMessage(id, { ...next, id: fresh })
            markSynced(id, new Set([fresh]))
            continue
          }
          markSynced(id, new Set([next.id]))
        }
        retryAttempts.delete(id)
        const timer = retryTimers.get(id)
        if (timer) clearTimeout(timer)
        retryTimers.delete(id)
      } catch (err) {
        if (isGone(err)) {
          // Deleted elsewhere while this tab still had writes for it
          log.info(`Tape ${id} was deleted elsewhere; dropping it`)
          dropDeletedTape(id)
          return
        }
        scheduleRetry(id)
        throw err
      }
    })
  }

  /**
   * Remove a tape locally (the open one falls back to the next, or a blank
   * tape) and keep it out of later merges. Returns the removed tape, if any.
   */
  const removeTape = (id: string): Conversation | undefined => {
    const removed = get().conversations.find((c) => c.id === id)
    deletedIds.add(id)

    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)

      // If deleting current conversation, switch to another or start a
      // blank local-only tape (created on the server on its first message,
      // like every other new tape)
      let newCurrentId = state.currentConversationId
      let newMessages = state.messages
      let newActivities = state.storedActivities

      if (state.currentConversationId === id) {
        const next = conversations[0]
        if (next) {
          newCurrentId = next.id
          newMessages = next.messages
          newActivities = next.activities || []
        } else {
          const newConv = createNewConversation()
          if (serverProjectId) newConv.projectId = serverProjectId
          conversations.push(newConv)
          newCurrentId = newConv.id
          newMessages = []
          newActivities = []
        }
      }

      // Remove from context if present
      const contextConversationIds = state.contextConversationIds.filter((cid) => cid !== id)

      saveConversationsToStorage(conversations)

      return {
        conversations,
        currentConversationId: newCurrentId,
        messages: newMessages,
        storedActivities: newActivities,
        contextConversationIds,
      }
    })
    return removed
  }

  /** A tape deleted elsewhere (the server answered 410): forget it here. */
  const dropDeletedTape = (id: string) => {
    removeTape(id)
    const timer = retryTimers.get(id)
    if (timer) clearTimeout(timer)
    retryTimers.delete(id)
    retryAttempts.delete(id)
  }

  /** Send a delete, and keep it pending (persisted) until the server confirms. */
  const syncDelete = (id: string) => {
    if (!serverSyncEnabled) return
    enqueueWrite(id, 'Failed to delete conversation on server', async () => {
      await api.deleteConversation(id) // 404 counts as deleted
      const pending = readPendingDeletes()
      pending.delete(id)
      writePendingDeletes(pending)
    })
  }

  return {
    avatarState: 'idle',
    setAvatarState: (avatarState: AvatarState) => set({ avatarState }),

    // Current conversation
    currentConversationId: initialConversation.id,
    messages: initialConversation.messages,
    storedActivities: initialConversation.activities || [],

    addMessage: (message, images) => {
      const state = get()
      const newMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        images: images && images.length > 0 ? images : undefined,
        // Until the server confirms it (even while sync is off: it is posted
        // once the server is reachable)
        unsynced: true,
      }

      const newMessages = [...state.messages, newMessage]
      // Only a tape that has never reached the server is known to be empty.
      // An unhydrated (stale) tape has no local messages but may have plenty
      // on the server, and its title must not be overwritten.
      const currentConv = state.conversations.find((c) => c.id === state.currentConversationId)
      const isFirstMessage = state.messages.length === 0 && currentConv?.localOnly === true

      // Update local state immediately
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
          return {
            ...conv,
            messages: newMessages,
            title: isFirstMessage ? generateTitle(newMessages) : conv.title,
            updatedAt: Date.now(),
          }
        }
        return conv
      })

      saveConversationsToStorage(conversations)

      set({
        messages: newMessages,
        conversations,
      })

      // Sync to server (queued per conversation; creates it first if needed).
      // The server titles a tape from its first user message itself.
      if (state.currentConversationId) syncConversation(state.currentConversationId)
    },

    // All conversations
    conversations: savedConversations,

    createConversation: (parentId?: string) => {
      const state = get()
      const parent = parentId ? state.conversations.find((c) => c.id === parentId) : undefined

      if (!parent) {
        // A blank tape is already loaded (or sitting unused): reuse it rather
        // than piling up empty tapes.
        const current = state.conversations.find((c) => c.id === state.currentConversationId)
        // Only local-only tapes are known to be blank: an unhydrated server
        // tape has no local messages either.
        const isBlank = (c: Conversation) => c.localOnly === true && c.messages.length === 0
        const blank = current && isBlank(current) ? current : state.conversations.find(isBlank)
        if (blank) {
          set({
            currentConversationId: blank.id,
            messages: [],
            storedActivities: [],
            linerNotes: blank.linerNotes || null,
            activities: [],
            contextConversationIds: [],
          })
          return
        }
      }

      const newConv = createNewConversation()
      if (serverProjectId) newConv.projectId = serverProjectId
      if (parent) {
        newConv.parentId = parent.id
        newConv.title = `Branch of ${parent.title}`
        // Copies need their own ids: message ids are primary keys server-side.
        newConv.messages = parent.messages.map((m) => ({
          ...m,
          id: crypto.randomUUID(),
          images: m.images?.map((img) => ({ ...img, id: crypto.randomUUID() })),
          unsynced: true,
        }))
      }

      set((state) => {
        const conversations = [newConv, ...state.conversations]
        saveConversationsToStorage(conversations)
        return {
          currentConversationId: newConv.id,
          messages: newConv.messages,
          storedActivities: [],
          linerNotes: null,
          activities: [],
          conversations,
          contextConversationIds: [],
        }
      })

      // A branch already has content, so it is worth a server copy now. A
      // blank tape waits for its first message (see addMessage).
      if (parent) syncConversation(newConv.id)
    },

    loadConversation: (id: string) => {
      const state = get()
      const conversation = state.conversations.find((c) => c.id === id)
      if (conversation) {
        set({
          currentConversationId: id,
          messages: conversation.messages,
          storedActivities: conversation.activities || [],
          linerNotes: conversation.linerNotes || null,
          activities: [], // Clear live activities when switching conversations
        })
      }

      // If server sync is enabled, fetch fresh data (never for a tape the
      // server doesn't have yet — that would just 404)
      if (serverSyncEnabled && conversation?.localOnly !== true) {
        api
          .getConversation(id)
          .then((serverConv) => {
            const serverMessages = messagesFromServer(serverConv)
            const freshActivities = activitiesFromServer(serverConv)

            set((state) => {
              const local = state.conversations.find((c) => c.id === id)
              // Keep messages sent while this fetch was in flight
              const freshMessages = mergeMessages(local?.messages ?? [], serverMessages)
              const conversations = state.conversations.map((c) =>
                c.id === id
                  ? { ...c, messages: freshMessages, activities: freshActivities, stale: false }
                  : c,
              )
              saveConversationsToStorage(conversations)

              // Only touch the visible conversation if still on this one
              if (state.currentConversationId !== id) return { conversations }
              return {
                messages: freshMessages,
                storedActivities: freshActivities,
                conversations,
              }
            })
          })
          .catch((err) => log.warn('Failed to load conversation from server:', err))
      }
    },

    deleteConversation: (id: string) => {
      const deleted = removeTape(id)

      // Always tell the server, queued behind any in-flight creation. Even a
      // "local-only" tape may exist there (a creation whose response was lost,
      // or another tab created it); deleting one it lacks is a harmless 404.
      // Recorded until confirmed, so a failure is retried on the next sync.
      if (deleted) {
        const pending = readPendingDeletes()
        pending.add(id)
        writePendingDeletes(pending)
        syncDelete(id)
      }
    },

    renameConversation: (id: string, title: string) => {
      const conv = get().conversations.find((c) => c.id === id)
      updateConversations((c) => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c))

      // A local-only tape sends its title when it is created
      if (serverSyncEnabled && conv && !conv.localOnly) {
        enqueueWrite(id, 'Failed to rename conversation on server', () =>
          api.updateConversation(id, { title }),
        )
      }
    },

    setConversationMode: (id: string, mode: string) => {
      const conv = get().conversations.find((c) => c.id === id)
      updateConversations((c) => (c.id === id ? { ...c, mode } : c))

      // A local-only tape sends its mode when it is created
      if (serverSyncEnabled && conv && !conv.localOnly) {
        enqueueWrite(id, 'Failed to update conversation mode on server', () =>
          api.updateConversationMode(id, mode),
        )
      }
    },

    hydrateConversations: async (ids?: string[]) => {
      if (!serverSyncEnabled) return
      const wanted = get().conversations.filter(
        (c) => !c.localOnly && (ids ? ids.includes(c.id) : c.stale),
      )
      // Bounded concurrency: a handful of requests at a time, not 100 at once
      const queue = [...wanted]
      const worker = async () => {
        for (let conv = queue.shift(); conv; conv = queue.shift()) {
          const id = conv.id
          try {
            const serverConv = await api.getConversation(id)
            set((state) => {
              const conversations = state.conversations.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      messages: mergeMessages(c.messages, messagesFromServer(serverConv)),
                      activities: activitiesFromServer(serverConv),
                      stale: false,
                    }
                  : c,
              )
              saveConversationsToStorage(conversations)
              const current = conversations.find((c) => c.id === state.currentConversationId)
              return state.currentConversationId === id && current
                ? {
                    conversations,
                    messages: current.messages,
                    storedActivities: current.activities ?? [],
                  }
                : { conversations }
            })
          } catch (err) {
            log.warn(`Failed to load conversation ${id}:`, err)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
    },

    // Context from past conversations
    contextConversationIds: [],

    toggleContextConversation: (id: string) => {
      set((state) => {
        const isSelected = state.contextConversationIds.includes(id)
        return {
          contextConversationIds: isSelected
            ? state.contextConversationIds.filter((cid) => cid !== id)
            : [...state.contextConversationIds, id],
        }
      })
    },

    clearContext: () => {
      set({ contextConversationIds: [] })
    },

    // Text-to-speech enabled
    ttsEnabled: localStorage.getItem('wtb_tts_enabled') !== 'false',
    setTtsEnabled: (ttsEnabled) => {
      localStorage.setItem('wtb_tts_enabled', String(ttsEnabled))
      set({ ttsEnabled })
    },

    // Continuous listening (always-on with "over" trigger)
    continuousListeningEnabled: localStorage.getItem('wtb_continuous_listening') === 'true',
    setContinuousListeningEnabled: (enabled) => {
      localStorage.setItem('wtb_continuous_listening', String(enabled))
      set({ continuousListeningEnabled: enabled })
    },

    // Wake word detection (hands-free activation)
    wakeWordEnabled: localStorage.getItem('wtb_wake_word') === 'true',
    setWakeWordEnabled: (enabled) => {
      localStorage.setItem('wtb_wake_word', String(enabled))
      set({ wakeWordEnabled: enabled })
    },

    // Custom wake word
    customWakeWord: localStorage.getItem('wtb_custom_wake_word') || '',
    setCustomWakeWord: (word) => {
      localStorage.setItem('wtb_custom_wake_word', word)
      set({ customWakeWord: word })
    },

    // Custom trigger word for ending messages
    customTriggerWord: localStorage.getItem('wtb_custom_trigger_word') || '',
    setCustomTriggerWord: (word) => {
      localStorage.setItem('wtb_custom_trigger_word', word)
      set({ customTriggerWord: word })
    },

    // Trigger word delay (silence required after trigger word before ending turn)
    triggerWordDelay: parseInt(localStorage.getItem('wtb_trigger_delay') || '1000', 10),
    setTriggerWordDelay: (delay) => {
      localStorage.setItem('wtb_trigger_delay', String(delay))
      set({ triggerWordDelay: delay })
    },

    // Sound effects
    soundEffectsEnabled: localStorage.getItem('wtb_sound_effects') !== 'false',
    setSoundEffectsEnabled: (enabled) => {
      localStorage.setItem('wtb_sound_effects', String(enabled))
      set({ soundEffectsEnabled: enabled })
    },

    // TTS voice selection
    ttsVoice: localStorage.getItem('wtb_tts_voice') || '',
    setTtsVoice: (voice) => {
      localStorage.setItem('wtb_tts_voice', voice)
      set({ ttsVoice: voice })
    },

    transcript: '',
    setTranscript: (transcript) => set({ transcript }),

    // Activity feed
    activities: [],
    addActivity: (activity) => {
      const newActivity: Activity = {
        ...activity,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }
      set((state) => ({
        activities: [...state.activities, newActivity],
      }))
      return newActivity.id
    },
    updateActivity: (id, updates) => {
      set((state) => ({
        activities: state.activities.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      }))
    },
    clearActivities: () => set({ activities: [] }),

    // Finalize activities - convert live activities to stored format
    finalizeActivities: () => {
      const state = get()

      // Convert completed live activities to stored format
      const newStored: StoredActivity[] = state.activities
        .map(activityToStored)
        .filter((a): a is StoredActivity => a !== null)

      if (newStored.length === 0) {
        set({ activities: [] })
        return
      }

      // Merge with existing stored activities
      const allStored = [...state.storedActivities, ...newStored]

      // Update conversation in storage
      const conversations = state.conversations.map((conv) => {
        if (conv.id === state.currentConversationId) {
          return {
            ...conv,
            activities: allStored,
            updatedAt: Date.now(),
          }
        }
        return conv
      })

      saveConversationsToStorage(conversations)

      set({
        storedActivities: allStored,
        activities: [], // Clear live activities after finalizing
        conversations,
      })
    },

    // File attachments
    attachedFiles: [],
    addFiles: (files: DroppedFile[]) => {
      set((state) => ({
        attachedFiles: [...state.attachedFiles, ...files],
      }))
    },
    removeFile: (id: string) => {
      set((state) => ({
        attachedFiles: state.attachedFiles.filter((f) => f.id !== id),
      }))
    },
    updateFile: (id: string, updates: Partial<DroppedFile>) => {
      set((state) => ({
        attachedFiles: state.attachedFiles.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      }))
    },
    clearFiles: () => set({ attachedFiles: [] }),

    // Image analysis (cross-mode context)
    imageAnalyses: [],
    addImageAnalysis: (analysis) => {
      const newAnalysis: ImageAnalysis = {
        ...analysis,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }
      set((state) => ({
        imageAnalyses: [...state.imageAnalyses, newAnalysis],
      }))
      return newAnalysis.id
    },
    updateImageAnalysis: (id, updates) => {
      set((state) => ({
        imageAnalyses: state.imageAnalyses.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      }))
    },
    clearImageAnalyses: () => set({ imageAnalyses: [] }),
    getImageContext: () => {
      const state = get()
      const completed = state.imageAnalyses.filter((a) => a.status === 'complete')
      if (completed.length === 0) return ''

      return completed.map((a) => `[Image: ${a.fileName}]\n${a.description}`).join('\n\n')
    },

    // Liner Notes
    linerNotes: null,
    setLinerNotes: (notes) => set({ linerNotes: notes }),
    saveLinerNotes: async (conversationId, notes) => {
      set({ linerNotes: notes })

      // Update local cache
      set((state) => {
        const conversations = state.conversations.map((c) =>
          c.id === conversationId ? { ...c, linerNotes: notes, updatedAt: Date.now() } : c,
        )
        saveConversationsToStorage(conversations)
        return { conversations }
      })

      // Sync to server (notes are content: they bring a local-only tape into being)
      if (serverSyncEnabled) {
        enqueueWrite(conversationId, 'Failed to save liner notes to server', async () => {
          if (deletedIds.has(conversationId)) return
          await ensureServerConversation(conversationId)
          await api.saveLinerNotes(conversationId, notes)
        })
      }
    },

    // Server sync
    serverSyncEnabled: false,
    setServerSyncEnabled: (enabled: boolean) => {
      serverSyncEnabled = enabled
      set({ serverSyncEnabled: enabled })
    },

    // Sync all conversations from server
    syncFromServer: async () => {
      if (!serverSyncEnabled) return

      try {
        // Deletes the server hasn't confirmed (e.g. made while it was down):
        // keep them out of the merge and send them again
        for (const id of readPendingDeletes()) {
          deletedIds.add(id)
          syncDelete(id)
        }

        // Writes that settle after this point may be missing from the list
        const listRequestedAt = ++writeClock
        // Metadata only — one cheap request per page of 100, instead of a full
        // fetch (messages + base64 images) for every tape.
        const serverList: api.Conversation[] = []
        for (let offset = 0; ;) {
          const page = await api.listConversations(100, offset)
          serverList.push(...page.conversations)
          offset += page.conversations.length
          if (page.conversations.length === 0 || offset >= page.total) break
        }

        // Tapes cached by a build before `localOnly` existed have no marker, so we
        // can't tell "deleted on the server" from "never reached it" (the old
        // create-id race left messages only in localStorage). Upload the ones with
        // content through POST /api/migrate rather than dropping them; that
        // matches what the old sync did, which kept every local tape.
        //
        // A tape deleted since the server started keeping tombstones is refused
        // (gone) and dropped. One deleted before that comes back: keeping data
        // beats that rare resurrection.
        const listedIds = new Set(serverList.map((c) => c.id))
        const legacyOrphans = get().conversations.filter(
          (c) => c.localOnly === undefined && !listedIds.has(c.id) && uploadable(c),
        )
        if (legacyOrphans.length > 0) {
          try {
            await uploadTapes(legacyOrphans) // marks the stored ones synced
          } catch (err) {
            log.warn('Could not upload tapes that only exist in this browser; will retry:', err)
          }
        }

        // A synced tape missing from the list is only dropped once the server
        // confirms it is gone: offset paging can skip a tape that moved up a
        // page between requests, and that must not delete it locally.
        const confirmedGone = new Set<string>()
        const unlisted = get().conversations.filter(
          (c) => c.localOnly === false && !listedIds.has(c.id) && !deletedIds.has(c.id),
        )
        await forEachLimited(unlisted, 4, async (c) => {
          try {
            await api.getConversation(c.id)
          } catch (err) {
            if (isGone(err)) confirmedGone.add(c.id)
            else if (isNotFound(err)) {
              // Never deleted, but the server doesn't have it (it lost or
              // swapped its database). Unsynced messages are uploaded again,
              // tape and all, rather than silently dropped. A fully synced
              // tape is dropped as before: it may predate tombstones.
              if (c.messages.some((m) => m.unsynced)) {
                updateConversations((t) => (t.id === c.id ? { ...t, localOnly: true } : t))
              } else confirmedGone.add(c.id)
            }
          }
        })

        // Full messages only for the open tape, and only if our copy is behind
        const before = get()
        const currentId = before.currentConversationId
        const currentMeta = serverList.find((c) => c.id === currentId)
        const currentLocal = before.conversations.find((c) => c.id === currentId)
        let currentFull: ServerConversation | null = null
        if (
          currentMeta &&
          (!currentLocal || currentLocal.stale || currentLocal.updatedAt < currentMeta.updatedAt)
        ) {
          currentFull = await api.getConversation(currentMeta.id).catch((err) => {
            log.warn('Failed to load current conversation from server:', err)
            return null
          })
        }

        // Merge against the state as it is *now*: anything the user did while
        // the requests were in flight (e.g. sending the first message) wins.
        set((state) => {
          const localById = new Map(state.conversations.map((c) => [c.id, c]))
          const merged: Conversation[] = []
          const serverIds = new Set<string>()

          for (const meta of serverList) {
            if (deletedIds.has(meta.id)) continue
            serverIds.add(meta.id)
            const local = localById.get(meta.id)
            const localNewer = !!local && local.updatedAt > meta.updatedAt
            const conv: Conversation = {
              ...local,
              id: meta.id,
              title: local && localNewer ? local.title : meta.title,
              messages: local?.messages ?? [],
              activities: local?.activities,
              createdAt: meta.createdAt,
              updatedAt: Math.max(meta.updatedAt, local?.updatedAt ?? 0),
              mode: meta.mode ?? local?.mode,
              projectId: meta.projectId ?? local?.projectId,
              parentId: meta.parentId ?? local?.parentId,
              localOnly: false,
              // Our cached messages are behind; refreshed when opened
              stale: !local || local.stale === true || local.updatedAt < meta.updatedAt,
            }
            if (currentFull && meta.id === currentFull.id) {
              conv.messages = mergeMessages(local?.messages ?? [], messagesFromServer(currentFull))
              conv.activities = activitiesFromServer(currentFull)
              conv.stale = false
            }
            merged.push(conv)
          }

          // Local tapes the server doesn't list: drop only ones it confirmed are
          // gone (deleted elsewhere — don't resurrect them), unless we wrote to
          // them after the list was requested. Keep everything else: never
          // synced, created while the list was in flight, skipped by paging,
          // or a legacy tape whose upload will be retried.
          for (const local of state.conversations) {
            if (serverIds.has(local.id) || deletedIds.has(local.id)) continue
            const writtenSinceList = (lastWriteSettled.get(local.id) ?? -1) > listRequestedAt
            if (!confirmedGone.has(local.id) || writtenSinceList) merged.push(local)
          }

          merged.sort((a, b) => b.updatedAt - a.updatedAt)

          let current = merged.find((c) => c.id === state.currentConversationId)
          if (!current) {
            // The open tape was deleted elsewhere: fall back to a blank one
            current = createNewConversation()
            if (serverProjectId) current.projectId = serverProjectId
            merged.unshift(current)
          }

          saveConversationsToStorage(merged)

          return {
            conversations: merged,
            currentConversationId: current.id,
            messages: current.messages,
            storedActivities: current.activities || [],
          }
        })

        // Post anything still unconfirmed (sent while the server was down, or
        // before a reload)
        for (const c of get().conversations) {
          if (c.messages.some((m) => m.unsynced)) syncConversation(c.id)
        }
      } catch (err) {
        log.warn('Failed to sync from server:', err)
      }
    },

    // Migrate localStorage to server
    migrateToServer: async () => {
      if (!serverSyncEnabled) return false

      try {
        // Empty tapes are not worth importing (they used to pile up: one per
        // fresh browser profile), and tapes the server keeps rejecting are
        // given up on rather than re-sent, images and all, on every load.
        // Tapes known to be on the server (localOnly: false) are skipped.
        const pending = () =>
          loadConversationsFromStorage().filter((c) => c.localOnly !== false && uploadable(c))
        const localConvos = pending()
        if (localConvos.length === 0) {
          api.markMigrationComplete()
          return true
        }

        const stored = await uploadTapes(localConvos)
        log.debug(`Migration: ${stored.size} of ${localConvos.length} tapes stored`)
        // Done once nothing is left to retry
        if (pending().length === 0) {
          api.markMigrationComplete()
          return true
        }
        return false
      } catch (err) {
        log.warn('Migration failed:', err)
        return false
      }
    },
  }
})

// Export function to enable server sync (called from App.tsx after checking status)
export function enableServerSync() {
  serverSyncEnabled = true
  useStore.getState().setServerSyncEnabled(true)
}

export function setProjectId(projectId: string) {
  serverProjectId = projectId
}
