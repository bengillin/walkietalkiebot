import { create } from 'zustand'
import type { Activity, AppState, AvatarState, Conversation, DroppedFile, ImageAnalysis, Message, StoredActivity } from '../types'
import * as api from './api'

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

const STORAGE_KEY = 'talkboy_conversations'

// Load conversations from localStorage (used as fallback/cache)
function loadConversationsFromStorage(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save conversations to localStorage (cache for offline access)
function saveConversationsToStorage(conversations: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
  } catch {
    // Ignore storage errors
  }
}

// Generate a title from the first user message
function generateTitle(messages: Message[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (!firstUserMessage) return 'New conversation'
  const content = firstUserMessage.content.trim()
  return content.length > 40 ? content.slice(0, 40) + '...' : content
}

// Create a new conversation object
function createNewConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New conversation',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// Server sync state
let serverSyncEnabled = false

export const useStore = create<AppState>((set, get) => {
  // Initialize with saved conversations from localStorage
  const savedConversations = loadConversationsFromStorage()
  const initialConversation = savedConversations.length > 0
    ? savedConversations[0]
    : createNewConversation()

  // If no conversations exist, create initial one
  if (savedConversations.length === 0) {
    savedConversations.push(initialConversation)
    saveConversationsToStorage(savedConversations)
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
      }

      const newMessages = [...state.messages, newMessage]
      const isFirstMessage = state.messages.length === 0

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

      // Sync to server (fire and forget)
      if (serverSyncEnabled && state.currentConversationId) {
        api.addMessage(state.currentConversationId, {
          role: message.role,
          content: message.content,
          source: 'web',
          images: images?.map(img => ({
            id: img.id,
            dataUrl: img.dataUrl,
            fileName: img.fileName,
            description: img.description,
          })),
        }).catch(err => console.warn('Failed to sync message to server:', err))

        // Update title on server if first user message
        if (isFirstMessage && message.role === 'user') {
          const title = generateTitle(newMessages)
          api.updateConversation(state.currentConversationId, { title })
            .catch(err => console.warn('Failed to update conversation title:', err))
        }
      }
    },

    // All conversations
    conversations: savedConversations,

    createConversation: () => {
      const newConv = createNewConversation()

      set((state) => {
        const conversations = [newConv, ...state.conversations]
        saveConversationsToStorage(conversations)

        return {
          currentConversationId: newConv.id,
          messages: [],
          storedActivities: [],
          conversations,
          contextConversationIds: [], // Clear context on new conversation
        }
      })

      // Sync to server
      if (serverSyncEnabled) {
        api.createConversation(newConv.title)
          .then(serverConv => {
            // Update local ID to match server if different
            if (serverConv.id !== newConv.id) {
              set(state => ({
                currentConversationId: state.currentConversationId === newConv.id ? serverConv.id : state.currentConversationId,
                conversations: state.conversations.map(c =>
                  c.id === newConv.id ? { ...c, id: serverConv.id } : c
                ),
              }))
            }
          })
          .catch(err => console.warn('Failed to create conversation on server:', err))
      }
    },

    loadConversation: (id: string) => {
      const state = get()
      const conversation = state.conversations.find((c) => c.id === id)
      if (conversation) {
        set({
          currentConversationId: id,
          messages: conversation.messages,
          storedActivities: conversation.activities || [],
          activities: [], // Clear live activities when switching conversations
        })
      }

      // If server sync is enabled, fetch fresh data
      if (serverSyncEnabled) {
        api.getConversation(id)
          .then(serverConv => {
            const freshMessages = serverConv.messages.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              images: m.images,
            }))
            const freshActivities = serverConv.activities.map(a => ({
              id: a.id,
              tool: a.tool,
              input: a.input,
              status: a.status as 'complete' | 'error',
              timestamp: a.timestamp,
              duration: a.duration,
              error: a.error,
            }))

            set(state => {
              // Only update if still on this conversation
              if (state.currentConversationId !== id) return state

              // Update local cache
              const conversations = state.conversations.map(c =>
                c.id === id ? { ...c, messages: freshMessages, activities: freshActivities } : c
              )
              saveConversationsToStorage(conversations)

              return {
                messages: freshMessages,
                storedActivities: freshActivities,
                conversations,
              }
            })
          })
          .catch(err => console.warn('Failed to load conversation from server:', err))
      }
    },

    deleteConversation: (id: string) => {
      set((state) => {
        const conversations = state.conversations.filter((c) => c.id !== id)

        // If deleting current conversation, switch to another or create new
        let newCurrentId = state.currentConversationId
        let newMessages = state.messages
        let newActivities = state.storedActivities

        if (state.currentConversationId === id) {
          if (conversations.length > 0) {
            newCurrentId = conversations[0].id
            newMessages = conversations[0].messages
            newActivities = conversations[0].activities || []
          } else {
            const newConv = createNewConversation()
            conversations.push(newConv)
            newCurrentId = newConv.id
            newMessages = []
            newActivities = []
          }
        }

        // Remove from context if present
        const contextConversationIds = state.contextConversationIds.filter(
          (cid) => cid !== id
        )

        saveConversationsToStorage(conversations)

        return {
          conversations,
          currentConversationId: newCurrentId,
          messages: newMessages,
          storedActivities: newActivities,
          contextConversationIds,
        }
      })

      // Sync to server
      if (serverSyncEnabled) {
        api.deleteConversation(id)
          .catch(err => console.warn('Failed to delete conversation on server:', err))
      }
    },

    renameConversation: (id: string, title: string) => {
      set((state) => {
        const conversations = state.conversations.map((c) =>
          c.id === id ? { ...c, title, updatedAt: Date.now() } : c
        )
        saveConversationsToStorage(conversations)
        return { conversations }
      })

      // Sync to server
      if (serverSyncEnabled) {
        api.updateConversation(id, { title })
          .catch(err => console.warn('Failed to rename conversation on server:', err))
      }
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

    isVoiceEnabled: true,
    setVoiceEnabled: (isVoiceEnabled) => set({ isVoiceEnabled }),

    // Text-to-speech enabled
    ttsEnabled: localStorage.getItem('talkboy_tts_enabled') !== 'false',
    setTtsEnabled: (ttsEnabled) => {
      localStorage.setItem('talkboy_tts_enabled', String(ttsEnabled))
      set({ ttsEnabled })
    },

    // Continuous listening (always-on with "over" trigger)
    continuousListeningEnabled: localStorage.getItem('talkboy_continuous_listening') === 'true',
    setContinuousListeningEnabled: (enabled) => {
      localStorage.setItem('talkboy_continuous_listening', String(enabled))
      set({ continuousListeningEnabled: enabled })
    },

    // Wake word detection (hands-free activation)
    wakeWordEnabled: localStorage.getItem('talkboy_wake_word') === 'true',
    setWakeWordEnabled: (enabled) => {
      localStorage.setItem('talkboy_wake_word', String(enabled))
      set({ wakeWordEnabled: enabled })
    },

    // Custom wake word
    customWakeWord: localStorage.getItem('talkboy_custom_wake_word') || '',
    setCustomWakeWord: (word) => {
      localStorage.setItem('talkboy_custom_wake_word', word)
      set({ customWakeWord: word })
    },

    // Custom trigger word for ending messages
    customTriggerWord: localStorage.getItem('talkboy_custom_trigger_word') || '',
    setCustomTriggerWord: (word) => {
      localStorage.setItem('talkboy_custom_trigger_word', word)
      set({ customTriggerWord: word })
    },

    // Trigger word delay (silence required after trigger word before ending turn)
    triggerWordDelay: parseInt(localStorage.getItem('talkboy_trigger_delay') || '1000', 10),
    setTriggerWordDelay: (delay) => {
      localStorage.setItem('talkboy_trigger_delay', String(delay))
      set({ triggerWordDelay: delay })
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
        activities: state.activities.map((a) =>
          a.id === id ? { ...a, ...updates } : a
        ),
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
        attachedFiles: state.attachedFiles.map((f) =>
          f.id === id ? { ...f, ...updates } : f
        ),
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
        imageAnalyses: state.imageAnalyses.map((a) =>
          a.id === id ? { ...a, ...updates } : a
        ),
      }))
    },
    clearImageAnalyses: () => set({ imageAnalyses: [] }),
    getImageContext: () => {
      const state = get()
      const completed = state.imageAnalyses.filter((a) => a.status === 'complete')
      if (completed.length === 0) return ''

      return completed
        .map((a) => `[Image: ${a.fileName}]\n${a.description}`)
        .join('\n\n')
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
        const { conversations: serverConvos } = await api.listConversations(100)

        // Merge server conversations with local
        const state = get()
        const mergedConvos: Conversation[] = []
        const seenIds = new Set<string>()

        // Add all server conversations
        for (const serverConv of serverConvos) {
          seenIds.add(serverConv.id)
          const fullConv = await api.getConversation(serverConv.id)
          mergedConvos.push({
            id: fullConv.id,
            title: fullConv.title,
            messages: fullConv.messages.map(m => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              images: m.images,
            })),
            activities: fullConv.activities.map(a => ({
              id: a.id,
              tool: a.tool,
              input: a.input,
              status: a.status as 'complete' | 'error',
              timestamp: a.timestamp,
              duration: a.duration,
              error: a.error,
            })),
            createdAt: fullConv.createdAt,
            updatedAt: fullConv.updatedAt,
          })
        }

        // Keep local conversations that aren't on server
        for (const localConv of state.conversations) {
          if (!seenIds.has(localConv.id)) {
            mergedConvos.push(localConv)
          }
        }

        // Sort by updated time
        mergedConvos.sort((a, b) => b.updatedAt - a.updatedAt)

        saveConversationsToStorage(mergedConvos)

        // Update current conversation data if it changed
        const currentConv = mergedConvos.find(c => c.id === state.currentConversationId)

        set({
          conversations: mergedConvos,
          messages: currentConv?.messages || state.messages,
          storedActivities: currentConv?.activities || state.storedActivities,
        })
      } catch (err) {
        console.warn('Failed to sync from server:', err)
      }
    },

    // Migrate localStorage to server
    migrateToServer: async () => {
      if (!serverSyncEnabled) return false

      try {
        const localConvos = loadConversationsFromStorage()
        if (localConvos.length === 0) {
          api.markMigrationComplete()
          return true
        }

        const result = await api.migrateFromLocalStorage(localConvos)

        if (result.success) {
          api.markMigrationComplete()
          console.log(`Migration complete: ${result.imported} imported, ${result.skipped} skipped`)
          return true
        }

        return false
      } catch (err) {
        console.warn('Migration failed:', err)
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

export function disableServerSync() {
  serverSyncEnabled = false
  useStore.getState().setServerSyncEnabled(false)
}
