import { getDb } from '../index.js'

export interface ActivityRow {
  id: string
  conversation_id: string
  message_id: string | null
  tool: string
  input: string | null
  status: 'complete' | 'error'
  timestamp: number
  duration: number | null
  error: string | null
}

export interface CreateActivityInput {
  id: string
  conversationId: string
  messageId?: string
  tool: string
  input?: string
  status: 'complete' | 'error'
  timestamp?: number
  duration?: number
  error?: string
}

export function getActivitiesForConversation(conversationId: string, limit = 100): ActivityRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, conversation_id, message_id, tool, input, status, timestamp, duration, error
    FROM activities
    WHERE conversation_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(conversationId, limit) as ActivityRow[]
}

export function getActivitiesForMessage(messageId: string): ActivityRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, conversation_id, message_id, tool, input, status, timestamp, duration, error
    FROM activities
    WHERE message_id = ?
    ORDER BY timestamp ASC
  `).all(messageId) as ActivityRow[]
}

export function createActivity(input: CreateActivityInput): ActivityRow {
  const db = getDb()
  const timestamp = input.timestamp || Date.now()

  db.prepare(`
    INSERT INTO activities (id, conversation_id, message_id, tool, input, status, timestamp, duration, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    input.conversationId,
    input.messageId || null,
    input.tool,
    input.input || null,
    input.status,
    timestamp,
    input.duration || null,
    input.error || null
  )

  return {
    id: input.id,
    conversation_id: input.conversationId,
    message_id: input.messageId || null,
    tool: input.tool,
    input: input.input || null,
    status: input.status,
    timestamp,
    duration: input.duration || null,
    error: input.error || null,
  }
}

export function createActivitiesBatch(activities: CreateActivityInput[]): void {
  if (activities.length === 0) return

  const db = getDb()
  const insert = db.prepare(`
    INSERT INTO activities (id, conversation_id, message_id, tool, input, status, timestamp, duration, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((items: CreateActivityInput[]) => {
    for (const input of items) {
      insert.run(
        input.id,
        input.conversationId,
        input.messageId || null,
        input.tool,
        input.input || null,
        input.status,
        input.timestamp || Date.now(),
        input.duration || null,
        input.error || null
      )
    }
  })

  insertMany(activities)
}

export function deleteActivitiesForConversation(conversationId: string): number {
  const db = getDb()
  const result = db.prepare('DELETE FROM activities WHERE conversation_id = ?').run(conversationId)
  return result.changes
}
