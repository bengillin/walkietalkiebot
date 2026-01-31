import { getDb } from '../index.js'
import { touchConversation } from './conversations.js'

export interface MessageRow {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  position: number
  source: string
}

export interface MessageImageRow {
  id: string
  message_id: string
  data_url: string
  file_name: string
  description: string | null
  position: number
}

export interface CreateMessageInput {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  source?: string
  images?: Array<{
    id: string
    dataUrl: string
    fileName: string
    description?: string
  }>
}

export function getMessagesForConversation(conversationId: string): MessageRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, conversation_id, role, content, timestamp, position, source
    FROM messages
    WHERE conversation_id = ?
    ORDER BY position ASC
  `).all(conversationId) as MessageRow[]
}

export function getImagesForMessage(messageId: string): MessageImageRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT id, message_id, data_url, file_name, description, position
    FROM message_images
    WHERE message_id = ?
    ORDER BY position ASC
  `).all(messageId) as MessageImageRow[]
}

export function getImagesForMessages(messageIds: string[]): Map<string, MessageImageRow[]> {
  if (messageIds.length === 0) return new Map()

  const db = getDb()
  const placeholders = messageIds.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT id, message_id, data_url, file_name, description, position
    FROM message_images
    WHERE message_id IN (${placeholders})
    ORDER BY position ASC
  `).all(...messageIds) as MessageImageRow[]

  const imageMap = new Map<string, MessageImageRow[]>()
  for (const row of rows) {
    if (!imageMap.has(row.message_id)) {
      imageMap.set(row.message_id, [])
    }
    imageMap.get(row.message_id)!.push(row)
  }
  return imageMap
}

export function createMessage(input: CreateMessageInput): MessageRow {
  const db = getDb()
  const timestamp = input.timestamp || Date.now()
  const source = input.source || 'web'

  // Get next position
  const posRow = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 as next_pos
    FROM messages
    WHERE conversation_id = ?
  `).get(input.conversationId) as { next_pos: number }
  const position = posRow.next_pos

  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, timestamp, position, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.id, input.conversationId, input.role, input.content, timestamp, position, source)

  // Insert images if provided
  if (input.images && input.images.length > 0) {
    const insertImage = db.prepare(`
      INSERT INTO message_images (id, message_id, data_url, file_name, description, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (let i = 0; i < input.images.length; i++) {
      const img = input.images[i]
      insertImage.run(img.id, input.id, img.dataUrl, img.fileName, img.description || null, i)
    }
  }

  // Update conversation timestamp
  touchConversation(input.conversationId)

  return {
    id: input.id,
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content,
    timestamp,
    position,
    source,
  }
}

export function deleteMessage(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id)
  return result.changes > 0
}

export function countMessagesInConversation(conversationId: string): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId) as { count: number }
  return row.count
}
