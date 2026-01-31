import { getDb } from '../index.js'

export interface TelegramStateRow {
  user_id: number
  current_conversation_id: string | null
  updated_at: number
}

export function getTelegramState(userId: number): TelegramStateRow | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT user_id, current_conversation_id, updated_at
    FROM telegram_state
    WHERE user_id = ?
  `).get(userId) as TelegramStateRow | undefined
  return row || null
}

export function setTelegramConversation(userId: number, conversationId: string | null): void {
  const db = getDb()
  const now = Date.now()

  db.prepare(`
    INSERT INTO telegram_state (user_id, current_conversation_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_conversation_id = excluded.current_conversation_id,
      updated_at = excluded.updated_at
  `).run(userId, conversationId, now)
}

export function clearTelegramState(userId: number): void {
  const db = getDb()
  db.prepare('DELETE FROM telegram_state WHERE user_id = ?').run(userId)
}
