# TalkBoy

A voice-first, cassette tape-themed interface for Claude Code with conversation management, Telegram bot, and MCP integration.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Zustand
- **Server**: Node.js, Hono, better-sqlite3 (WAL mode)
- **Telegram**: grammy
- **MCP**: @modelcontextprotocol/sdk (stdio transport)
- **Voice**: Web Speech API (browser-native STT/TTS)

## Commands

- `npm run dev` — Start Vite dev server (frontend only, no API)
- `npm run build` — TypeScript check + Vite build + esbuild server bundle
- `npm run test` — Run vitest
- `talkboy-server start -f` — Start HTTPS server in foreground (serves API + built frontend)
- `talkboy-server start` — Start as background process or via launchd

## Directory Structure

```
src/                    Frontend React app
  App.tsx               Main orchestration (voice, chat, settings, FAB)
  lib/claude.ts         Claude API integration (direct + Claude Code CLI modes)
  lib/store.ts          Zustand state (conversations, messages, activities, settings)
  lib/api.ts            REST client for server API
  components/voice/     Speech recognition, TTS, wake word
  components/chat/      Timeline, sidebar, input bar
  components/cassette/  Tape deck, tape collection, cassette visuals
  components/media/     Image lightbox, media library
  components/settings/  Settings drawer
server/                 Hono HTTPS server
  api.ts                All API routes (conversations, claude-code, IPC, media)
  index.ts              Server startup (HTTPS, Telegram bot, DB init)
  state.ts              In-memory state for IPC callbacks
  ssl.ts                Self-signed cert generation
  db/schema.ts          SQLite schema with versioned migrations
  db/repositories/      CRUD: conversations, messages, activities, search, telegram
  telegram/             grammy bot (commands, handlers)
mcp-server/index.js     MCP server with 12 tools (stdio transport)
bin/                    CLI entry points
  talkboy.js            Start server + open browser
  talkboy-server.js     Server lifecycle (start/stop/restart/status/logs/install)
  talkboy-mcp.js        MCP server entry point
```

## Key Patterns

- **HTTPS required**: Web Speech API needs secure context. Self-signed certs auto-generated at `~/.talkboy/`
- **Two Claude modes**: Direct API (with API key, streaming TTS) or Claude Code CLI (spawns `claude -p`, shows tool activity)
- **Persistence**: localStorage as cache, SQLite (`~/.talkboy/talkboy.db`) as source of truth. Auto-migration on first server connect.
- **IPC**: Frontend posts to `/api/send`, MCP tools poll `/api/pending`, respond via `/api/respond`
- **One-shot processes**: Each `/api/claude-code` call spawns a fresh `claude -p` with `--no-session-persistence --permission-mode bypassPermissions`
- **SSE streaming**: Claude Code events and job events use Server-Sent Events

## Database

SQLite at `~/.talkboy/talkboy.db`. Schema version tracked in `schema_version` table. Current tables:
- `conversations` — id, title, timestamps, project_id
- `messages` — role, content, position, source
- `message_images` — base64 data URLs with descriptions
- `activities` — tool usage (tool, input, status, duration, error)
- `telegram_state` — per-user conversation tracking
- `messages_fts` — FTS5 full-text search with sync triggers
