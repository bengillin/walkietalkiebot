---
name: save-conversation
description: Save the current conversation to Talkie as a cassette tape. Use when the user wants to archive or save a conversation.
allowed-tools: create_conversation, add_message, list_conversations
---

# Save Conversation to Talkie

Save the current Claude Code conversation as a cassette tape in Talkie's database.

## Steps

1. Ask the user for a title, or generate one from the conversation topic
2. Use `create_conversation` to create a new tape with that title
3. For each meaningful exchange in the conversation, use `add_message` to add it:
   - Set `role` to "user" or "assistant" as appropriate
   - Set `source` to "claude-code"
4. Report the conversation ID and title back to the user

## Notes

- This tool works offline (no Talkie server needed)
- Messages are stored in `~/.talkie/talkie.db`
- The saved tape will appear in Talkie's tape collection when the web UI is running
