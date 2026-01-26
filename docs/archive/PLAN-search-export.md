# Search and Export Feature Plan

## Overview
Add search functionality to filter conversations and export capabilities for conversation history.

## Search Feature

### UI Changes (ChatHistory.tsx)
- Add search input field at top of conversation list
- Filter conversations in real-time as user types
- Search across conversation titles and message content
- Show "no results" state when search has no matches
- Clear search button (X icon)

### Search Implementation
- Add `searchQuery` state to ChatHistory component
- Filter `conversations` array based on search query
- Case-insensitive matching on:
  - Conversation title
  - Message content within conversations
- Debounce search input (300ms) for performance

## Export Feature

### Export Formats
1. **Markdown** - Human-readable with formatting preserved
2. **JSON** - Full data export for backup/import
3. **Plain Text** - Simple text format

### UI Changes
- Add export button to conversation header or context menu
- Export modal/dropdown with format selection
- Option to export single conversation or all conversations

### Export Utility (src/utils/exportConversation.ts)
```typescript
interface ExportOptions {
  format: 'markdown' | 'json' | 'text';
  includeTimestamps: boolean;
  includeMetadata: boolean;
}

function exportToMarkdown(conversation: Conversation): string
function exportToJSON(conversation: Conversation): string
function exportToText(conversation: Conversation): string
function downloadExport(content: string, filename: string, mimeType: string): void
```

### Markdown Format Example
```markdown
# Conversation: [Title]
Date: [Created At]

## User
[Message content]

## Assistant
[Response content]

---
```

### JSON Format
- Full conversation object with all metadata
- Array format for multiple conversations

### Plain Text Format
```
Conversation: [Title]
Date: [Created At]

User: [Message]