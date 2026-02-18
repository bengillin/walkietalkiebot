import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from '../../test/helpers.js'
import { createConversation } from './conversations.js'
import { createMessage } from './messages.js'
import {
  getActivitiesForConversation,
  getActivitiesForMessage,
  createActivity,
  createActivitiesBatch,
  deleteActivitiesForConversation,
} from './activities.js'

beforeEach(() => {
  resetTestDb()
  createConversation({ id: 'c1', title: 'Test' })
})

describe('createActivity', () => {
  it('creates a basic activity', () => {
    const activity = createActivity({
      id: 'a1',
      conversationId: 'c1',
      tool: 'Read',
      status: 'complete',
    })
    expect(activity.id).toBe('a1')
    expect(activity.tool).toBe('Read')
    expect(activity.status).toBe('complete')
    expect(activity.message_id).toBeNull()
    expect(activity.input).toBeNull()
    expect(activity.duration).toBeNull()
    expect(activity.error).toBeNull()
  })

  it('creates activity with all optional fields', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'test' })

    const activity = createActivity({
      id: 'a1',
      conversationId: 'c1',
      messageId: 'm1',
      tool: 'Bash',
      input: 'npm run test',
      status: 'error',
      duration: 1500,
      error: 'Exit code 1',
    })
    expect(activity.message_id).toBe('m1')
    expect(activity.input).toBe('npm run test')
    expect(activity.status).toBe('error')
    expect(activity.duration).toBe(1500)
    expect(activity.error).toBe('Exit code 1')
  })
})

describe('getActivitiesForConversation', () => {
  it('returns empty for no activities', () => {
    expect(getActivitiesForConversation('c1')).toEqual([])
  })

  it('returns activities ordered by timestamp DESC', () => {
    createActivity({ id: 'a1', conversationId: 'c1', tool: 'Read', status: 'complete', timestamp: 1000 })
    createActivity({ id: 'a2', conversationId: 'c1', tool: 'Edit', status: 'complete', timestamp: 2000 })
    createActivity({ id: 'a3', conversationId: 'c1', tool: 'Bash', status: 'complete', timestamp: 3000 })

    const activities = getActivitiesForConversation('c1')
    expect(activities).toHaveLength(3)
    expect(activities[0].tool).toBe('Bash')  // most recent first
    expect(activities[2].tool).toBe('Read')
  })

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      createActivity({ id: `a${i}`, conversationId: 'c1', tool: 'Read', status: 'complete', timestamp: i })
    }
    expect(getActivitiesForConversation('c1', 3)).toHaveLength(3)
  })
})

describe('getActivitiesForMessage', () => {
  it('returns activities for a specific message', () => {
    createMessage({ id: 'm1', conversationId: 'c1', role: 'user', content: 'test' })
    createActivity({ id: 'a1', conversationId: 'c1', messageId: 'm1', tool: 'Read', status: 'complete' })
    createActivity({ id: 'a2', conversationId: 'c1', messageId: 'm1', tool: 'Edit', status: 'complete' })
    createActivity({ id: 'a3', conversationId: 'c1', tool: 'Bash', status: 'complete' }) // no message

    const activities = getActivitiesForMessage('m1')
    expect(activities).toHaveLength(2)
  })
})

describe('createActivitiesBatch', () => {
  it('handles empty array', () => {
    expect(() => createActivitiesBatch([])).not.toThrow()
    expect(getActivitiesForConversation('c1')).toHaveLength(0)
  })

  it('inserts multiple activities in one transaction', () => {
    createActivitiesBatch([
      { id: 'a1', conversationId: 'c1', tool: 'Read', status: 'complete' },
      { id: 'a2', conversationId: 'c1', tool: 'Edit', status: 'complete' },
      { id: 'a3', conversationId: 'c1', tool: 'Bash', status: 'error', error: 'fail' },
    ])
    expect(getActivitiesForConversation('c1')).toHaveLength(3)
  })
})

describe('deleteActivitiesForConversation', () => {
  it('deletes all activities for a conversation', () => {
    createActivity({ id: 'a1', conversationId: 'c1', tool: 'Read', status: 'complete' })
    createActivity({ id: 'a2', conversationId: 'c1', tool: 'Edit', status: 'complete' })

    const deleted = deleteActivitiesForConversation('c1')
    expect(deleted).toBe(2)
    expect(getActivitiesForConversation('c1')).toHaveLength(0)
  })

  it('returns 0 when no activities exist', () => {
    expect(deleteActivitiesForConversation('c1')).toBe(0)
  })
})
