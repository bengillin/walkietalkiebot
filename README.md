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
│   ├── avatar/Avatar.tsx   # Rive-based animated avatar
│   ├── chat/               # History, transcript, text input
│   └── voice/              # Speech recognition & synthesis hooks
├── lib/
│   ├── claude.ts           # API calls (direct + CLI)
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

## Tech Stack

- React 18 + TypeScript
- Vite (dev server + custom API middleware)
- Zustand (state management)
- Rive (avatar animations)
- Web Speech API (recognition + synthesis)

## License

MIT
