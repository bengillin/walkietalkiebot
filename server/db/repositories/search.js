import { getDb } from "../index.js";
function searchMessages(query, limit = 50) {
  if (!query.trim()) return [];
  const db = getDb();
  const escapedQuery = query.replace(/['"]/g, "").trim();
  const searchTerms = escapedQuery.split(/\s+/).map((term) => `"${term}"*`).join(" ");
  const results = db.prepare(`
    SELECT
      m.id as message_id,
      m.conversation_id,
      c.title as conversation_title,
      m.role,
      m.content,
      m.timestamp,
      snippet(messages_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
    FROM messages_fts
    JOIN messages m ON messages_fts.rowid = m.rowid
    JOIN conversations c ON m.conversation_id = c.id
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(searchTerms, limit);
  return results;
}
function rebuildSearchIndex() {
  const db = getDb();
  db.exec(`
    INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
  `);
}
export {
  rebuildSearchIndex,
  searchMessages
};
