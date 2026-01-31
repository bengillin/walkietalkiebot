import { getDb } from "../index.js";
function getActivitiesForConversation(conversationId, limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT id, conversation_id, message_id, tool, input, status, timestamp, duration, error
    FROM activities
    WHERE conversation_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(conversationId, limit);
}
function getActivitiesForMessage(messageId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, conversation_id, message_id, tool, input, status, timestamp, duration, error
    FROM activities
    WHERE message_id = ?
    ORDER BY timestamp ASC
  `).all(messageId);
}
function createActivity(input) {
  const db = getDb();
  const timestamp = input.timestamp || Date.now();
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
  );
  return {
    id: input.id,
    conversation_id: input.conversationId,
    message_id: input.messageId || null,
    tool: input.tool,
    input: input.input || null,
    status: input.status,
    timestamp,
    duration: input.duration || null,
    error: input.error || null
  };
}
function createActivitiesBatch(activities) {
  if (activities.length === 0) return;
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO activities (id, conversation_id, message_id, tool, input, status, timestamp, duration, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items) => {
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
      );
    }
  });
  insertMany(activities);
}
function deleteActivitiesForConversation(conversationId) {
  const db = getDb();
  const result = db.prepare("DELETE FROM activities WHERE conversation_id = ?").run(conversationId);
  return result.changes;
}
export {
  createActivitiesBatch,
  createActivity,
  deleteActivitiesForConversation,
  getActivitiesForConversation,
  getActivitiesForMessage
};
