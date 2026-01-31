import { getDb } from '../index.js'

export interface SearchResult {
  message_id: string
  conversation_id: string
  conversation_title: string
  role: string
  content: string
  timestamp: number
  snippet: string
}

export function searchMessages(query: string, limit = 50): SearchResult[] {
  if (!query.trim()) return []

  const db = getDb()

  // Use FTS5 match syntax for the search
  // Escape special FTS characters and add * for prefix matching
  const escapedQuery = query.replace(/['"]/g, '').trim()
  const searchTerms = escapedQuery.split(/\s+/).map(term => `"${term}"*`).join(' ')

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
  `).all(searchTerms, limit) as SearchResult[]

  return results
}

export function rebuildSearchIndex(): void {
  const db = getDb()
  db.exec(`
    INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
  `)
}
