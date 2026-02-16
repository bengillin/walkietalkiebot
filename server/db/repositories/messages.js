import { getDb } from "../index.js";
import { touchConversation } from "./conversations.js";
function getMessagesForConversation(conversationId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, conversation_id, role, content, timestamp, position, source
    FROM messages
    WHERE conversation_id = ?
    ORDER BY position ASC
  `).all(conversationId);
}
function getImagesForMessage(messageId) {
  const db = getDb();
  return db.prepare(`
    SELECT id, message_id, data_url, file_name, description, position
    FROM message_images
    WHERE message_id = ?
    ORDER BY position ASC
  `).all(messageId);
}
function getImagesForMessages(messageIds) {
  if (messageIds.length === 0) return /* @__PURE__ */ new Map();
  const db = getDb();
  const placeholders = messageIds.map(() => "?").join(", ");
  const rows = db.prepare(`
    SELECT id, message_id, data_url, file_name, description, position
    FROM message_images
    WHERE message_id IN (${placeholders})
    ORDER BY position ASC
  `).all(...messageIds);
  const imageMap = /* @__PURE__ */ new Map();
  for (const row of rows) {
    if (!imageMap.has(row.message_id)) {
      imageMap.set(row.message_id, []);
    }
    imageMap.get(row.message_id).push(row);
  }
  return imageMap;
}
function createMessage(input) {
  const db = getDb();
  const timestamp = input.timestamp || Date.now();
  const source = input.source || "web";
  const posRow = db.prepare(`
    SELECT COALESCE(MAX(position), -1) + 1 as next_pos
    FROM messages
    WHERE conversation_id = ?
  `).get(input.conversationId);
  const position = posRow.next_pos;
  db.prepare(`
    INSERT INTO messages (id, conversation_id, role, content, timestamp, position, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(input.id, input.conversationId, input.role, input.content, timestamp, position, source);
  if (input.images && input.images.length > 0) {
    const insertImage = db.prepare(`
      INSERT INTO message_images (id, message_id, data_url, file_name, description, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (let i = 0; i < input.images.length; i++) {
      const img = input.images[i];
      insertImage.run(img.id, input.id, img.dataUrl, img.fileName, img.description || null, i);
    }
  }
  touchConversation(input.conversationId);
  return {
    id: input.id,
    conversation_id: input.conversationId,
    role: input.role,
    content: input.content,
    timestamp,
    position,
    source
  };
}
function updateImageDescription(imageId, description) {
  const db = getDb();
  const result = db.prepare("UPDATE message_images SET description = ? WHERE id = ?").run(description, imageId);
  return result.changes > 0;
}
function deleteMessage(id) {
  const db = getDb();
  const result = db.prepare("DELETE FROM messages WHERE id = ?").run(id);
  return result.changes > 0;
}
function countMessagesInConversation(conversationId) {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?").get(conversationId);
  return row.count;
}
export {
  countMessagesInConversation,
  createMessage,
  deleteMessage,
  getImagesForMessage,
  getImagesForMessages,
  getMessagesForConversation,
  updateImageDescription
};
