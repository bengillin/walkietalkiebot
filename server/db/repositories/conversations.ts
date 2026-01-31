import { getDb } from '../index.js'

export interface ConversationRow {
  id: string
  title: string
  created_at: number
  updated_at: number
  project_id: string | null
  parent_id: string | null
}

export interface CreateConversationInput {
  id: string
  title?: string
  projectId?: string
  parentId?: string
}

export interface UpdateConversationInput {
  title?: string
  projectId?: string
  parentId?: string
}

export function listConversations(limit = 50, offset = 0): ConversationRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, title, created_at, updated_at, project_id, parent_id
    FROM conversations
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as ConversationRow[]
}

export function getConversation(id: string): ConversationRow | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT id, title, created_at, updated_at, project_id, parent_id
    FROM conversations
    WHERE id = ?
  `).get(id) as ConversationRow | undefined
  return row || null
}

export function createConversation(input: CreateConversationInput): ConversationRow {
  const db = getDb()
  const now = Date.now()
  const title = input.title || 'New conversation'

  db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at, project_id, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.id, title, now, now, input.projectId || null, input.parentId || null)

  return {
    id: input.id,
    title,
    created_at: now,
    updated_at: now,
    project_id: input.projectId || null,
    parent_id: input.parentId || null,
  }
}

export function updateConversation(id: string, input: UpdateConversationInput): ConversationRow | null {
  const db = getDb()
  const existing = getConversation(id)
  if (!existing) return null

  const now = Date.now()
  const updates: string[] = ['updated_at = ?']
  const values: (string | number | null)[] = [now]

  if (input.title !== undefined) {
    updates.push('title = ?')
    values.push(input.title)
  }
  if (input.projectId !== undefined) {
    updates.push('project_id = ?')
    values.push(input.projectId)
  }
  if (input.parentId !== undefined) {
    updates.push('parent_id = ?')
    values.push(input.parentId)
  }

  values.push(id)
  db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  return getConversation(id)
}

export function deleteConversation(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  return result.changes > 0
}

export function touchConversation(id: string): void {
  const db = getDb()
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function countConversations(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
  return row.count
}
