import { create } from 'zustand'
import type { AppState, AvatarState, Conversation, Message } from '../types'

const STORAGE_KEY = 'talkboy_conversations'

// Load conversations from localStorage
function loadConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Save conversations to localStorage
function saveConversations(conversations: Conversation[]) {
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

export const useStore = create<AppState>((set, get) => {
  // Initialize with saved conversations
  const savedConversations = loadConversations()
  const initialConversation = savedConversations.length > 0
    ? savedConversations[0]
    : createNewConversation()

  // If no conversations exist, create initial one
  if (savedConversations.length === 0) {
    savedConversations.push(initialConversation)
    saveConversations(savedConversations)
  }

  return {
    avatarState: 'idle',
    setAvatarState: (avatarState: AvatarState) => set({ avatarState }),

    // Current conversation
    currentConversationId: initialConversation.id,
    messages: initialConversation.messages,

    addMessage: (message) => {
      const newMessage: Message = {
        ...message,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      }

      set((state) => {
        const newMessages = [...state.messages, newMessage]

        // Update the conversation in storage
        const conversations = state.conversations.map((conv) => {
          if (conv.id === state.currentConversationId) {
            return {
              ...conv,
              messages: newMessages,
              title: conv.messages.length === 0 ? generateTitle(newMessages) : conv.title,
              updatedAt: Date.now(),
            }
          }
          return conv
        })

        saveConversations(conversations)

        return {
          messages: newMessages,
          conversations,
        }
      })
    },

    // All conversations
    conversations: savedConversations,

    createConversation: () => {
      const newConv = createNewConversation()

      set((state) => {
        const conversations = [newConv, ...state.conversations]
        saveConversations(conversations)

        return {
          currentConversationId: newConv.id,
          messages: [],
          conversations,
          contextConversationIds: [], // Clear context on new conversation
        }
      })
    },

    loadConversation: (id: string) => {
      const state = get()
      const conversation = state.conversations.find((c) => c.id === id)
      if (conversation) {
        set({
          currentConversationId: id,
          messages: conversation.messages,
        })
      }
    },

    deleteConversation: (id: string) => {
      set((state) => {
        const conversations = state.conversations.filter((c) => c.id !== id)

        // If deleting current conversation, switch to another or create new
        let newCurrentId = state.currentConversationId
        let newMessages = state.messages

        if (state.currentConversationId === id) {
          if (conversations.length > 0) {
            newCurrentId = conversations[0].id
            newMessages = conversations[0].messages
          } else {
            const newConv = createNewConversation()
            conversations.push(newConv)
            newCurrentId = newConv.id
            newMessages = []
          }
        }

        // Remove from context if present
        const contextConversationIds = state.contextConversationIds.filter(
          (cid) => cid !== id
        )

        saveConversations(conversations)

        return {
          conversations,
          currentConversationId: newCurrentId,
          messages: newMessages,
          contextConversationIds,
        }
      })
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

    transcript: '',
    setTranscript: (transcript) => set({ transcript }),
  }
})
