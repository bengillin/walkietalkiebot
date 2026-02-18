import { describe, it, expect, beforeEach } from 'vitest'
import { resetTestDb } from '../../test/helpers.js'
import { createConversation } from './conversations.js'
import {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
} from './plans.js'

beforeEach(() => {
  resetTestDb()
})

describe('createPlan', () => {
  it('creates a plan with default status', () => {
    const plan = createPlan({ id: 'p1', title: 'My Plan', content: '# Steps\n1. Do this' })
    expect(plan.id).toBe('p1')
    expect(plan.title).toBe('My Plan')
    expect(plan.content).toBe('# Steps\n1. Do this')
    expect(plan.status).toBe('draft')
    expect(plan.conversation_id).toBeNull()
  })

  it('creates a plan with custom status', () => {
    const plan = createPlan({ id: 'p1', title: 'Plan', content: 'x', status: 'approved' })
    expect(plan.status).toBe('approved')
  })

  it('creates a plan linked to a conversation', () => {
    createConversation({ id: 'c1' })
    const plan = createPlan({ id: 'p1', title: 'Plan', content: 'x', conversationId: 'c1' })
    expect(plan.conversation_id).toBe('c1')
  })
})

describe('getPlan', () => {
  it('returns existing plan', () => {
    createPlan({ id: 'p1', title: 'Test', content: 'content' })
    const plan = getPlan('p1')
    expect(plan).toBeDefined()
    expect(plan!.title).toBe('Test')
  })

  it('returns undefined for non-existing', () => {
    expect(getPlan('nope')).toBeUndefined()
  })
})

describe('listPlans', () => {
  it('returns empty list initially', () => {
    expect(listPlans()).toEqual([])
  })

  it('returns plans ordered by updated_at DESC', () => {
    createPlan({ id: 'p1', title: 'First', content: 'a' })
    createPlan({ id: 'p2', title: 'Second', content: 'b' })
    // Update p1 to make it most recent
    updatePlan('p1', { title: 'First Updated' })

    const plans = listPlans()
    expect(plans).toHaveLength(2)
    expect(plans[0].id).toBe('p1')
  })

  it('respects limit and offset', () => {
    createPlan({ id: 'p1', title: 'A', content: 'a' })
    createPlan({ id: 'p2', title: 'B', content: 'b' })
    createPlan({ id: 'p3', title: 'C', content: 'c' })

    expect(listPlans(2, 0)).toHaveLength(2)
    expect(listPlans(2, 2)).toHaveLength(1)
  })
})

describe('updatePlan', () => {
  it('updates title', () => {
    createPlan({ id: 'p1', title: 'Old', content: 'x' })
    updatePlan('p1', { title: 'New' })
    expect(getPlan('p1')!.title).toBe('New')
  })

  it('updates content', () => {
    createPlan({ id: 'p1', title: 'Plan', content: 'old content' })
    updatePlan('p1', { content: 'new content' })
    expect(getPlan('p1')!.content).toBe('new content')
  })

  it('updates status', () => {
    createPlan({ id: 'p1', title: 'Plan', content: 'x' })
    updatePlan('p1', { status: 'in_progress' })
    expect(getPlan('p1')!.status).toBe('in_progress')
  })

  it('updates multiple fields at once', () => {
    createPlan({ id: 'p1', title: 'Old', content: 'old' })
    updatePlan('p1', { title: 'New', content: 'new', status: 'completed' })
    const plan = getPlan('p1')!
    expect(plan.title).toBe('New')
    expect(plan.content).toBe('new')
    expect(plan.status).toBe('completed')
  })
})

describe('deletePlan', () => {
  it('deletes existing plan', () => {
    createPlan({ id: 'p1', title: 'Plan', content: 'x' })
    deletePlan('p1')
    expect(getPlan('p1')).toBeUndefined()
  })

  it('does not throw for non-existing', () => {
    expect(() => deletePlan('nope')).not.toThrow()
  })
})
