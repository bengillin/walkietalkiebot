# Walkie Talkie Bot

[![npm version](https://img.shields.io/npm/v/walkietalkiebot.svg)](https://www.npmjs.com/package/walkietalkiebot) [![npm downloads](https://img.shields.io/npm/dm/walkietalkiebot.svg)](https://www.npmjs.com/package/walkietalkiebot)

A walkie talkie for Claude. Your voice is the interface.

> **Website**: [walkietalkie.bot](https://walkietalkie.bot) -- **Docs**: [walkietalkie.bot/docs](https://walkietalkie.bot/docs/)

## Requirements

- **Node.js 20 or later**
- **[Claude Code](https://code.claude.com/docs) CLI**, installed and logged in, with `claude` on your `PATH`. Every message goes through it; there is no API-key mode.
- **Chrome or Edge** for voice (Web Speech API). Other browsers can still type.

## Install

Two ways to use Walkie Talkie Bot. Pick one (or both).

### MCP tools only (no server)

Register the MCP server with Claude Code for 30 tools. The 15 data tools talk directly to SQLite, so no server is required for them.

```bash
claude mcp add --scope user wtb -- npx -y -p walkietalkiebot wtb-mcp
```

Or, to share it with a project, add it to that project's `.mcp.json`:

```json
{
  "mcpServers": {
    "wtb": {
      "command": "npx",
      "args": ["-y", "-p", "walkietalkiebot", "wtb-mcp"]
    }
  }
}
```

> **Do not run `npx wtb-mcp`.** The `wtb-mcp` package on npm belongs to an unrelated third party. The Talkie binary ships inside the `walkietalkiebot` package, which is why the command needs `-p walkietalkiebot`.

The five skills (below) ship with the Claude Code plugin manifest in this repository (`.claude-plugin/`, `skills/`).

### Full install

The full server gives you the web UI, voice interface, and everything. Run it **from the project directory you want Claude to work in**:

```bash
cd ~/code/my-project
npx walkietalkiebot
```

This starts the server on `127.0.0.1:5173` and opens `http://localhost:5173` in your browser. Claude runs in that directory with `bypassPermissions`, so it can edit files and run commands there without asking. Read [Security](#security) before exposing the server to anything but your own machine.

## What You Get

### MCP tools

- **15 data tools** -- conversations, messages, plans, search, liner notes, export. Always work via direct SQLite, no server needed.
- **15 server tools** -- voice, IPC, sessions, jobs, image analysis, browser control. Require the Walkie Talkie Bot server to be running.
- **5 skills** (with the Claude Code plugin) -- save-conversation, search-tapes, manage-plans, launch-voice, export-tape.

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

Work directly against SQLite at `~/.wtb/wtb.db`. No server needed.

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

Require the Walkie Talkie Bot server to be running (`npx walkietalkiebot`).

| Tool | Description |
|------|-------------|
| `launch_wtb` | Start server and open browser |
| `get_wtb_status` | Check running status and avatar state |
| `get_transcript` | Get latest voice transcript |
| `get_conversation_history` | Get current tape's conversation messages |
| `get_claude_session` | Get connected session ID |
| `set_claude_session` | Connect to a Claude Code session |
| `disconnect_claude_session` | Disconnect session |
| `get_pending_message` | Poll for user messages (IPC mode) |
| `respond_to_wtb` | Send response to user (IPC mode) |
| `update_wtb_state` | Set avatar state and transcript |
| `analyze_image` | Analyze image via Claude vision |
| `open_url` | Open URL in default browser |
| `create_wtb_job` | Create background async job |
| `get_wtb_job` | Get job status and result |
| `list_wtb_jobs` | List jobs by status |

### Skills

| Skill | Description |
|-------|-------------|
| `save-conversation` | Save the current conversation as a cassette tape |
| `search-tapes` | Search across all saved tapes |
| `manage-plans` | Create, update, and track plans |
| `launch-voice` | Start the voice interface |
| `export-tape` | Export a conversation to markdown or JSON |

## Configuration

All configuration is through environment variables.

| Variable | Default | Description |
|----------|---------|-------------|
| `WTB_PORT` | `5173` | Server port. The MCP server also reads it to find the Talkie server. |
| `WTB_HOST` | `127.0.0.1` | Address to bind, e.g. `0.0.0.0` or a Tailscale IP. A non-loopback host requires `WTB_AUTH_TOKEN`; without it the server refuses to start. |
| `WTB_DIR` | `~/.wtb` | Data directory: SQLite database, custom modes, logs, pid file, TLS certificates. |
| `WTB_AUTH_TOKEN` | unset (no auth) | Shared secret. When set, every `/api/*` request needs `Authorization: Bearer <token>`. Give the MCP server the same value so its server tools can authenticate. |
| `WTB_LOG_LEVEL` | `info` | Server log level: `debug`, `info`, `warn`, `error`, `silent`. |
| `WTB_TELEMETRY` | off | Set to `1` in the MCP server's environment to opt in to anonymous tool-usage telemetry. See [Telemetry](#telemetry). |
| `WTB_MAX_BODY_BYTES` | `52428800` (50 MB) | Maximum request body size, which bounds image uploads. |

**Server management:**

```bash
wtb-server start [-f]    # Start (background, or -f for foreground)
wtb-server stop          # Stop
wtb-server restart       # Restart
wtb-server status        # Show status
wtb-server logs [-f]     # View logs
wtb-server install       # Install as macOS launchd daemon
wtb-server uninstall     # Remove the launchd daemon
```

`wtb-server start` (background) and `install` run the server from the package directory. For Claude to work on a specific project, use `npx walkietalkiebot` or `wtb-server start -f` from that project.

## Security

Walkie Talkie Bot runs Claude Code via `claude -p --permission-mode bypassPermissions`: the agent reads and writes files and runs commands without asking. Anyone who can call the API can drive that agent, so **API access is equivalent to shell access** on the machine running the server. Only expose it to people you would hand a terminal to.

- **Loopback by default.** The server binds to `127.0.0.1`, so only your machine can reach it.
- **Web pages can't drive it.** Cross-origin requests to the API are rejected (no wildcard CORS) and the `Host` header is validated, so a website open in your browser cannot talk to your local server.
- **Exposing it requires a token.** To reach Talkie from another device, set `WTB_AUTH_TOKEN`, then `WTB_HOST`. Binding to a non-loopback address without a token is refused at startup.
- **HTTPS.** Localhost is a secure context, so no certificates are needed locally. For remote access, place Tailscale certs at `~/.wtb/tailscale.crt` and `~/.wtb/tailscale.key` (inside `WTB_DIR` if set) and HTTPS is enabled automatically.

```bash
export WTB_AUTH_TOKEN="$(openssl rand -hex 32)"
WTB_HOST=0.0.0.0 npx walkietalkiebot
```

Programmatic clients send `Authorization: Bearer <token>`. In the browser, open the UI once with `?token=<token>`; it stores the token in a `SameSite=Strict` cookie.

## Telemetry

The MCP server's telemetry is **off by default**. If you opt in with `WTB_TELEMETRY=1`, each MCP tool call sends one anonymous event to PostHog with the tool name, its category, and whether it succeeded. Nothing from your conversations, prompts, files, or messages is sent, and no user identifier is attached. The Talkie server and web UI send no telemetry.

## Development

```bash
npm install       # Install dependencies
npm run dev       # Vite dev server (frontend only)
npm run build     # TypeScript check + Vite build + server bundle + MCP server
npm run test      # Run all unit tests (322 across 22 files)
npm run test:e2e  # Playwright end-to-end tests
npm run lint      # ESLint
npm run format    # Prettier
```

The frontend is decomposed into 8 custom hooks (`src/hooks/`) for voice I/O, Claude chat, keyboard control, FAB dragging, image analysis, server sync, shortcuts, and sound effects. The server has full test coverage for all database repositories and HTTP API endpoints.

Full architecture, API reference, and integration guides at [walkietalkie.bot/docs](https://walkietalkie.bot/docs/).

## License

MIT. See [LICENSE](LICENSE).
