import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from '../../test/helpers.js'
import { createConversation } from './conversations.js'
import {
  getMessagesForConversation,
  getImagesForMessage,
  getImagesForMessages,
  createMessage,
  updateImageDescription,
  deleteMessage,
  countMessagesInConversation,
} from './messages.js'

beforeEach(() => {
  resetTestDb()
  createConversation({ id: 'conv1', title: 'Test Conversation' })
})

describe('createMessage', () => {
  it('creates a basic message', () => {
    const msg = createMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: 'Hello',
    })
    expect(msg.id).toBe('m1')
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello')
    expect(msg.position).toBe(0)
    expect(msg.source).toBe('web')
  })

  it('auto-increments position', () => {
    createMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: 'First' })
    const m2 = createMessage({ id: 'm2', conversationId: 'conv1', role: 'assistant', content: 'Second' })
    expect(m2.position).toBe(1)
  })

  it('creates message with images', () => {
    createMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: 'See this image',
      images: [
        { id: 'img1', dataUrl: 'data:image/png;base64,abc', fileName: 'test.png', description: 'A test image' },
      ],
    })

    const images = getImagesForMessage('m1')
    expect(images).toHaveLength(1)
    expect(images[0].file_name).toBe('test.png')
    expect(images[0].description).toBe('A test image')
  })

  it('creates message with custom source', () => {
    const msg = createMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: 'From telegram',
      source: 'telegram',
    })
    expect(msg.source).toBe('telegram')
  })
})

describe('getMessagesForConversation', () => {
  it('returns empty array for no messages', () => {
    expect(getMessagesForConversation('conv1')).toEqual([])
  })

  it('returns messages ordered by position', () => {
    createMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: 'First' })
    createMessage({ id: 'm2', conversationId: 'conv1', role: 'assistant', content: 'Second' })
    createMessage({ id: 'm3', conversationId: 'conv1', role: 'user', content: 'Third' })

    const msgs = getMessagesForConversation('conv1')
    expect(msgs).toHaveLength(3)
    expect(msgs[0].content).toBe('First')
    expect(msgs[1].content).toBe('Second')
    expect(msgs[2].content).toBe('Third')
  })
})

describe('getImagesForMessages', () => {
  it('returns empty map for empty input', () => {
    const result = getImagesForMessages([])
    expect(result.size).toBe(0)
  })

  it('returns images grouped by message', () => {
    createMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: 'Image 1',
      images: [{ id: 'img1', dataUrl: 'data:a', fileName: 'a.png' }],
    })
    createMessage({
      id: 'm2',
      conversationId: 'conv1',
      role: 'user',
      content: 'Image 2',
      images: [
        { id: 'img2', dataUrl: 'data:b', fileName: 'b.png' },
        { id: 'img3', dataUrl: 'data:c', fileName: 'c.png' },
      ],
    })

    const result = getImagesForMessages(['m1', 'm2'])
    expect(result.get('m1')).toHaveLength(1)
    expect(result.get('m2')).toHaveLength(2)
  })
})

describe('updateImageDescription', () => {
  it('updates existing image description', () => {
    createMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: 'img',
      images: [{ id: 'img1', dataUrl: 'data:a', fileName: 'a.png' }],
    })
    expect(updateImageDescription('img1', 'A nice photo')).toBe(true)
    const images = getImagesForMessage('m1')
    expect(images[0].description).toBe('A nice photo')
  })

  it('returns false for non-existing image', () => {
    expect(updateImageDescription('nope', 'desc')).toBe(false)
  })
})

describe('deleteMessage', () => {
  it('deletes existing message', () => {
    createMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: 'Hello' })
    expect(deleteMessage('m1')).toBe(true)
    expect(getMessagesForConversation('conv1')).toHaveLength(0)
  })

  it('cascade deletes images', () => {
    createMessage({
      id: 'm1',
      conversationId: 'conv1',
      role: 'user',
      content: 'img',
      images: [{ id: 'img1', dataUrl: 'data:a', fileName: 'a.png' }],
    })
    deleteMessage('m1')
    expect(getImagesForMessage('m1')).toHaveLength(0)
  })

  it('returns false for non-existing', () => {
    expect(deleteMessage('nope')).toBe(false)
  })
})

describe('countMessagesInConversation', () => {
  it('returns 0 for empty conversation', () => {
    expect(countMessagesInConversation('conv1')).toBe(0)
  })

  it('returns correct count', () => {
    createMessage({ id: 'm1', conversationId: 'conv1', role: 'user', content: 'a' })
    createMessage({ id: 'm2', conversationId: 'conv1', role: 'assistant', content: 'b' })
    expect(countMessagesInConversation('conv1')).toBe(2)
  })
})
