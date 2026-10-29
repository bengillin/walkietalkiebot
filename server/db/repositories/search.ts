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

// FTS5 wraps matches in these, then we HTML-escape the snippet and swap them for
// <mark>. Escaping first means message content can never inject markup into the
// search overlay; a stray control character in a message can at most add a <mark>.
const MATCH_START = '\u0001'
const MATCH_END = '\u0002'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Escape a raw FTS5 snippet and turn its match markers into `<mark>` tags. */
export function renderSnippet(raw: string): string {
  return escapeHtml(raw).split(MATCH_START).join('<mark>').split(MATCH_END).join('</mark>')
}

export function searchMessages(query: string, limit = 50): SearchResult[] {
  if (!query.trim()) return []

  const db = getDb()

  // Quote every term as an FTS5 string literal (doubling embedded quotes) with a
  // prefix *, so operators like OR / NEAR / col: are searched as plain words and
  // apostrophes survive ("it's" used to become "its" and match nothing).
  const searchTerms = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ')

  const results = db
    .prepare(
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
  `,
    )
    .all(searchTerms, limit) as SearchResult[]

  return results.map((r) => ({ ...r, snippet: renderSnippet(r.snippet) }))
}

export function rebuildSearchIndex(): void {
  const db = getDb()
  db.exec(`
    INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
  `)
}
