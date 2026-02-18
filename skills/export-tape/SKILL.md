---
name: export-tape
description: Export a Talkie conversation as markdown or JSON. Use when the user wants to export or share a conversation.
allowed-tools: list_conversations, export_conversation
---

# Export Conversation

Export a saved Talkie conversation as formatted markdown or structured JSON.

## Steps

1. If the user doesn't specify a conversation, use `list_conversations` to show recent tapes
2. Use `export_conversation` with the chosen conversation ID
3. Default format is "markdown". Use "json" if the user wants structured data.
4. Present the exported content to the user

## Formats

- **markdown**: Human-readable with headers, role labels, and tool activity summary
- **json**: Full structured data including messages, images, and activities

## Notes

- Works offline (no Talkie server needed)
- Exported markdown includes tool activity history at the end
