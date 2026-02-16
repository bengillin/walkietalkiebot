# TalkBoy Architecture

## System Overview

TalkBoy is a voice-first interface for Claude Code. It runs as an HTTPS server (Hono framework) that serves a React SPA and provides API endpoints. The system has three deployment targets: web UI (React), Telegram bot (grammy), and MCP server (stdio).

## Data Flows

### Web UI -> Claude Code

1. User speaks or types message in browser
2. Frontend calls `POST /api/claude-code` with message + recent history
3. Server spawns `claude -p <prompt> --output-format stream-json --verbose --permission-mode bypassPermissions --no-session-persistence`
4. Server parses newline-delimited JSON from claude stdout
5. Events streamed back as SSE: text chunks, tool_start, tool_input, tool_end, all_complete
6. Frontend renders streaming text and activity feed
7. On completion, message + activities saved to SQLite via `POST /api/conversations/:id/messages`

### IPC Mode (MCP <-> TalkBoy)

1. User speaks in TalkBoy web UI
2. Frontend calls `POST /api/send` with message, opens SSE stream
3. Server stores message in `state.pendingMessage`
4. Claude Code (via MCP tool `get_pending_message`) polls `GET /api/pending`
5. Claude Code processes message, calls MCP tool `respond_to_talkboy`
6. Server receives `POST /api/respond`, fires callback
7. Response streams back to frontend via the open SSE connection

### Telegram -> Claude Code

1. User sends text/photo message in Telegram
2. grammy bot handler calls `POST /api/claude-code` via undici (with self-signed cert bypass)
3. Bot reads SSE stream, accumulates response text and activity events
4. Bot stores user message, assistant message, and activities to SQLite
5. Bot sends response in Telegram (split if >4096 chars)

## Server Architecture

The server (`server/index.ts`) initializes:

1. SQLite database (`~/.talkboy/talkboy.db`) with WAL mode
2. Telegram bot (if token available, non-blocking)
3. Hono app with API routes mounted at `/api`
4. Static file serving from `dist/`
5. HTTPS server with self-signed or Tailscale certificates

### In-Memory State (`server/state.ts`)

Transient state for IPC and real-time data:

```
TalkboyState {
  avatarState: string           # idle, listening, thinking, speaking
  transcript: string            # Current voice transcript
  lastUserMessage: string
  lastAssistantMessage: string
  messages: Array               # Recent messages for context
  claudeSessionId: string|null  # Connected Claude Code session
  pendingMessage: object|null   # Waiting for IPC response
  responseCallbacks: Array      # SSE response handlers
}
```

## Database

SQLite at `~/.talkboy/talkboy.db`, WAL mode, foreign keys enabled.

### Schema (Version 1)

**conversations** -- id, title, created_at, updated_at, project_id, parent_id

**messages** -- id, conversation_id (FK), role (user|assistant), content, timestamp, position, source

**message_images** -- id, message_id (FK), data_url, file_name, description, position

**activities** -- id, conversation_id (FK), message_id (FK), tool, input, status (complete|error), timestamp, duration, error

**telegram_state** -- user_id (PK), current_conversation_id (FK), updated_at

**messages_fts** -- FTS5 virtual table on messages.content with auto-sync triggers (INSERT, UPDATE, DELETE)

### Indexes

- `idx_conversations_updated` -- conversations(updated_at DESC)
- `idx_messages_conversation` -- messages(conversation_id, position)
- `idx_activities_conversation` -- activities(conversation_id, timestamp DESC)

### Migration System

Schema versioned via `schema_version` table. Migrations run sequentially on startup. Current: V1.

## Frontend Architecture

React 18 SPA built with Vite. Entry: `src/App.tsx`.

### State Management

Zustand store (`src/lib/store.ts`) manages:

- Conversations (CRUD, current selection)
- Messages (per-conversation)
- Activities (live in-progress + stored completed)
- File attachments and image analyses
- Voice settings (TTS, continuous listening, wake word, trigger word, delay)
- Server sync functions

localStorage serves as a cache. SQLite is the source of truth when the server is available. Auto-migration moves localStorage data to server on first connection.

### Voice Pipeline

1. `useSpeechRecognition` -- Web Speech API wrapper with interim results, trigger word detection, auto-restart
2. `useSpeechSynthesis` -- TTS with streaming mode (accumulates chunks) and single-utterance mode
3. `useWakeWord` -- Passive listener for wake phrases ("hey talkboy")

### Component Tree

```
App
+-- Onboarding (first-run wizard)
+-- Header (avatar, logo, action buttons, mobile menu)
+-- ChatTimeline (messages, streaming text, activity feed)
+-- FileDropZone (image drag-and-drop with analysis status)
+-- TapeDeck (input bar + mini cassette + tape collection)
+-- ImageLightbox (full-screen image viewer)
+-- Settings (drawer with all configuration)
+-- MediaLibrary (cross-conversation image browser)
+-- FAB (floating record button for mobile, draggable/resizable)
```

## MCP Server

12 tools exposed via stdio transport (`mcp-server/index.js`):

**Core**: launch_talkboy, get_talkboy_status, get_transcript, get_conversation_history

**Session**: get_claude_session, set_claude_session, disconnect_claude_session

**IPC**: get_pending_message, respond_to_talkboy

**State**: update_talkboy_state

**Media**: analyze_image, open_url

All tools make HTTPS requests to the local server API (with self-signed cert bypass).

## CLI

Three entry points in `bin/`:

- `talkboy` -- Start server + open Chrome
- `talkboy-server` -- Lifecycle management (start/stop/restart/status/logs/install/uninstall as launchd daemon)
- `talkboy-mcp` -- MCP server (stdio)

## HTTPS

Required for Web Speech API. Certificates are auto-generated:

1. Check for Tailscale certs at standard macOS path
2. Fall back to self-signed certs stored at `~/.talkboy/`
3. Generated via `selfsigned` npm package

## Key Design Decisions

- **One-shot Claude processes**: Each message spawns a fresh `claude -p` with `--no-session-persistence`. Avoids concurrency conflicts but no multi-turn tool context within a single Claude session.
- **bypassPermissions**: Claude runs with all permissions granted. No approval flow (yet).
- **Voice-optimized prompts**: System instruction tells Claude to keep responses to 1-2 sentences, no markdown, speak naturally.
- **Dual persistence**: localStorage as offline cache, SQLite as source of truth. Enables offline-first with server sync.
