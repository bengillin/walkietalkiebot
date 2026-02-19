---
name: save-conversation
description: Save the current conversation to Walkie Talkie Bot as a cassette tape. Use when the user wants to archive or save a conversation.
allowed-tools: create_conversation, add_message, list_conversations
---

# Save Conversation

Save the current Claude Code conversation as a cassette tape in Walkie Talkie Bot's database.

## Steps

1. Ask the user for a title, or generate one from the conversation topic
2. Use `create_conversation` to create a new tape with that title
3. For each meaningful exchange in the conversation, use `add_message` to add it:
   - Set `role` to "user" or "assistant" as appropriate
   - Set `source` to "claude-code"
4. Report the conversation ID and title back to the user

## Notes

- This tool works offline (no WTB server needed)
- Messages are stored in `~/.wtb/wtb.db`
- The saved tape will appear in the tape collection when the web UI is running
