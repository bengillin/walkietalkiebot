# Talkboy Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Talkboy App                            │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Avatar    │  │    Voice    │  │     Workspace       │  │
│  │  Component  │  │   Engine    │  │    Visualizer       │  │
│  │             │  │             │  │                     │  │
│  │ - Render    │  │ - STT input │  │ - File tree         │  │
│  │ - Animate   │  │ - TTS output│  │ - Code preview      │  │
│  │ - Express   │  │ - Wake word │  │ - Diff view         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │               │                    │              │
│         └───────────────┼────────────────────┘              │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Conversation Controller                 │   │
│  │                                                      │   │
│  │  - Message history                                   │   │
│  │  - State management                                  │   │
│  │  - Avatar state coordination                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│                         ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Claude Integration                   │   │
│  │                                                      │   │
│  │  Phase 1: Claude API direct                          │   │
│  │  Phase 2: Claude Code subprocess                     │   │
│  │  Phase 3: Claude Code SDK                            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Avatar Component (`src/components/avatar/`)

Responsible for rendering and animating the avatar character.

```
avatar/
├── AvatarCanvas.tsx      # Main render container
├── AvatarController.ts   # Animation state machine
├── expressions/          # Expression definitions
│   ├── idle.json
│   ├── thinking.json
│   ├── speaking.json
│   ├── happy.json
│   └── confused.json
├── avatars/              # Avatar definitions
│   └── default/
│       ├── manifest.json
│       └── animations/
└── types.ts              # Avatar-related types
```

**Avatar State Machine**:
```
idle ──[user speaks]──► listening
listening ──[speech ends]──► thinking
thinking ──[response ready]──► speaking
speaking ──[speech ends]──► idle

Any state ──[error]──► confused ──[timeout]──► idle
Any state ──[success]──► happy ──[timeout]──► idle
```

### 2. Voice Engine (`src/components/voice/`)

Handles speech-to-text and text-to-speech.

```
voice/
├── VoiceProvider.tsx     # React context for voice state
├── useSpeechRecognition.ts
├── useSpeechSynthesis.ts
├── VoiceIndicator.tsx    # Visual feedback for voice state
├── adapters/
│   ├── webSpeech.ts      # Browser Web Speech API
│   ├── whisper.ts        # Local Whisper integration
│   └── elevenlabs.ts     # ElevenLabs TTS
└── types.ts
```

**Voice States**:
- `inactive` - Not listening
- `listening` - Actively capturing speech
- `processing` - Converting speech to text
- `speaking` - TTS playing response

### 3. Workspace Visualizer (`src/components/workspace/`)

Shows what Claude is doing in a visual way.

```
workspace/
├── WorkspacePanel.tsx    # Main container
├── FileTree.tsx          # Visual file browser
├── CodePreview.tsx       # Syntax-highlighted code view
├── DiffView.tsx          # Before/after comparison
├── ActivityLog.tsx       # Plain-English action log
└── types.ts
```

### 4. Chat Interface (`src/components/chat/`)

Traditional chat UI as fallback/supplement to voice.

```
chat/
├── ChatPanel.tsx
├── MessageList.tsx
├── MessageBubble.tsx
├── InputBar.tsx          # Text input + voice button
└── types.ts
```

### 5. Core Library (`src/lib/`)

```
lib/
├── claude/
│   ├── client.ts         # Claude API wrapper
│   ├── streaming.ts      # Handle streaming responses
│   └── tools.ts          # Tool call handling
├── conversation/
│   ├── store.ts          # Conversation state management
│   └── history.ts        # Persistence
├── avatar/
│   ├── loader.ts         # Load avatar definitions
│   └── registry.ts       # Available avatars
└── config.ts             # App configuration
```

## Data Flow

### User Speaks → Claude Responds

```
1. User presses talk button (or wake word detected)
2. VoiceEngine starts recording
3. AvatarController → "listening" state
4. User stops speaking
5. VoiceEngine → speech-to-text
6. AvatarController → "thinking" state
7. ConversationController sends to Claude
8. Claude streams response
9. WorkspaceVisualizer shows actions
10. AvatarController → "speaking" state
11. VoiceEngine → text-to-speech
12. AvatarController → "idle" state
```

## Avatar Manifest Format

Each avatar is a directory with a manifest:

```json
{
  "id": "default-buddy",
  "name": "Buddy",
  "version": "1.0.0",
  "description": "A friendly helper",
  "author": "Talkboy Team",
  "format": "lottie",
  "expressions": {
    "idle": "animations/idle.json",
    "listening": "animations/listening.json",
    "thinking": "animations/thinking.json",
    "speaking": "animations/speaking.json",
    "happy": "animations/happy.json",
    "confused": "animations/confused.json"
  },
  "voice": {
    "ttsVoice": "en-US-Neural2-J",
    "pitch": 1.0,
    "rate": 1.0
  },
  "personality": {
    "style": "friendly",
    "verbosity": "concise"
  }
}
```

## Phase Roadmap

### Phase 1: Web MVP
- React + Vite
- Single hardcoded avatar (Lottie)
- Web Speech API for STT/TTS
- Direct Claude API integration
- Basic chat UI with voice button
- Local storage for history

### Phase 2: Enhanced Web
- Multiple avatars
- Rive animations
- ElevenLabs TTS option
- Workspace visualization
- Better error handling

### Phase 3: Desktop App
- Electron wrapper
- File system access
- Claude Code integration
- System notifications
- Auto-updates

### Phase 4: Ecosystem
- Avatar creator tool
- Avatar marketplace
- Community avatars
- Plugin system
- Mobile companion
