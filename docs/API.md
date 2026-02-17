# Talkie API Reference

Talkie runs a Hono-based HTTPS server at `https://localhost:5173` by default. All endpoints are prefixed with `/api`.

CORS is enabled on all routes.

---

## Status

### `GET /api/status`

Check if the server is running and get current state.

**Response**

```json
{
  "running": true,
  "avatarState": "idle",
  "dbStatus": "connected"
}
```

`avatarState` is one of: `idle`, `listening`, `thinking`, `speaking`.
`dbStatus` is either `"connected"` or `"unavailable"`.

---

## Conversations

### `GET /api/conversations`

List conversations with pagination.

**Query Parameters**

| Param    | Default | Description              |
|----------|---------|--------------------------|
| `limit`  | `50`    | Maximum results to return |
| `offset` | `0`     | Number of results to skip |

**Response**

```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "My conversation",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z",
      "projectId": null,
      "parentId": null
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### `POST /api/conversations`

Create a new conversation.

**Request Body**

```json
{
  "id": "optional-uuid",
  "title": "optional title"
}
```

Both fields are optional. If `id` is omitted a UUID is generated. If `title` is omitted it defaults to `"New conversation"`.

**Response** (201)

```json
{
  "id": "uuid",
  "title": "New conversation",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

### `GET /api/conversations/:id`

Get a single conversation with all its messages, images, and activities.

**Response**

```json
{
  "id": "uuid",
  "title": "My conversation",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "projectId": null,
  "parentId": null,
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "Hello",
      "timestamp": 1704067200000,
      "source": "web",
      "images": [
        {
          "id": "uuid",
          "dataUrl": "data:image/png;base64,...",
          "fileName": "screenshot.png",
          "description": "A screenshot of..."
        }
      ]
    }
  ],
  "activities": [
    {
      "id": "uuid",
      "tool": "Read",
      "input": "/path/to/file",
      "status": "complete",
      "timestamp": 1704067200000,
      "duration": 150,
      "error": null
    }
  ]
}
```

**Error** (404)

```json
{ "error": "Conversation not found" }
```

### `PATCH /api/conversations/:id`

Update conversation metadata.

**Request Body**

```json
{
  "title": "New title",
  "projectId": "optional-project-id",
  "parentId": "optional-parent-id"
}
```

**Response**

```json
{
  "id": "uuid",
  "title": "New title",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

**Error** (404)

```json
{ "error": "Conversation not found" }
```

### `DELETE /api/conversations/:id`

Delete a conversation and all related data (messages, images, activities).

**Response**

```json
{ "success": true }
```

**Error** (404)

```json
{ "error": "Conversation not found" }
```

---

## Messages

### `POST /api/conversations/:id/messages`

Add a message to a conversation.

**Request Body**

```json
{
  "id": "optional-uuid",
  "role": "user",
  "content": "Hello world",
  "timestamp": 1704067200000,
  "source": "web",
  "images": [
    {
      "id": "uuid",
      "dataUrl": "data:image/png;base64,...",
      "fileName": "photo.png",
      "description": "A photo of..."
    }
  ],
  "activities": [
    {
      "id": "uuid",
      "tool": "Read",
      "input": "/path/to/file",
      "status": "complete",
      "timestamp": 1704067200000,
      "duration": 150,
      "error": null
    }
  ]
}
```

`id` is optional (UUID generated if omitted). `source` defaults to `"web"`. `images` and `activities` are optional arrays.

If this is the first user message in the conversation (position 0), the conversation title is automatically set to the first 40 characters of the message content.

**Response** (201)

```json
{
  "id": "uuid",
  "role": "user",
  "content": "Hello world",
  "timestamp": 1704067200000,
  "source": "web"
}
```

**Error** (404)

```json
{ "error": "Conversation not found" }
```

---

## Search

### `GET /api/search`

Full-text search across all messages using SQLite FTS5.

**Query Parameters**

| Param   | Default | Description              |
|---------|---------|--------------------------|
| `q`     | `""`    | Search term (required)   |
| `limit` | `50`    | Maximum results to return |

Returns an empty array if `q` is blank.

**Response**

```json
{
  "query": "search term",
  "results": [
    {
      "messageId": "uuid",
      "conversationId": "uuid",
      "conversationTitle": "My conversation",
      "role": "assistant",
      "content": "Full message content",
      "timestamp": 1704067200000,
      "snippet": "...highlighted match..."
    }
  ]
}
```

---

## Migration

### `POST /api/migrate`

Migrate conversations from localStorage format to the SQLite database. Skips conversations that already exist in the database.

**Request Body**

```json
{
  "conversations": [
    {
      "id": "uuid",
      "title": "My conversation",
      "messages": [
        {
          "id": "uuid",
          "role": "user",
          "content": "Hello",
          "timestamp": 1704067200000,
          "images": []
        }
      ],
      "activities": [
        {
          "id": "uuid",
          "tool": "Read",
          "input": "/path",
          "status": "complete",
          "timestamp": 1704067200000,
          "duration": 100
        }
      ],
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000
    }
  ]
}
```

**Response**

```json
{
  "success": true,
  "imported": 5,
  "skipped": 2,
  "total": 7
}
```

**Error** (400)

```json
{ "error": "Invalid conversations data" }
```

---

## State Sync

### `GET /api/transcript`

Get the latest voice transcript and recent messages from server state.

**Response**

```json
{
  "transcript": "What the user just said",
  "lastUserMessage": "Previous user message",
  "lastAssistantMessage": "Previous assistant response"
}
```

### `GET /api/history`

Get the conversation history held in server memory.

**Response**

```json
{
  "messages": [
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there" }
  ]
}
```

### `POST /api/state`

Sync browser state to the server. Accepts any combination of state fields.

**Request Body**

```json
{
  "avatarState": "listening",
  "transcript": "current transcript text",
  "lastUserMessage": "...",
  "lastAssistantMessage": "...",
  "messages": [],
  "claudeSessionId": "session-id"
}
```

All fields are optional; only provided fields are updated.

**Response**

```json
{ "success": true }
```

---

## IPC (Inter-Process Communication)

These endpoints enable bidirectional communication between the Talkie web UI and an external Claude Code session.

### `GET /api/pending`

Check if there is a pending message from the frontend waiting for a response.

**Response**

```json
{
  "pending": {
    "content": "User's message",
    "timestamp": 1704067200000
  },
  "sessionConnected": true
}
```

`pending` is `null` when no message is waiting.

### `POST /api/respond`

Send a response to the frontend. Resolves any waiting `/api/send` callers.

**Request Body**

```json
{ "content": "Response text" }
```

**Response**

```json
{ "success": true }
```

**Error** (400)

```json
{ "error": "Content required" }
```

### `POST /api/send`

Send a message from the frontend and wait for an IPC response. Returns a Server-Sent Events (SSE) stream.

**Request Body**

```json
{ "message": "User's question" }
```

**SSE Events**

The stream emits `data:` lines containing JSON:

- `{ "text": "response content" }` -- The response text from the external process.
- `{ "done": true }` -- The response is complete.
- `{ "error": "Timeout waiting for response" }` -- No response arrived within 2 minutes.

**Error** (400)

```json
{ "error": "Message required" }
```

---

## Session

### `GET /api/session`

Get the currently connected Claude Code session ID.

**Response**

```json
{ "sessionId": "abc123" }
```

`sessionId` is `null` when no session is connected.

### `POST /api/session`

Set the Claude Code session ID.

**Request Body**

```json
{ "sessionId": "abc123" }
```

**Response**

```json
{ "success": true, "sessionId": "abc123" }
```

### `DELETE /api/session`

Clear the connected session ID.

**Response**

```json
{ "success": true }
```

---

## Claude Code

### `POST /api/claude-code`

Spawn the `claude` CLI in prompt mode and stream structured output back to the client. Uses `--output-format stream-json`, `--verbose`, `--permission-mode bypassPermissions`, and `--no-session-persistence`.

The last 10 messages from `history` (or server state) are prepended as context. A voice-mode system instruction is injected requesting short, markdown-free responses.

**Request Body**

```json
{
  "message": "What files are in this project?",
  "history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

`history` is optional. If omitted, the server's in-memory message state is used.

**SSE Events**

The stream emits `data:` lines containing JSON objects. Event types:

| Event | Shape | Description |
|-------|-------|-------------|
| Text chunk | `{ "text": "..." }` | A piece of Claude's response text. |
| Tool start | `{ "activity": { "type": "tool_start", "tool": "Read", "id": "toolu_...", "input": "/path" } }` | A tool execution has begun. `input` is a short human-readable summary (file path, command, or pattern). |
| Tool input | `{ "activity": { "type": "tool_input", "id": "toolu_...", "input": "/path" } }` | Full tool input details, sent after input JSON is fully streamed. |
| Tool end | `{ "activity": { "type": "tool_end", "tool": "Read", "id": "toolu_...", "status": "complete", "output": "..." } }` | A tool execution has finished. `output` is truncated to 200 characters. `status` is `"complete"` or `"error"`. |
| All complete | `{ "activity": { "type": "all_complete", "status": "complete" } }` | All tool executions are done. |
| Error | `{ "error": "..." }` | An error from stderr. |
| Done | `{ "done": true, "code": 0 }` | The `claude` process has exited. `code` is the exit code. |

**Error** (400)

```json
{ "error": "Message required" }
```

---

## Media

### `POST /api/analyze-image`

Analyze an image using the Anthropic Claude vision API (claude-sonnet-4-20250514). The system prompt is tuned for UI mockups, screenshots, and hand-drawn sketches.

**Request Body**

```json
{
  "dataUrl": "data:image/png;base64,...",
  "fileName": "screenshot.png",
  "type": "image/png",
  "apiKey": "sk-ant-..."
}
```

`fileName`, `type`, and `apiKey` are optional. `type` defaults to `"image/png"`. If `apiKey` is not provided, the `ANTHROPIC_API_KEY` environment variable is used.

**Response**

```json
{
  "description": "The image shows a mobile app wireframe with...",
  "fileName": "screenshot.png"
}
```

**Error** (400)

```json
{ "error": "Image data required" }
```

```json
{ "error": "API key required for image analysis - please add one in Settings even when using Claude Code mode" }
```

### `POST /api/open-url`

Open a URL in the default browser using the macOS `open` command. Only `http://` and `https://` URLs are allowed.

**Request Body**

```json
{ "url": "https://example.com" }
```

**Response**

```json
{ "success": true }
```

**Error** (400)

```json
{ "error": "URL required" }
```

```json
{ "error": "Only http/https URLs allowed" }
```
