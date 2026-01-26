# Talkboy

A voice-first interface for Claude. Talk naturally instead of typing.

## What it does

Talkboy lets you have voice conversations with Claude. Push a button (or say "over"), speak your message, and hear Claude respond. It maintains conversation history so Claude has context across messages.

## Features

- **Push-to-talk**: Hold spacebar or click the mic button to record
- **Trigger word**: Say "over" to send your message hands-free
- **Streaming TTS**: Responses are spoken back in real-time
- **Animated avatar**: Visual feedback for listening, thinking, speaking states
- **Conversation history**: Messages persist in localStorage
- **Two modes**:
  - **Direct API**: Uses your Anthropic API key
  - **Claude Code**: Routes through the CLI with conversation context
- **Image analysis**: Drag and drop images for Claude vision analysis
- **Activity feed**: Real-time display of Claude Code tool usage
- **Lightbox viewer**: Full-size image preview with analysis sidebar

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open https://localhost:5173

### Setup

1. Click the gear icon to open Settings
2. Choose your mode:
   - **Direct API**: Enter your Anthropic API key
   - **Claude Code**: Toggle on (requires `claude` CLI installed)
3. Close settings and start talking

## How it works

### Direct API Mode
Messages go straight to the Anthropic API. Simple and fast.

### Claude Code Mode
Each message spawns `claude -p` with recent conversation history as context:
- Last 10 messages are included in the prompt
- Fresh process per message (no session conflicts)
- Voice-optimized prompt keeps responses brief

## Architecture

```
src/
├── App.tsx                 # Main app, state management
├── components/
│   ├── activity/           # Real-time tool usage feed
│   ├── avatar/Avatar.tsx   # Rive-based animated avatar
│   ├── chat/               # History, transcript, text input
│   ├── dropzone/           # Image drag-and-drop with analysis
│   └── voice/              # Speech recognition & synthesis hooks
├── lib/
│   ├── claude.ts           # API calls (direct + CLI + vision)
│   └── store.ts            # Zustand store for conversations
└── hooks/
    └── useSoundEffects.ts  # Audio feedback

vite.config.ts              # Dev server + API endpoints
```

### API Endpoints (dev server)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Health check, avatar state |
| `/api/session` | GET/POST/DELETE | Manage Claude session ID |
| `/api/claude-code` | POST | Send message, get streaming response |
| `/api/history` | GET | Get conversation messages |
| `/api/state` | POST | Sync state from browser |

## Roadmap

- [ ] Wake word detection (local, privacy-first using Porcupine)
- [ ] Always-on listening mode
- [ ] Interrupt mid-response
- [ ] Multiple conversation threads
- [ ] Custom avatar support

## Using with Claude Code (MCP)

You can launch Talkboy from any project using Claude Code by saying "launch talkboy".

### Setup

1. Install the MCP server dependencies:
   ```bash
   cd /path/to/talkboy/mcp-server
   npm install
   ```

2. Add to your Claude Code settings (`~/.claude/settings.json`):
   ```json
   {
     "mcpServers": {
       "talkboy": {
         "command": "node",
         "args": ["/path/to/talkboy/mcp-server/index.js"]
       }
     }
   }
   ```

3. Restart Claude Code

### Available Tools

| Tool | Description |
|------|-------------|
| `launch_talkboy` | Start Talkboy and open in browser |
| `get_talkboy_status` | Check if running and current state |
| `get_transcript` | Get latest voice transcript |
| `get_conversation_history` | Get full chat history |

## Tech Stack

- React 18 + TypeScript
- Vite (dev server + custom API middleware)
- Zustand (state management)
- Rive (avatar animations)
- Web Speech API (recognition + synthesis)

## License

MIT
