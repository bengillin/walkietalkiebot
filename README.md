# TalkBoy

A voice-first interface for Claude Code, styled after the classic TalkBoy cassette recorder from Home Alone 2.

Talk to Claude with push-to-talk, wake words, or continuous listening. Manage conversations as cassette tapes. Works with web UI, Telegram bot, and MCP integration.

## Quick Start

```bash
npx talkboy
```

This starts the HTTPS server and opens https://localhost:5173 in your browser.

> Requires Chrome or Edge (Web Speech API).

### Setup

1. Complete the onboarding flow to configure voice settings
2. Choose your preferences:
   - **Wake word**: Enable "hey talkboy" hands-free activation
   - **Continuous listening**: Always-on with trigger word
   - **Text-to-speech**: Have responses read aloud
3. Start talking!

## Features

### Voice Input

- **Push-to-talk**: Hold spacebar or click the record button
- **Wake word**: Say "hey talkboy" (customizable) for hands-free activation
- **Continuous listening**: Always-on mode that waits for your trigger word
- **Trigger word**: Say "over" (customizable) to end your turn
- **Silence detection**: Configurable delay (0.5-3.0s) after trigger word
- **Streaming TTS**: Responses spoken back in real-time

### Cassette Tape UI

Conversations are "tapes" in a tape deck:
- **Tape Deck**: Input bar with mini cassette display showing current conversation
- **Tape Collection**: Drawer with all conversations, eject button to browse
- **Switch tapes**: Click any tape to load that conversation
- **New tape**: Create a fresh conversation

### Claude Integration

Two modes:

- **Claude Code mode** (default): Spawns `claude -p` with full tool access. Shows real-time activity feed.
- **Direct API mode**: Uses your Anthropic API key. Supports streaming TTS.

### Image Handling

- Drag and drop images onto the chat for Claude vision analysis
- Media library to browse images across all conversations
- Image lightbox viewer

### Activity Feed

When Claude Code runs tools, the UI shows tool name, icon, input details, and live status (spinner, checkmark, error). Collapsible per-message activity history persisted to SQLite.

### Mobile Support

- Floating Action Button (FAB) for recording — draggable and resizable
- Mobile dropdown menu for settings, media library, tape collection

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Spacebar` (hold) | Push-to-talk (when not in continuous mode) |
| `Escape` | Cancel recording |
| `Cmd/Ctrl+K` | Search |
| `Cmd/Ctrl+E` | Export conversation |

### Export

Export conversations as Markdown, JSON, or plain text.

## Server Management

```bash
talkboy-server start [-f]    # Start (background, or -f for foreground)
talkboy-server stop          # Stop the server
talkboy-server restart       # Restart
talkboy-server status        # Show status (running, port, launchd, DB)
talkboy-server logs [-f]     # View logs (-f to follow)
talkboy-server install       # Install as macOS launchd daemon (auto-start on login)
talkboy-server uninstall     # Remove launchd daemon
```

Set `TALKBOY_PORT` to change the default port (5173).

## Telegram Bot

Chat with Claude from your phone via Telegram.

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Provide the token:
   - Environment variable: `TELEGRAM_BOT_TOKEN=your-token`
   - Or token file: `~/.talkboy/telegram.token`
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

Claude Code can launch and interact with TalkBoy via MCP tools.

### Setup

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "talkboy": {
      "command": "npx",
      "args": ["talkboy-mcp"]
    }
  }
}
```

### Tools

| Tool | Description |
|------|-------------|
| `launch_talkboy` | Start server and open browser |
| `get_talkboy_status` | Check running status and avatar state |
| `get_transcript` | Get latest voice transcript |
| `get_conversation_history` | Get current conversation messages |
| `get_claude_session` | Get connected session ID |
| `set_claude_session` | Connect to a Claude Code session |
| `disconnect_claude_session` | Disconnect session |
| `get_pending_message` | Poll for user messages (IPC mode) |
| `respond_to_talkboy` | Send response to user (IPC mode) |
| `update_talkboy_state` | Set avatar state, transcript |
| `analyze_image` | Analyze image via Claude vision |
| `open_url` | Open URL in default browser |

## Persistence

- **Browser**: localStorage for settings and conversation cache
- **Server**: SQLite at `~/.talkboy/talkboy.db` (WAL mode, FTS5 full-text search)
- **Migration**: On first server connection, localStorage data auto-migrates to SQLite

## Architecture

```
Browser (React 18 + TypeScript + Zustand)
    │
    ├── Voice: Web Speech API (STT/TTS)
    ├── State: Zustand + localStorage cache
    └── API ──► HTTPS Server (Hono)
                    │
                    ├── SQLite (conversations, messages, activities, images)
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
│   ├── avatar/                Animated avatar with states
│   ├── cassette/              Tape deck, collection, visuals
│   ├── chat/                  Timeline, sidebar, input bar
│   ├── dropzone/              Image drag-and-drop
│   ├── media/                 Lightbox and library
│   ├── onboarding/            First-run setup
│   ├── settings/              Settings drawer
│   └── voice/                 Recognition, synthesis, wake word
├── lib/
│   ├── claude.ts              Claude API (direct + CLI + vision)
│   ├── store.ts               Zustand state
│   └── api.ts                 Server API client
├── hooks/                     Keyboard shortcuts, sound effects
└── contexts/                  Theme context

server/
├── index.ts                   Server startup (HTTPS, DB, Telegram)
├── api.ts                     All API routes
├── state.ts                   In-memory IPC state
├── ssl.ts                     Self-signed cert generation
├── db/
│   ├── schema.ts              Versioned migrations
│   └── repositories/          CRUD modules
└── telegram/                  Bot commands and handlers

mcp-server/index.js            MCP server (12 tools, stdio)
bin/
├── talkboy.js                 Start server + open browser
├── talkboy-server.js          Server lifecycle CLI
└── talkboy-mcp.js             MCP server entry
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
| `/api/search` | GET | Full-text search across messages |
| `/api/migrate` | POST | Migrate localStorage to server |

See [docs/API.md](docs/API.md) for detailed request/response formats.

## Settings

Configurable via the settings drawer:

- **Claude Code mode**: Toggle between CLI and Direct API
- **Session connection**: View/disconnect Claude Code session
- **TTS**: Enable/disable text-to-speech
- **Continuous listening**: Auto-restart recording after responses
- **Trigger word**: Custom end-of-turn word (default: "over")
- **Silence delay**: Wait time after trigger word (0.5-3.0s)
- **API key**: Anthropic API key for Direct API mode
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
