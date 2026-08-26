# Talkie

A voice-first, cassette tape-themed interface for Claude Code with 6 retro themes, conversation management, and MCP integration.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Zustand
- **Server**: Node.js, Hono, better-sqlite3 (WAL mode)
- **MCP**: @modelcontextprotocol/sdk (stdio transport)
- **Voice**: Web Speech API (browser-native STT/TTS)
- **Themes**: 6 CSS theme files with ~70+ custom properties each

## Commands

- `npm run dev` — Start Vite dev server (frontend only, no API)
- `npm run build` — TypeScript check + Vite build + esbuild server bundle
- `npm run test` — Run all tests (client + server, 299 unit tests across 19 files)
- `npm run test:client` — Run frontend tests only (vitest, jsdom)
- `npm run test:server` — Run server tests only (vitest, node, in-memory SQLite)
- `wtb-server start -f` — Start server in foreground (serves API + built frontend)
- `wtb-server start` — Start as background process or via launchd

## Directory Structure

```
src/                    Frontend React app
  App.tsx               Main orchestration (~470 lines, delegates to custom hooks)
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
  components/onboarding/ 7-step setup wizard (welcome, choose-mode, tts, sounds, wake word, continuous, done)
  components/settings/  Settings drawer
  components/shortcuts/ Keyboard shortcuts guide
  components/dropzone/  Image drag-and-drop
  hooks/                8 custom hooks extracted from App.tsx
    useClaudeChat.ts    Message flow, plan detection, tool activity tracking
    useVoiceIO.ts       STT/TTS, wake word, avatar state, sound effects
    useKeyboardControl.ts  Spacebar PTT, shortcuts, continuous listening
    useDraggableFab.ts  FAB drag/resize with touch support
    useImageAnalysis.ts Image drop handling and Claude vision analysis
    useServerSync.ts    DB init, migration, server sync on mount
    useKeyboardShortcuts.ts  Low-level keyboard event hooks (Escape, Cmd+K, Cmd+E)
    useSoundEffects.ts  Web Audio API tone generation
server/                 Hono HTTP server (HTTPS only with Tailscale certs)
  api.ts                All API routes (conversations, claude-code, IPC, media, plans, jobs)
  index.ts              Server startup (HTTP/HTTPS, DB init)
  state.ts              In-memory state for IPC callbacks
  ssl.ts                Tailscale cert detection (no self-signed generation)
  db/schema.ts          SQLite schema with versioned migrations (v1–v6)
  db/repositories/      CRUD: conversations, messages, activities, search, plans, jobs
  test/helpers.ts       Test utilities (in-memory SQLite via initDbForTesting)
  jobs/                 Async job execution
mcp-server/             MCP server (TypeScript, compiled to dist/)
  index.ts              30 typed tools: 15 data (direct SQLite) + 15 server (HTTP proxy)
  dist/index.js         Compiled output with shebang (entry point for bin/MCP)
bin/                    CLI entry points
  wtb.js               Start server + open browser
  wtb-server.js        Server lifecycle (start/stop/restart/status/logs/install)
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

- **HTTP localhost**: Localhost is a secure context — no HTTPS needed. HTTPS auto-enabled only when Tailscale certs exist at `~/.wtb/`
- **Optional auth**: `WTB_AUTH_TOKEN` enables a shared-secret gate (`server/auth.ts`, mounted app-level in `server/index.ts`). Programmatic clients (MCP HTTP proxy) send `Authorization: Bearer <token>`; the web UI presents the token once via `?token=` which sets a `SameSite=Strict` cookie. No-op when unset. Set it before exposing the server beyond localhost — the server runs `claude -p` with `bypassPermissions`, so the API is equivalent to shell access.
- **Claude Code only**: All communication through Claude Code CLI (`claude -p`). No Direct API mode.
- **Configurable modes**: 5 built-in modes (Voice, Pair, Architect, Code Review, Debug) defined in `server/modes.ts`. Custom modes loaded from `~/.wtb/modes/*.json`. Modes control prompt instructions and plan detection. Per-conversation mode persisted in DB. Switchable via header dropdown or voice ("switch to architect mode")
- **Parallel job orchestration**: Up to 3 concurrent background jobs. `POST /api/jobs/orchestrate` dispatches multiple jobs with different modes. Voice command: "run code-review and architect on this" spawns parallel agents. Each job streams independently via SSE.
- **Prompt builder**: Pure function in `server/promptBuilder.ts` assembles context, images, mode instruction, and plan detection into the prompt. Tested independently.
- **Persistence**: localStorage as cache, SQLite (`~/.wtb/wtb.db`) as source of truth. Auto-migration on first server connect.
- **IPC**: Frontend posts to `/api/send`, MCP tools poll `/api/pending`, respond via `/api/respond`
- **Session resumption**: When `/api/claude-code` receives a conversation UUID, the turn runs inside a persistent Claude Code session — `--session-id <uuid>` to create (seeded with recent history), `--resume <uuid>` for later turns (only the new message is sent; Claude Code holds + caches the conversation). An in-process `establishedSessions` set picks the first strategy; on a session fault (`No conversation found` / `already in use`) before any content streams, `spawnClaude` transparently retries with the other strategy, so expired sessions and post-restart state both self-heal. Calls without a conversation id (jobs, image analysis, raw mode) keep the legacy one-shot `--no-session-persistence` behavior. All via `--permission-mode bypassPermissions`.
- **SSE streaming**: Claude Code events and job events use Server-Sent Events
- **Theming**: React context applies `data-theme` attribute to root; each theme has a dedicated CSS file with custom properties for all UI elements
- **Tool identity**: Centralized in `lib/toolConfig.ts` — maps 40+ tools to icons, labels, display names, and 6 categories (fs, exec, voice, data, plan, media) with per-theme colors
- **Dual distribution**: npm package (`npx walkietalkiebot`) for full server + web UI; Claude Code plugin for MCP tools + skills (data tools work offline via direct SQLite)
- **MCP hybrid architecture**: Data tools (conversations, plans, search, notes, export) use SQLite directly; server tools (voice, IPC, session, jobs) proxy HTTP to the Talkie server
- **Auto-generated JS**: `server/**/*.js` and `mcp-server/dist/` are compiled from TypeScript by `npm run build:server` — do not edit them directly
- **Hook architecture**: App.tsx delegates to 8 custom hooks for voice, chat, keyboard, FAB, images, server sync, sounds, and shortcuts. Circular dependency between voice and chat is resolved via a ref pattern (useVoiceIO accepts onSendMessageRef)
- **Testing**: Separate vitest configs for client (jsdom) and server (node). Server tests use in-memory SQLite via initDbForTesting(). API tests use Hono's app.request() method. Because `npm run build` emits compiled `.js` beside every server `.ts`, `vitest.config.server.ts` forces resolution to the `.ts` sources — without it the suite silently tests build output

## Themes

6 themes: TalkBoy (mccallister), Bubble (imessage), Dial-Up (aol), Finder (classic-mac), Guestbook (geocities), 1984 (apple-1984). Each theme styles every component including viewport borders, chat bubbles, conversation cards, the robot avatar, and onboarding swatches.

## Database

SQLite at `~/.wtb/wtb.db`. Schema version tracked in `schema_version` table (currently v6). Tables:
- `conversations` — id, title, timestamps, project_id, parent_id, liner_notes, mode
- `messages` — role, content, position, source
- `message_images` — base64 data URLs with descriptions
- `activities` — tool usage (tool, input, status, duration, error)
- `plans` — title, content, status (draft/approved/in_progress/completed/archived), conversation_id
- `jobs` — async background tasks with status, result, error
- `messages_fts` — FTS5 full-text search with sync triggers
