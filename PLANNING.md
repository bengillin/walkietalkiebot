# Talkboy Planning

## What's Been Built

### Core Voice Interface
- **Push-to-talk recording** - Hold spacebar or click button to record voice input
- **Walkie-talkie "over" trigger** - Say "over" to send message in continuous mode
- **Wake word detection** - Say "hey talkboy" to activate hands-free (uses Web Speech API)
- **Streaming TTS responses** - Assistant responses read aloud with text-to-speech
- **Sound effects** - Audio feedback for listening start/stop, thinking, success, and errors

### Claude Integration
- **Claude Code mode** - Routes requests through Claude CLI for full agent capabilities (file operations, bash, web search)
- **Direct API mode** - Alternative mode using Anthropic API directly with streaming responses
- **Session management** - Connect/disconnect Claude Code sessions, tracks session ID
- **Activity feed** - Real-time display of tool usage (Read, Edit, Write, Bash, Glob, Grep)

### Conversation Management
- **Conversation history** - Sidebar panel showing past messages with auto-scroll
- **Multiple conversations** - Create, switch between, and delete conversations
- **Context loading** - Select past conversations to include as context for current chat
- **Persistent storage** - Conversations saved to localStorage with auto-generated titles

### Image & File Handling
- **Image drop zone** - Drag and drop images anywhere on the page
- **File picker** - Click to add images via file browser
- **Claude vision analysis** - Automatic image analysis with descriptions
- **Lightbox modal** - Full-size image view with analysis sidebar
- **Image context** - Analysis results included in conversation context

### UI Features
- **Animated avatar** - Visual states: idle, listening, thinking, speaking, happy, confused
- **Transcript display** - Shows current speech recognition or response text
- **Text input** - Optional keyboard input field (toggleable in settings)
- **Settings panel** - Configure mode, TTS, continuous listening, wake word

---

## Priority Backlog

### Tier 1: High Impact, Medium Effort
These are the next features to build.

#### 1. Conversation Search & Export
- Search through past conversations by keyword or date
- Export conversations to markdown, JSON, or PDF
- Bulk export for backup purposes

#### 2. Browser URL Opening
- Add capability for the assistant to open URLs in the default browser
- Use macOS `open` command to launch URLs
- Useful for directing users to websites mentioned in conversation

#### 3. Media Library
- Central repository for all images, files, and attachments shared in conversations
- Thumbnail grid view with search and filtering
- Link back to original conversation context
- Organize by project, date, or custom tags

### Tier 2: Nice to Have
These would be valuable but can wait.

#### 4. "Computer" Wake Word (Picovoice Porcupine)
- Integrate Picovoice Porcupine for more reliable always-on wake word detection
- Use the built-in "Computer" wake word
- Requires Picovoice API key from console.picovoice.ai
- Current Web Speech API wake word works but can be unreliable

#### 5. Copy/Paste Support
- Copy messages from activity feed
- Paste content into conversation

#### 6. Auto-scroll Improvements
- Smarter scroll behavior in chat history
- Don't auto-scroll if user has scrolled up

---

## Future Roadmap

### Medium Term (Next 2-4 Weeks)

**Voice Command Shortcuts**
- Custom triggers: "Deploy" → runs your deploy script
- Project shortcuts: "Run tests" knows which test command
- User-configurable command mapping stored in JSON

**Project Context Auto-Loading**
- Detection: Recognize project by directory structure or .talkboy config
- Auto-load: Relevant docs, common files, past conversations
- Memory: "Last time in this project, you were working on X"

**Change Preview System**
- Before applying: Show diff of proposed changes
- Voice: "Here's what I'm about to change, should I proceed?"
- UI: Side-by-side diff viewer

### Long Term (1-3 Months)

**Multi-Modal Responses**
- Voice + Visual: Explain verbally while highlighting code
- Diagrams: Auto-generate architecture diagrams
- Screen sharing: Show exactly what changed

**External Tool Integration**
- Calendar: "Block 2 hours for this refactor"
- Notes (Apple Notes, Notion): "Save this explanation to my notes"
- GitHub: "Create an issue for this bug"

**Proactive Suggestions**
- Context-aware prompts: "I notice you're in the auth module, want to run the auth tests?"
- Error detection: "This file has a syntax error, want me to fix it?"

---

## Technical Architecture

### Current Stack
- **Frontend**: React + TypeScript + Vite
- **State**: Zustand store with localStorage persistence
- **Voice**: Web Speech API (recognition + synthesis)
- **Styling**: CSS with component-scoped files

### Key Files
- `src/App.tsx` - Main app component, orchestrates all features
- `src/lib/store.ts` - Zustand store for global state
- `src/lib/claude.ts` - Claude API integration (direct and CLI modes)
- `src/types/index.ts` - TypeScript type definitions
- `src/components/voice/` - Speech recognition, synthesis, wake word
- `src/components/chat/` - Chat history, transcript, text input
- `src/components/activity/` - Activity feed for tool usage
- `src/components/dropzone/` - File drag and drop
- `src/components/avatar/` - Animated avatar component

### State Management
- Activity feed: WebSocket-style events from Claude Code CLI parsing
- Context: React context for shared state across components
- History: localStorage for conversations
- Settings: localStorage for user preferences

---

## Philosophy & Vision

Talkboy exists to make AI assistance feel natural and immediate - like having a capable collaborator you can just talk to. The goal isn't just voice input, it's reducing friction between thought and action.

Hello Ben!
