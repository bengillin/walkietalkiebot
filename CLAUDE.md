# Talkie

A voice-first, cassette tape-themed interface for Claude Code with 6 retro themes, conversation management, Telegram bot, and MCP integration.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Zustand
- **Server**: Node.js, Hono, better-sqlite3 (WAL mode)
- **Telegram**: grammy
- **MCP**: @modelcontextprotocol/sdk (stdio transport)
- **Voice**: Web Speech API (browser-native STT/TTS)
- **Themes**: 6 CSS theme files with ~70+ custom properties each

## Commands

- `npm run dev` — Start Vite dev server (frontend only, no API)
- `npm run build` — TypeScript check + Vite build + esbuild server bundle
- `npm run test` — Run vitest
- `talkie-server start -f` — Start HTTPS server in foreground (serves API + built frontend)
- `talkie-server start` — Start as background process or via launchd

## Directory Structure

```
src/                    Frontend React app
  App.tsx               Main orchestration (voice, chat, settings, FAB)
  lib/claude.ts         Claude API integration (direct + Claude Code CLI modes)
  lib/store.ts          Zustand state (conversations, messages, activities, settings)
  lib/api.ts            REST client for server API
  lib/export.ts         Markdown and JSON export
  lib/jobStore.ts       Background job state (Zustand)
  lib/planDetection.ts  Auto-detect plans in Claude responses
  lib/toolConfig.ts     Tool identity system (icons, labels, categories for 40+ tools)
  contexts/ThemeContext.tsx  Theme provider (6 themes via data-theme attribute)
  styles/themes/        Per-theme CSS files (mccallister, imessage, aol, classic-mac, geocities, apple-1984)
  components/voice/     Speech recognition, TTS, wake word
  components/chat/      Timeline, sidebar, input bar
  components/cassette/  Tape deck, tape collection, RetroTape, CassetteTape visuals
  components/avatar/    CSS-only robot avatar with 6 states
  components/activity/  Real-time tool usage feed
  components/plans/     Plan detection, list, detail, status workflow
  components/linernotes/ Per-conversation notes panel
  components/search/    Full-text search overlay (Cmd+K)
  components/jobs/      Job status bar and detail panel
  components/media/     Image lightbox, media library
  components/onboarding/ 6-step setup wizard
  components/settings/  Settings drawer
  components/shortcuts/ Keyboard shortcuts guide
  components/dropzone/  Image drag-and-drop
  hooks/                Keyboard shortcuts, sound effects
server/                 Hono HTTPS server
  api.ts                All API routes (conversations, claude-code, IPC, media, plans, jobs)
  index.ts              Server startup (HTTPS, Telegram bot, DB init)
  state.ts              In-memory state for IPC callbacks
  ssl.ts                Self-signed cert generation
  db/schema.ts          SQLite schema with versioned migrations (v1–v4)
  db/repositories/      CRUD: conversations, messages, activities, search, plans, jobs, telegram
  jobs/                 Async job execution
  telegram/             grammy bot (commands, handlers)
mcp-server/index.js     MCP server: 15 data tools (direct SQLite) + 15 server tools (HTTP proxy)
bin/                    CLI entry points
  talkie.js            Start server + open browser
  talkie-server.js     Server lifecycle (start/stop/restart/status/logs/install)
.claude-plugin/         Claude Code plugin manifest
  plugin.json          Plugin name, version, description
.mcp.json               MCP server config for plugin mode
skills/                 Claude Code skills (5 skills)
  save-conversation/   Save conversation as cassette tape
  search-tapes/        Full-text search across conversations
  manage-plans/        Plan lifecycle management
  launch-voice/        Launch web UI
  export-tape/         Export as markdown/JSON
site/                   Marketing site (walkietalkie.bot)
  index.html            Landing page with dual-audience hero
  docs/                 6 documentation pages (getting-started, features, api, integrations, themes)
  src/                  Shared CSS, TypeScript, theme system
  public/               llms.txt, robots.txt, sitemap.xml, og.png
```

## Key Patterns

- **HTTPS required**: Web Speech API needs secure context. Self-signed certs auto-generated at `~/.talkie/`
- **Two Claude modes**: Direct API (with API key, streaming TTS) or Claude Code CLI (spawns `claude -p`, shows tool activity)
- **Persistence**: localStorage as cache, SQLite (`~/.talkie/talkie.db`) as source of truth. Auto-migration on first server connect.
- **IPC**: Frontend posts to `/api/send`, MCP tools poll `/api/pending`, respond via `/api/respond`
- **One-shot processes**: Each `/api/claude-code` call spawns a fresh `claude -p` with `--no-session-persistence --permission-mode bypassPermissions`
- **SSE streaming**: Claude Code events and job events use Server-Sent Events
- **Theming**: React context applies `data-theme` attribute to root; each theme has a dedicated CSS file with custom properties for all UI elements
- **Tool identity**: Centralized in `lib/toolConfig.ts` — maps 40+ tools to icons, labels, display names, and 6 categories (fs, exec, voice, data, plan, media) with per-theme colors
- **Dual distribution**: npm package (`npx talkiebot`) for full server + web UI; Claude Code plugin for MCP tools + skills (data tools work offline via direct SQLite)
- **MCP hybrid architecture**: Data tools (conversations, plans, search, notes, export) use SQLite directly; server tools (voice, IPC, session, jobs) proxy HTTP to the Talkie server
- **Auto-generated JS**: `server/**/*.js` files are compiled from TypeScript by `npm run build:server` — do not edit them directly

## Themes

6 themes: TalkBoy (mccallister), Bubble (imessage), Dial-Up (aol), Finder (classic-mac), Guestbook (geocities), 1984 (apple-1984). Each theme styles every component including viewport borders, chat bubbles, conversation cards, the robot avatar, and onboarding swatches.

## Database

SQLite at `~/.talkie/talkie.db`. Schema version tracked in `schema_version` table (currently v4). Tables:
- `conversations` — id, title, timestamps, project_id, parent_id, liner_notes
- `messages` — role, content, position, source
- `message_images` — base64 data URLs with descriptions
- `activities` — tool usage (tool, input, status, duration, error)
- `plans` — title, content, status (draft/approved/in_progress/completed/archived), conversation_id
- `jobs` — async background tasks with status, result, error
- `telegram_state` — per-user conversation tracking
- `messages_fts` — FTS5 full-text search with sync triggers
