# Talkboy

A voice-first interface for Claude, styled after the classic Talkboy cassette recorder from Home Alone 2.

## What it does

Talkboy lets you have voice conversations with Claude. Push a button (or say "over"), speak your message, and hear Claude respond. It features a nostalgic cassette tape UI with spinning reels, a tape deck input area, and maintains full conversation history.

## Features

- **Push-to-talk**: Hold spacebar or click the record button to speak
- **Trigger word**: Say "over" (customizable) to send your message hands-free
- **Wake word**: Say "hey talkboy" (customizable) to start listening
- **Continuous listening**: Always-on mode that waits for your trigger word
- **Streaming TTS**: Responses are spoken back in real-time
- **Cassette tape UI**: Animated spinning reels, recording indicator, retro aesthetic
- **Tape deck input**: Mini cassette display with text input and send button
- **Multiple conversations**: Switch between tapes, create new ones, delete old
- **Activity tracking**: Collapsible tool usage display with persistence
- **Animated avatar**: Visual feedback for listening, thinking, speaking states
- **Two modes**:
  - **Claude Code**: Routes through the CLI with full agent capabilities (default)
  - **Direct API**: Uses your Anthropic API key
- **Image analysis**: Drag and drop images for Claude vision analysis
- **Media library**: Browse all images across conversations
- **Themes**: McAllister (silver Talkboy) and iMessage styles

## Quick Start

```bash
npx talkboy
```

This starts the Talkboy server and opens https://localhost:5173 in your browser.

**Browser requirement:** Chrome, Edge, or another Chromium-based browser. Firefox and Safari do not support the Web Speech API used for voice recognition.

### Setup

1. Complete the onboarding flow to configure voice settings
2. Choose your preferences:
   - **Wake word**: Enable "hey talkboy" activation
   - **Continuous listening**: Always-on with trigger word
   - **Text-to-speech**: Have responses read aloud
3. Start talking!

## Development

```bash
# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev

# Build for production
npm run build
```

## How it works

### Claude Code Mode (Default)
Each message spawns `claude -p` with recent conversation history as context:
- Full conversation history included in the prompt
- Fresh process per message (no session conflicts)
- Voice-optimized prompt keeps responses brief
- Tool usage is tracked and displayed in collapsible panels

### Direct API Mode
Messages go straight to the Anthropic API. Simple and fast, but no tool usage.

## Architecture

```
src/
├── App.tsx                 # Main app, state management
├── components/
│   ├── activity/           # Real-time tool usage feed
│   ├── avatar/             # Animated avatar with states
│   ├── cassette/           # Tape deck UI components
│   │   ├── CassetteTape    # Animated cassette with reels
│   │   ├── TapeDeck        # Input bar with mini cassette
│   │   └── TapeCollection  # Conversation switcher drawer
│   ├── chat/               # Timeline, sidebar, input components
│   ├── dropzone/           # Image drag-and-drop with analysis
│   ├── media/              # Image lightbox and library
│   ├── onboarding/         # First-run setup flow
│   └── voice/              # Speech recognition, synthesis, wake word
├── lib/
│   ├── claude.ts           # API calls (direct + CLI + vision)
│   └── store.ts            # Zustand store for conversations
├── styles/
│   ├── globals.css         # Base styles and CSS variables
│   └── themes/             # McAllister (Talkboy) and iMessage themes
└── hooks/
    └── useSoundEffects.ts  # Audio feedback

server/
├── index.ts                # HTTPS server with Hono
├── api.ts                  # API route handlers
├── state.ts                # In-memory state management
└── ssl.ts                  # Self-signed certificate generation

bin/
├── talkboy.js              # CLI entry: starts server, opens browser
└── talkboy-mcp.js          # MCP server entry point
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Health check, avatar state |
| `/api/transcript` | GET | Latest voice transcript |
| `/api/history` | GET | Get conversation messages |
| `/api/state` | POST | Sync state from browser |
| `/api/session` | GET/POST/DELETE | Manage Claude session ID |
| `/api/pending` | GET | Check for pending IPC messages |
| `/api/respond` | POST | Send response via IPC |
| `/api/send` | POST | Send message (SSE streaming) |
| `/api/analyze-image` | POST | Analyze image via Claude vision |
| `/api/open-url` | POST | Open URL in browser |
| `/api/claude-code` | POST | Send message, get streaming response |

## Roadmap

- [ ] Interrupt mid-response
- [ ] Custom avatar support
- [ ] Voice selection for TTS
- [ ] Export conversation transcripts

## Using with Claude Code (MCP)

You can launch Talkboy from any project using Claude Code by saying "launch talkboy".

### Setup

Add to your Claude Code settings (`~/.claude/settings.json`):

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

Restart Claude Code after adding the configuration.

### Available Tools

**Core Tools**

| Tool | Description |
|------|-------------|
| `launch_talkboy` | Start Talkboy and open in browser |
| `get_talkboy_status` | Check if running and current state |
| `get_transcript` | Get latest voice transcript |
| `get_conversation_history` | Get full chat history from current tape |

**Session Management**

| Tool | Description |
|------|-------------|
| `get_claude_session` | Get current Claude Code session ID |
| `set_claude_session` | Connect Talkboy to a Claude session |
| `disconnect_claude_session` | Disconnect current session |

**IPC Mode** (for Claude Code integration)

| Tool | Description |
|------|-------------|
| `get_pending_message` | Poll for user messages awaiting response |
| `respond_to_talkboy` | Send response back to Talkboy |
| `update_talkboy_state` | Update avatar state, transcript, etc. |

**Media**

| Tool | Description |
|------|-------------|
| `analyze_image` | Analyze image via Claude vision API |
| `open_url` | Open URL in default browser |

## Tech Stack

- React 18 + TypeScript
- Vite (dev server + build)
- Zustand (state management)
- Web Speech API (recognition + synthesis)
- CSS with theme support

## License

MIT
