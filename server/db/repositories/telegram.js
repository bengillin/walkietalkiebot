import { getDb } from "../index.js";
function getTelegramState(userId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT user_id, current_conversation_id, updated_at
    FROM telegram_state
    WHERE user_id = ?
  `).get(userId);
  return row || null;
}
function setTelegramConversation(userId, conversationId) {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO telegram_state (user_id, current_conversation_id, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_conversation_id = excluded.current_conversation_id,
      updated_at = excluded.updated_at
  `).run(userId, conversationId, now);
}
function clearTelegramState(userId) {
  const db = getDb();
  db.prepare("DELETE FROM telegram_state WHERE user_id = ?").run(userId);
}
export {
  clearTelegramState,
  getTelegramState,
  setTelegramConversation
};
