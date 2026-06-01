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

export interface PlanWithConversation extends Plan {
  conversation_title: string | null
}

export function listPlans(limit = 50, offset = 0, conversationId?: string): PlanWithConversation[] {
  const db = getDb()
  const query = `SELECT p.*, c.title as conversation_title FROM plans p LEFT JOIN conversations c ON p.conversation_id = c.id${conversationId ? ' WHERE p.conversation_id = ?' : ''} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`
  if (conversationId) {
    return db.prepare(query).all(conversationId, limit, offset) as PlanWithConversation[]
  }
  return db.prepare(query).all(limit, offset) as PlanWithConversation[]
}

export function countPlansByConversation(): Record<string, number> {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT conversation_id, COUNT(*) as count FROM plans WHERE conversation_id IS NOT NULL AND status != 'archived' GROUP BY conversation_id",
    )
    .all() as Array<{ conversation_id: string; count: number }>
  const result: Record<string, number> = {}
  for (const row of rows) {
    result[row.conversation_id] = row.count
  }
  return result
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
    'INSERT INTO plans (id, title, content, status, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    plan.id,
    plan.title,
    plan.content,
    plan.status || 'draft',
    plan.conversationId || null,
    now,
    now,
  )
  return getPlan(plan.id)!
}

export function updatePlan(
  id: string,
  updates: {
    title?: string
    content?: string
    status?: string
  },
): void {
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
