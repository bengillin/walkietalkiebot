import { getDb } from '../index.js'

export interface ConversationRow {
  id: string
  title: string
  created_at: number
  updated_at: number
  project_id: string | null
  parent_id: string | null
  mode: string
}

export interface CreateConversationInput {
  id: string
  title?: string
  projectId?: string
  parentId?: string
  mode?: string
}

export interface UpdateConversationInput {
  title?: string
  projectId?: string
  parentId?: string
}

export function listConversations(limit = 50, offset = 0): ConversationRow[] {
  const db = getDb()
  return db
    .prepare(
      `
    SELECT id, title, created_at, updated_at, project_id, parent_id, mode
    FROM conversations
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(limit, offset) as ConversationRow[]
}

export function getConversation(id: string): ConversationRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `
    SELECT id, title, created_at, updated_at, project_id, parent_id, mode
    FROM conversations
    WHERE id = ?
  `,
    )
    .get(id) as ConversationRow | undefined
  return row || null
}

/** Wrap fn in a database transaction (all-or-nothing; nests as a savepoint). */
export function transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return getDb().transaction(fn)
}

export function createConversation(input: CreateConversationInput): ConversationRow {
  const db = getDb()
  const now = Date.now()
  const title = input.title || 'New conversation'

  const mode = input.mode || 'voice'
  db.prepare(
    `
    INSERT INTO conversations (id, title, created_at, updated_at, project_id, parent_id, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(input.id, title, now, now, input.projectId || null, input.parentId || null, mode)

  return {
    id: input.id,
    title,
    created_at: now,
    updated_at: now,
    project_id: input.projectId || null,
    parent_id: input.parentId || null,
    mode,
  }
}

export function updateConversation(
  id: string,
  input: UpdateConversationInput,
): ConversationRow | null {
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

/**
 * Delete a conversation and leave a tombstone, so the id can't be re-created
 * by a client that hasn't heard about the delete. The tombstone is written even
 * when the row is missing: a create may still be in flight.
 */
export function deleteConversation(id: string): boolean {
  const db = getDb()
  return db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO deleted_conversations (id, deleted_at) VALUES (?, ?)').run(
      id,
      Date.now(),
    )
    return db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0
  })()
}

/** Whether a conversation with this id was deleted (and must not come back). */
export function isDeleted(id: string): boolean {
  return getDb().prepare('SELECT 1 FROM deleted_conversations WHERE id = ?').get(id) !== undefined
}

export function touchConversation(id: string): void {
  const db = getDb()
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function updateLinerNotes(id: string, linerNotes: string | null): void {
  const db = getDb()
  db.prepare('UPDATE conversations SET liner_notes = ?, updated_at = ? WHERE id = ?').run(
    linerNotes,
    Date.now(),
    id,
  )
}

export function getLinerNotes(id: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT liner_notes FROM conversations WHERE id = ?').get(id) as
    { liner_notes: string | null } | undefined
  return row?.liner_notes || null
}

export function updateMode(id: string, mode: string): void {
  const db = getDb()
  db.prepare('UPDATE conversations SET mode = ?, updated_at = ? WHERE id = ?').run(
    mode,
    Date.now(),
    id,
  )
}

export function countConversations(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number }
  return row.count
}
