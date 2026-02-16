import { getDb } from '../index.js'

export interface Plan {
  id: string
  title: string
  content: string
  status: 'draft' | 'approved' | 'in_progress' | 'completed' | 'archived'
  conversation_id: string | null
  created_at: number
  updated_at: number
}

export function listPlans(limit = 50, offset = 0): Plan[] {
  const db = getDb()
  return db.prepare(
    'SELECT * FROM plans ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as Plan[]
}

export function getPlan(id: string): Plan | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(id) as Plan | undefined
}

export function createPlan(plan: {
  id: string
  title: string
  content: string
  status?: string
  conversationId?: string | null
}): Plan {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    'INSERT INTO plans (id, title, content, status, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    plan.id,
    plan.title,
    plan.content,
    plan.status || 'draft',
    plan.conversationId || null,
    now,
    now
  )
  return getPlan(plan.id)!
}

export function updatePlan(id: string, updates: {
  title?: string
  content?: string
  status?: string
}): void {
  const db = getDb()
  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [Date.now()]

  if (updates.title !== undefined) {
    sets.push('title = ?')
    values.push(updates.title)
  }
  if (updates.content !== undefined) {
    sets.push('content = ?')
    values.push(updates.content)
  }
  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }

  values.push(id)
  db.prepare(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`).run(...values)
}

export function deletePlan(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM plans WHERE id = ?').run(id)
}
