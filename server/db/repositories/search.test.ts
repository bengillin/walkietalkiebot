import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from '../../test/helpers.js'
import { createConversation } from './conversations.js'
import { createMessage } from './messages.js'
import { searchMessages, rebuildSearchIndex } from './search.js'

beforeEach(() => {
  resetTestDb()
  createConversation({ id: 'c1', title: 'Test Conversation' })
})

describe('searchMessages', () => {
  it('returns empty for empty query', () => {
    expect(searchMessages('')).toEqual([])
    expect(searchMessages('  ')).toEqual([])
  })

  it('finds matching messages', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'How do I fix the authentication bug?' })
    createMessage({ id: 'm2', conversationId: 'c1', role: 'assistant', content: 'Check your JWT token expiration.' })

    const results = searchMessages('authentication')
    expect(results).toHaveLength(1)
    expect(results[0].message_id).toBe('m1')
    expect(results[0].conversation_title).toBe('Test Conversation')
  })

  it('finds messages with prefix matching', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'debugging the server' })

    const results = searchMessages('debug')
    expect(results).toHaveLength(1)
  })

  it('returns multiple matches ranked', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'react component rendering issue' })
    createMessage({ id: 'm2', conversationId: 'c1', role: 'assistant', content: 'The react lifecycle hooks need updating' })
    createMessage({ id: 'm3', conversationId: 'c1', role: 'user', content: 'unrelated message about python' })

    const results = searchMessages('react')
    expect(results).toHaveLength(2)
  })

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      createMessage({ id: `m${i}`, conversationId: 'c1', role: 'user', content: `test message ${i}` })
    }

    const results = searchMessages('test', 3)
    expect(results).toHaveLength(3)
  })

  it('includes snippet with match markers', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'How to configure webpack for production?' })

    const results = searchMessages('webpack')
    expect(results).toHaveLength(1)
    expect(results[0].snippet).toContain('<mark>')
  })

  it('searches across conversations', () => {
    createConversation({ id: 'c2', title: 'Second Conversation' })
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'database migration' })
    createMessage({ id: 'm2', conversationId: 'c2', role: 'user', content: 'database schema' })

    const results = searchMessages('database')
    expect(results).toHaveLength(2)
  })
})

describe('rebuildSearchIndex', () => {
  it('runs without error', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'test' })
    expect(() => rebuildSearchIndex()).not.toThrow()
  })
})
