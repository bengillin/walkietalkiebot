# Talkie Bot

[![npm version](https://img.shields.io/npm/v/talkiebot.svg)](https://www.npmjs.com/package/talkiebot) [![npm downloads](https://img.shields.io/npm/dm/talkiebot.svg)](https://www.npmjs.com/package/talkiebot)

A walkie talkie for Claude. Your voice is the interface.

> **Website**: [walkietalkie.bot](https://walkietalkie.bot) -- **Docs**: [walkietalkie.bot/docs](https://walkietalkie.bot/docs/)

## Install

Two ways to use Talkie. Pick one (or both).

### Plugin (recommended)

Add Talkie as a Claude Code plugin for 30 MCP tools + 5 skills, no server required. Data tools talk directly to SQLite.

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

### Full Install

The full server gives you the web UI, voice interface, Telegram bot, and everything.

```bash
npx talkiebot
```

This starts the HTTPS server and opens `https://localhost:5173` in your browser.

> Requires Chrome or Edge for voice (Web Speech API needs secure context).

## What You Get

### Plugin

- **15 data tools** -- conversations, messages, plans, search, liner notes, export. Always work via direct SQLite, no server needed.
- **15 server tools** -- voice, IPC, sessions, jobs, image analysis, browser control. Require the Talkie server to be running.
- **5 skills** -- save-conversation, search-tapes, manage-plans, launch-voice, export-tape.

### Full Install

Everything above, plus:

- Web UI with 6 retro themes and cassette tape metaphor
- Push-to-talk, wake word ("hey talkie"), and continuous listening
- Streaming text-to-speech with selectable system voices
- Animated robot avatar with 6 states
- Real-time activity feed for Claude Code tool calls
- Automatic plan detection and management
- Per-conversation liner notes
- Full-text search across all conversations (Cmd+K)
- Background job execution with SSE streaming
- Telegram bot integration
- Image drag-and-drop with Claude vision analysis
- Markdown and JSON export

## Themes

Six fully themed visual experiences. Every UI element reskins -- headers, chat bubbles, conversation cards, viewport borders, modals, and the robot avatar.

| Theme | Internal Name | Vibe |
|-------|--------------|------|
| **TalkBoy** | `mccallister` | Silver cassette recorder with chunky buttons and red accents |
| **Bubble** | `imessage` | Minimal and polished, inspired by modern Apple interfaces |
| **Dial-Up** | `aol` | Beveled gray panels and buddy list energy from the 90s internet |
| **Finder** | `classic-mac` | The elegant gray desktop of classic Mac OS (System 7/8/9) |
| **Guestbook** | `geocities` | Neon text on dark backgrounds, like a 90s homepage under construction |
| **1984** | `apple-1984` | Rainbow Apple warmth from the original Macintosh era |

Switch themes via the header button or settings drawer.

## MCP Tools

### Data Tools (offline)

Work directly against SQLite at `~/.talkie/talkie.db`. No server needed.

| Tool | Description |
|------|-------------|
| `list_conversations` | List all saved conversations with pagination |
| `get_conversation` | Get full conversation with messages, images, and activities |
| `create_conversation` | Create a new conversation (cassette tape) |
| `rename_conversation` | Rename an existing conversation |
| `delete_conversation` | Delete a conversation permanently |
| `search_conversations` | Full-text search (FTS5) across all conversations |
| `add_message` | Add a message to a conversation |
| `list_plans` | List all plans |
| `get_plan` | Get plan by ID with full content |
| `create_plan` | Create a plan (draft/approved/in_progress/completed/archived) |
| `update_plan` | Update plan title, content, or status |
| `delete_plan` | Delete a plan |
| `get_liner_notes` | Get per-conversation markdown notes |
| `set_liner_notes` | Set or clear liner notes |
| `export_conversation` | Export as markdown or JSON |

### Server Tools (requires server)

Require the Talkie server to be running (`npx talkiebot`).

| Tool | Description |
|------|-------------|
| `launch_talkie` | Start server and open browser |
| `get_talkie_status` | Check running status and avatar state |
| `get_transcript` | Get latest voice transcript |
| `get_conversation_history` | Get current tape's conversation messages |
| `get_claude_session` | Get connected session ID |
| `set_claude_session` | Connect to a Claude Code session |
| `disconnect_claude_session` | Disconnect session |
| `get_pending_message` | Poll for user messages (IPC mode) |
| `respond_to_talkie` | Send response to user (IPC mode) |
| `update_talkie_state` | Set avatar state and transcript |
| `analyze_image` | Analyze image via Claude vision |
| `open_url` | Open URL in default browser |
| `create_talkie_job` | Create background async job |
| `get_talkie_job` | Get job status and result |
| `list_talkie_jobs` | List jobs by status |

### Skills

| Skill | Description |
|-------|-------------|
| `save-conversation` | Save the current conversation as a cassette tape |
| `search-tapes` | Search across all saved tapes |
| `manage-plans` | Create, update, and track plans |
| `launch-voice` | Start the voice interface |
| `export-tape` | Export a conversation to markdown or JSON |

## Configuration

Set `TALKIE_PORT` to change the default port (5173).

**Server management:**

```bash
talkie-server start [-f]    # Start (background or foreground)
talkie-server stop           # Stop
talkie-server status         # Show status
talkie-server logs [-f]      # View logs
talkie-server install        # Install as macOS launchd daemon
```

**Telegram bot:** Create a bot via [@BotFather](https://t.me/BotFather), then set `TELEGRAM_BOT_TOKEN` or save to `~/.talkie/telegram.token`. The bot starts automatically with the server.

## Development

```bash
npm install       # Install dependencies
npm run dev       # Vite dev server (frontend only)
npm run build     # TypeScript check + Vite build + server bundle
npm run test      # Run tests
```

Full architecture, API reference, and integration guides at [walkietalkie.bot/docs](https://walkietalkie.bot/docs/).

## License

MIT
