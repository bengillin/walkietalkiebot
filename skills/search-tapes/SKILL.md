---
name: search-tapes
description: Search across all Walkie Talkie Bot conversations for specific content. Use when the user wants to find something they discussed before.
allowed-tools: search_conversations, get_conversation
---

# Search Tapes

Full-text search across all saved conversations in Walkie Talkie Bot.

## Steps

1. Use `search_conversations` with the user's query
2. Present results with conversation titles, matching snippets, and timestamps
3. If the user wants to see a full conversation, use `get_conversation` with its ID

## Notes

- Uses FTS5 for fast, ranked full-text search
- Works offline (no WTB server needed)
- Returns highlighted snippets showing where the match was found
