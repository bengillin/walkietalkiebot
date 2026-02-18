---
name: search-tapes
description: Search across all Talkie conversations for specific content. Use when the user wants to find something they discussed before.
allowed-tools: search_conversations, get_conversation
---

# Search Talkie Tapes

Full-text search across all saved conversations in Talkie.

## Steps

1. Use `search_conversations` with the user's query
2. Present results with conversation titles, matching snippets, and timestamps
3. If the user wants to see a full conversation, use `get_conversation` with its ID

## Notes

- Uses FTS5 for fast, ranked full-text search
- Works offline (no Talkie server needed)
- Returns highlighted snippets showing where the match was found
