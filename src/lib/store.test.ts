import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('useStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    useStore.setState({
      messages: [],
      conversations: [{
        id: 'test-conv',
        title: 'Test',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      currentConversationId: 'test-conv',
      activities: [],
      attachedFiles: [],
      imageAnalyses: [],
      contextConversationIds: [],
    })
  })

  describe('avatarState', () => {
    it('initializes to idle', () => {
      expect(useStore.getState().avatarState).toBe('idle')
    })

    it('updates avatar state', () => {
      useStore.getState().setAvatarState('listening')
      expect(useStore.getState().avatarState).toBe('listening')
    })
  })

  describe('messages', () => {
    it('adds a user message', () => {
      useStore.getState().addMessage({ role: 'user', content: 'Hello' })
      const messages = useStore.getState().messages
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Hello')
    })

    it('adds an assistant message', () => {
      useStore.getState().addMessage({ role: 'assistant', content: 'Hi there!' })
      const messages = useStore.getState().messages
      expect(messages).toHaveLength(1)
      expect(messages[0].role).toBe('assistant')
    })

    it('generates message IDs', () => {
      useStore.getState().addMessage({ role: 'user', content: 'Test' })
      const messages = useStore.getState().messages
      expect(messages[0].id).toBeDefined()
      expect(typeof messages[0].id).toBe('string')
    })

    it('adds timestamps to messages', () => {
      const before = Date.now()
      useStore.getState().addMessage({ role: 'user', content: 'Test' })
      const after = Date.now()
      const timestamp = useStore.getState().messages[0].timestamp
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })

  describe('activities', () => {
    it('adds activity', () => {
      useStore.getState().addActivity({ type: 'tool_start', tool: 'Read' })
      const activities = useStore.getState().activities
      expect(activities).toHaveLength(1)
      expect(activities[0].tool).toBe('Read')
    })

    it('updates activity', () => {
      const id = useStore.getState().addActivity({ type: 'tool_start', tool: 'Edit', status: 'running' })
      useStore.getState().updateActivity(id, { status: 'complete' })
      const activity = useStore.getState().activities.find(a => a.id === id)
      expect(activity?.status).toBe('complete')
    })

    it('clears activities', () => {
      useStore.getState().addActivity({ type: 'tool_start', tool: 'Read' })
      useStore.getState().addActivity({ type: 'tool_start', tool: 'Edit' })
      useStore.getState().clearActivities()
      expect(useStore.getState().activities).toHaveLength(0)
    })
  })

  describe('attachedFiles', () => {
    it('adds files', () => {
      const file = { id: '1', name: 'test.png', type: 'image/png', size: 1024, dataUrl: 'data:...' }
      useStore.getState().addFiles([file])
      expect(useStore.getState().attachedFiles).toHaveLength(1)
    })

    it('removes file', () => {
      const file = { id: '1', name: 'test.png', type: 'image/png', size: 1024, dataUrl: 'data:...' }
      useStore.getState().addFiles([file])
      useStore.getState().removeFile('1')
      expect(useStore.getState().attachedFiles).toHaveLength(0)
    })

    it('clears all files', () => {
      useStore.getState().addFiles([
        { id: '1', name: 'a.png', type: 'image/png', size: 1024, dataUrl: 'data:...' },
        { id: '2', name: 'b.png', type: 'image/png', size: 2048, dataUrl: 'data:...' },
      ])
      useStore.getState().clearFiles()
      expect(useStore.getState().attachedFiles).toHaveLength(0)
    })
  })

  describe('context conversations', () => {
    it('toggles context conversation on', () => {
      useStore.getState().toggleContextConversation('conv-1')
      expect(useStore.getState().contextConversationIds).toContain('conv-1')
    })

    it('toggles context conversation off', () => {
      useStore.getState().toggleContextConversation('conv-1')
      useStore.getState().toggleContextConversation('conv-1')
      expect(useStore.getState().contextConversationIds).not.toContain('conv-1')
    })

    it('clears all context', () => {
      useStore.getState().toggleContextConversation('conv-1')
      useStore.getState().toggleContextConversation('conv-2')
      useStore.getState().clearContext()
      expect(useStore.getState().contextConversationIds).toHaveLength(0)
    })
  })
})
