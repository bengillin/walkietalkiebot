import { getDb } from "../index.js";
const MATCH_START = "";
const MATCH_END = "";
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function renderSnippet(raw) {
  return escapeHtml(raw).split(MATCH_START).join("<mark>").split(MATCH_END).join("</mark>");
}
function searchMessages(query, limit = 50) {
  if (!query.trim()) return [];
  const db = getDb();
  const searchTerms = query.trim().split(/\s+/).map((term) => `"${term.replace(/"/g, '""')}"*`).join(" ");
  const results = db.prepare(
    `
    SELECT
      m.id as message_id,
      m.conversation_id,
      c.title as conversation_title,
      m.role,
      m.content,
      m.timestamp,
      snippet(messages_fts, 0, char(1), char(2), '...', 32) as snippet
    FROM messages_fts
    JOIN messages m ON messages_fts.rowid = m.rowid
    JOIN conversations c ON m.conversation_id = c.id
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `
  ).all(searchTerms, limit);
  return results.map((r) => ({ ...r, snippet: renderSnippet(r.snippet) }));
}
function rebuildSearchIndex() {
  const db = getDb();
  db.exec(`
    INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
  `);
}
export {
  rebuildSearchIndex,
  renderSnippet,
  searchMessages
};
