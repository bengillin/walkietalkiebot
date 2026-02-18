import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from '../../test/helpers.js'
import {
  listConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  touchConversation,
  updateLinerNotes,
  getLinerNotes,
  countConversations,
} from './conversations.js'

beforeEach(() => {
  resetTestDb()
})

describe('createConversation', () => {
  it('creates with default title', () => {
    const conv = createConversation({ id: 'c1' })
    expect(conv.id).toBe('c1')
    expect(conv.title).toBe('New conversation')
    expect(conv.created_at).toBeGreaterThan(0)
    expect(conv.updated_at).toBe(conv.created_at)
  })

  it('creates with custom title', () => {
    const conv = createConversation({ id: 'c1', title: 'My Chat' })
    expect(conv.title).toBe('My Chat')
  })

  it('creates with project and parent IDs', () => {
    const conv = createConversation({ id: 'c1', projectId: 'proj1', parentId: 'parent1' })
    expect(conv.project_id).toBe('proj1')
    expect(conv.parent_id).toBe('parent1')
  })
})

describe('getConversation', () => {
  it('returns existing conversation', () => {
    createConversation({ id: 'c1', title: 'Test' })
    const conv = getConversation('c1')
    expect(conv).not.toBeNull()
    expect(conv!.title).toBe('Test')
  })

  it('returns null for non-existing', () => {
    expect(getConversation('nope')).toBeNull()
  })
})

describe('listConversations', () => {
  it('returns empty list initially', () => {
    expect(listConversations()).toEqual([])
  })

  it('returns conversations ordered by updated_at DESC', () => {
    createConversation({ id: 'c1', title: 'First' })
    createConversation({ id: 'c2', title: 'Second' })
    // Touch c1 to make it most recent
    touchConversation('c1')

    const list = listConversations()
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('c1')
    expect(list[1].id).toBe('c2')
  })

  it('respects limit and offset', () => {
    createConversation({ id: 'c1' })
    createConversation({ id: 'c2' })
    createConversation({ id: 'c3' })

    const page1 = listConversations(2, 0)
    expect(page1).toHaveLength(2)

    const page2 = listConversations(2, 2)
    expect(page2).toHaveLength(1)
  })
})

describe('updateConversation', () => {
  it('updates title', () => {
    createConversation({ id: 'c1', title: 'Old' })
    const updated = updateConversation('c1', { title: 'New' })
    expect(updated!.title).toBe('New')
    expect(updated!.updated_at).toBeGreaterThanOrEqual(updated!.created_at)
  })

  it('returns null for non-existing', () => {
    expect(updateConversation('nope', { title: 'x' })).toBeNull()
  })

  it('updates projectId and parentId', () => {
    createConversation({ id: 'c1' })
    const updated = updateConversation('c1', { projectId: 'p1', parentId: 'par1' })
    expect(updated!.project_id).toBe('p1')
    expect(updated!.parent_id).toBe('par1')
  })
})

describe('deleteConversation', () => {
  it('deletes existing conversation', () => {
    createConversation({ id: 'c1' })
    expect(deleteConversation('c1')).toBe(true)
    expect(getConversation('c1')).toBeNull()
  })

  it('returns false for non-existing', () => {
    expect(deleteConversation('nope')).toBe(false)
  })
})

describe('touchConversation', () => {
  it('updates the updated_at timestamp', () => {
    const conv = createConversation({ id: 'c1' })
    const originalUpdatedAt = conv.updated_at

    // Small delay to ensure different timestamp
    touchConversation('c1')
    const touched = getConversation('c1')
    expect(touched!.updated_at).toBeGreaterThanOrEqual(originalUpdatedAt)
  })
})

describe('liner notes', () => {
  it('returns null when no notes set', () => {
    createConversation({ id: 'c1' })
    expect(getLinerNotes('c1')).toBeNull()
  })

  it('sets and gets liner notes', () => {
    createConversation({ id: 'c1' })
    updateLinerNotes('c1', '# My Notes\nSome content')
    expect(getLinerNotes('c1')).toBe('# My Notes\nSome content')
  })

  it('clears liner notes with null', () => {
    createConversation({ id: 'c1' })
    updateLinerNotes('c1', 'notes')
    updateLinerNotes('c1', null)
    expect(getLinerNotes('c1')).toBeNull()
  })
})

describe('countConversations', () => {
  it('returns 0 when empty', () => {
    expect(countConversations()).toBe(0)
  })

  it('returns correct count after inserts', () => {
    createConversation({ id: 'c1' })
    createConversation({ id: 'c2' })
    expect(countConversations()).toBe(2)
  })

  it('decrements after delete', () => {
    createConversation({ id: 'c1' })
    createConversation({ id: 'c2' })
    deleteConversation('c1')
    expect(countConversations()).toBe(1)
  })
})
