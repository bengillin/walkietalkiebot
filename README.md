# Talkie

A voice-first, cassette tape-themed interface for Claude Code with six retro themes, conversation management, and integrations via Telegram bot and MCP.

Talk to Claude with push-to-talk, wake words, or continuous listening. Manage conversations as cassette tapes. Customize the experience with themes ranging from 90s AOL to classic Mac OS. Works with web UI, Telegram bot, and MCP integration.

## Quick Start

```bash
npx talkie
```

This starts the HTTPS server and opens https://localhost:5173 in your browser.

> Requires Chrome or Edge (Web Speech API).

> **Website**: [walkietalkie.bot](https://walkietalkie.bot) — **Docs**: [walkietalkie.bot/docs](https://walkietalkie.bot/docs/)

### Setup

1. Complete the onboarding wizard (theme selection, voice preferences)
2. Choose your interaction style:
   - **Push-to-talk**: Hold spacebar or tap the mic
   - **Wake word**: Say "hey talkie" for hands-free activation
   - **Continuous listening**: Always-on mode with trigger word ("over")
3. Start talking!

## Themes

Six fully themed visual experiences, each reskinning every UI element — headers, chat bubbles, conversation cards, viewport borders, onboarding, modals, and the robot avatar.

| Theme | Internal Name | Vibe |
|-------|--------------|------|
| **TalkBoy** | `mccallister` | Silver cassette recorder with chunky buttons and red accents |
| **Bubble** | `imessage` | Minimal and polished, inspired by modern Apple interfaces |
| **Dial-Up** | `aol` | Beveled gray panels and buddy list energy from the 90s internet |
| **Finder** | `classic-mac` | The elegant gray desktop of classic Mac OS (System 7/8/9) |
| **Guestbook** | `geocities` | Neon text on dark backgrounds, like a 90s homepage under construction |
| **1984** | `apple-1984` | Rainbow Apple warmth from the original Macintosh era |

Each theme includes:
- ~70+ CSS custom properties (colors, typography, spacing, shadows, radius)
- Per-theme viewport border decorations (rainbow stripes, neon rails, Win95 title bars)
- Themed conversation labels, chat bubbles, and onboarding swatches
- Custom robot avatar colors
- Theme-specific logo typography

Switch themes via the header button (opens a preview modal) or the settings drawer.

## Features

### Voice Input

- **Push-to-talk**: Hold spacebar or click the record button
- **Wake word**: Say "hey talkie" (customizable) for hands-free activation
- **Continuous listening**: Always-on mode that waits for your trigger word
- **Trigger word**: Say "over" (customizable) to end your turn
- **Silence detection**: Configurable delay (0.5–3.0s) after trigger word
- **Streaming TTS**: Responses spoken back in real-time with selectable system voices
- **Sound effects**: Synthesized tones for start/stop recording, thinking, success, and errors

### Cassette Tape UI

Conversations are "tapes" in a tape deck:
- **Tape Deck**: Bottom input bar with mic button, text input, file attach, and send
- **Tape Collection**: Drawer showing all conversations as illustrated tape cards with search
- **RetroTape visuals**: 8 label colors, reel sizes based on message count, eject animations
- **CassetteTape component**: Full cassette with animated reels, recording LED, 5 sizes, 4 body colors, 5 states
- **Per-theme labels**: Each theme has its own terminology (e.g. "Recorded Conversations" vs "Tape Stash")

### Robot Avatar

A CSS-only animated robot that lives in the header:
- Spherical body with expressive eyes, antenna, speaker grille, and status LED
- **6 states**: idle, listening, thinking, speaking, happy, confused
- Per-state animations (eye movement, antenna glow, grille pulsing)
- Per-theme colors via CSS variables
- Interactive — hover triggers happy state

### Claude Integration

Two modes:

- **Claude Code mode** (default): Spawns `claude -p` with full tool access. Shows real-time activity feed of tool calls. Supports image attachments.
- **Direct API mode**: Uses your Anthropic API key. Supports model selection (Sonnet/Opus/Haiku), max tokens, custom system prompts, and streaming TTS.

### Activity Feed

When Claude Code runs tools, the UI shows:
- Tool name with emoji icon and human-readable label
- 6 color-coded categories: filesystem (blue), execution (orange), voice (purple), data (green), plans (pink), media (amber)
- MCP tool names cleaned for display (e.g., `mcp__talkie__list_conversations` → "Conversations")
- Input details and live status (spinner, checkmark, error)
- Duration tracking
- Collapsible per-message activity history persisted to SQLite
- Per-theme category colors matching each theme's design language

### Plans

Automatic plan detection and management:
- Detects structured plans in Claude responses (headings, numbered steps, checkboxes)
- Side panel with plan list and detail view
- Status workflow: draft → approved → in_progress → completed → archived
- Edit, delete, and link plans to conversations
- Toast notification when a plan is auto-saved

### Liner Notes

Per-conversation notes panel:
- Free-form notes attached to each tape
- Pin message content directly from the chat timeline
- Markdown rendering (headings, bold, italic, code, lists)
- Persisted to SQLite with the conversation

### Search

- **Global search** (`Cmd/Ctrl+K`): Full-screen overlay with FTS5 full-text search across all messages, highlighted snippets, keyboard navigation
- **Tape collection search**: Inline search within the conversation drawer

### Context Linking

Toggle past conversations as context for the current chat. Selected conversations' messages are merged chronologically, giving Claude memory across tapes.

### Image Handling

- Drag and drop images onto the chat for Claude vision analysis
- File picker via the attach button in the tape deck
- Auto-analysis on drop with preview thumbnails
- Media library to browse images across all conversations
- Full-screen image lightbox with gallery navigation

### Background Jobs

Server-side async task execution:
- Create jobs via API or MCP tools
- SSE streaming for live progress updates
- Job status bar showing running/queued/completed jobs
- Detail panel for individual job inspection
- Auto-polling every 3 seconds

### Export

Export conversations as Markdown or JSON via `Cmd/Ctrl+E` or the settings drawer. Includes messages, liner notes, and metadata.

### Mobile Support

- Floating Action Button (FAB) for recording — draggable and resizable
- Long-press to drag, tap to record
- Tap-to-talk pulse animation for continuous mode (iOS requires gesture to start mic)
- Position and size persisted in localStorage

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Spacebar` (hold) | Push-to-talk (when not in continuous mode) |
| `Escape` | Cancel recording |
| `Cmd/Ctrl+K` | Search |
| `Cmd/Ctrl+E` | Export conversation |
| `?` | Toggle keyboard shortcuts guide |

### Onboarding

Six-step wizard on first launch:
1. **Welcome** — theme selection with live preview swatches
2. **Text-to-Speech** — enable/disable TTS with voice picker
3. **Sound Effects** — toggle synthesized UI sounds
4. **Wake Word** — configure hands-free activation
5. **Continuous Listening** — always-on mode with trigger word
6. **Done** — ready to talk

Reset from the settings drawer at any time.

## Server Management

```bash
talkie-server start [-f]    # Start (background, or -f for foreground)
talkie-server stop          # Stop the server
talkie-server restart       # Restart
talkie-server status        # Show status (running, port, launchd, DB)
talkie-server logs [-f]     # View logs (-f to follow)
talkie-server install       # Install as macOS launchd daemon (auto-start on login)
talkie-server uninstall     # Remove launchd daemon
```

Set `TALKIE_PORT` to change the default port (5173).

## Telegram Bot

Chat with Claude from your phone via Telegram.

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Provide the token:
   - Environment variable: `TELEGRAM_BOT_TOKEN=your-token`
   - Or token file: `~/.talkie/telegram.token`
3. Start the server — bot starts automatically

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | Show all commands |
| `/conversations` | List recent conversations with selection buttons |
| `/new <name>` | Create a new conversation |
| `/current` | Show current conversation info |
| `/status` | Check server and Claude status |

Send text messages to chat. Send photos (with optional captions) for image analysis.

## MCP Integration

Claude Code can launch and interact with Talkie via MCP tools.

### Setup

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "talkie": {
      "command": "npx",
      "args": ["talkie-mcp"]
    }
  }
}
```

### Tools (30)

**Core & Voice**

| Tool | Description |
|------|-------------|
| `launch_talkie` | Start server and open browser |
| `get_talkie_status` | Check running status and avatar state |
| `get_transcript` | Get latest voice transcript |
| `get_conversation_history` | Get current conversation messages |
| `get_pending_message` | Poll for user messages (IPC mode) |
| `respond_to_talkie` | Send response to user (IPC mode) |
| `update_talkie_state` | Set avatar state, transcript |

**Session**

| Tool | Description |
|------|-------------|
| `get_claude_session` | Get connected session ID |
| `set_claude_session` | Connect to a Claude Code session |
| `disconnect_claude_session` | Disconnect session |

**Conversations**

| Tool | Description |
|------|-------------|
| `list_conversations` | List all saved conversations with pagination |
| `get_conversation` | Get full conversation with messages and activities |
| `create_conversation` | Create a new conversation (cassette tape) |
| `rename_conversation` | Rename an existing conversation |
| `delete_conversation` | Delete a conversation permanently |
| `search_conversations` | Full-text search across all conversations |
| `add_message` | Add a message to a conversation |

**Plans**

| Tool | Description |
|------|-------------|
| `list_plans` | List all plans |
| `get_plan` | Get plan by ID with full content |
| `create_plan` | Create a new plan |
| `update_plan` | Update plan title, content, or status |
| `delete_plan` | Delete a plan |

**Liner Notes & Export**

| Tool | Description |
|------|-------------|
| `get_liner_notes` | Get per-conversation markdown notes |
| `set_liner_notes` | Set or clear liner notes |
| `export_conversation` | Export as markdown or JSON |

**Media & Jobs**

| Tool | Description |
|------|-------------|
| `analyze_image` | Analyze image via Claude vision |
| `open_url` | Open URL in default browser |
| `create_talkie_job` | Create background async job |
| `get_talkie_job` | Get job status and result |
| `list_talkie_jobs` | List jobs by status |

## Persistence

- **Browser**: localStorage for settings and conversation cache
- **Server**: SQLite at `~/.talkie/talkie.db` (WAL mode, FTS5 full-text search)
- **Migration**: On first server connection, localStorage data auto-migrates to SQLite

### Database Schema (v4)

| Table | Purpose |
|-------|---------|
| `conversations` | Tapes with title, timestamps, project, liner notes |
| `messages` | Role, content, position, source |
| `message_images` | Base64 data URLs with descriptions |
| `activities` | Tool usage (tool, input, status, duration, error) |
| `plans` | Detected plans with status workflow |
| `jobs` | Background async tasks |
| `telegram_state` | Per-user conversation tracking |
| `messages_fts` | FTS5 virtual table with sync triggers |

## Architecture

```
Browser (React 18 + TypeScript + Zustand)
    │
    ├── Voice: Web Speech API (STT/TTS)
    ├── Themes: 6 retro themes via CSS custom properties
    ├── State: Zustand + localStorage cache
    └── API ──► HTTPS Server (Hono)
                    │
                    ├── SQLite (conversations, messages, activities, plans, jobs)
                    ├── Claude Code CLI (spawn per message)
                    ├── Telegram Bot (grammy)
                    └── Static files (dist/)

MCP Server (stdio) ──► HTTPS Server API
```

```
src/
├── App.tsx                    Main orchestration
├── components/
│   ├── activity/              Real-time tool usage feed
│   ├── avatar/                Animated robot with 6 states
│   ├── cassette/              Tape deck, collection, RetroTape, CassetteTape
│   ├── chat/                  Timeline, sidebar, input bar
│   ├── dropzone/              Image drag-and-drop
│   ├── jobs/                  Job status bar and detail panel
│   ├── linernotes/            Per-conversation notes panel
│   ├── media/                 Lightbox and library
│   ├── onboarding/            6-step setup wizard
│   ├── plans/                 Plan detection and management
│   ├── search/                Full-text search overlay
│   ├── settings/              Settings drawer
│   ├── shortcuts/             Keyboard shortcuts guide
│   └── voice/                 Recognition, synthesis, wake word
├── contexts/                  Theme context
├── hooks/                     Keyboard shortcuts, sound effects
├── lib/
│   ├── api.ts                 Server API client
│   ├── claude.ts              Claude API (direct + CLI + vision)
│   ├── export.ts              Markdown and JSON export
│   ├── jobStore.ts            Background job state
│   ├── planDetection.ts       Auto-detect plans in responses
│   ├── store.ts               Zustand state
│   └── toolConfig.ts          Tool identity system (icons, categories, labels)
├── styles/
│   ├── globals.css            Base styles + viewport borders
│   └── themes/                Per-theme CSS (6 files)
└── types/                     TypeScript definitions

server/
├── index.ts                   Server startup (HTTPS, DB, Telegram)
├── api.ts                     All API routes
├── state.ts                   In-memory IPC state
├── ssl.ts                     Self-signed cert generation
├── db/
│   ├── schema.ts              Versioned migrations (v1–v4)
│   └── repositories/          CRUD: conversations, messages, activities,
│                               search, plans, jobs, telegram
├── jobs/                      Async job execution
└── telegram/                  Bot commands and handlers

mcp-server/index.js            MCP server (30 tools, stdio)
site/                          Marketing site (walkietalkie.bot)
├── index.html                 Landing page
├── docs/                      Documentation (6 pages)
└── src/                       CSS, TypeScript, themes
bin/
├── talkie.js                  Start server + open browser
├── talkie-server.js           Server lifecycle CLI
└── talkie-mcp.js              MCP server entry
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Health check, avatar state, DB status |
| `/api/transcript` | GET | Latest voice transcript and messages |
| `/api/history` | GET | Conversation messages for MCP |
| `/api/state` | GET/POST | Get or sync browser state |
| `/api/session` | GET/POST/DELETE | Claude Code session management |
| `/api/pending` | GET | Check for pending IPC messages |
| `/api/respond` | POST | Send IPC response |
| `/api/send` | POST | Send message with SSE streaming |
| `/api/claude-code` | POST | Execute Claude CLI, stream response |
| `/api/analyze-image` | POST | Claude vision analysis |
| `/api/open-url` | POST | Open URL in native browser |
| `/api/conversations` | GET/POST | List or create conversations |
| `/api/conversations/:id` | GET/PATCH/DELETE | Get, update, or delete conversation |
| `/api/conversations/:id/messages` | POST | Add message with images/activities |
| `/api/plans` | GET/POST | List or create plans |
| `/api/plans/:id` | GET/PATCH/DELETE | Get, update, or delete plan |
| `/api/jobs` | GET/POST | List or create background jobs |
| `/api/jobs/:id` | GET/DELETE | Get job status or cancel job |
| `/api/jobs/:id/stream` | GET | SSE stream for job events |
| `/api/search` | GET | Full-text search across messages |
| `/api/migrate` | POST | Migrate localStorage to server |

See the [API Reference](https://walkietalkie.bot/docs/api.html) for detailed request/response formats.

## Settings

Configurable via the settings drawer:

- **Tape name**: Edit the current conversation title
- **Theme**: Pick from 6 retro themes with live preview
- **Claude Code mode**: Toggle between CLI and Direct API
- **Session connection**: View/disconnect Claude Code session
- **Direct API settings**: Model, max tokens, system prompt (when not in Claude Code mode)
- **TTS**: Enable/disable with voice selection
- **Sound effects**: Toggle synthesized UI tones
- **Continuous listening**: Auto-restart recording after responses
- **Trigger word**: Custom end-of-turn word (default: "over")
- **Silence delay**: Wait time after trigger word (0.5–3.0s)
- **Wake word**: Toggle and customize (default: "hey talkie")
- **API key**: Anthropic API key for Direct API mode
- **Export**: Markdown or JSON
- **Integrations**: MCP Server and Telegram Bot connection status
- **Reset onboarding**: Re-run the setup wizard

## Development

```bash
npm install       # Install dependencies
npm run dev       # Vite dev server (frontend only)
npm run build     # Production build
npm run test      # Run tests
npm run lint      # ESLint
```

## License

MIT
