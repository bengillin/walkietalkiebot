# Walkie Talkie Bot Roadmap

## Current State

Walkie Talkie Bot is a voice-first, cassette tape-themed interface for Claude Code with dual distribution (Claude Code plugin + full server with web UI). The codebase is TypeScript throughout, with 140 tests across 10 test files covering the frontend (store, exports, components, plan detection) and server (5 database repositories + HTTP API layer).

### Architecture highlights
- **Frontend**: React 18 + Zustand, decomposed into 6 custom hooks (`useVoiceIO`, `useClaudeChat`, `useKeyboardControl`, `useDraggableFab`, `useImageAnalysis`, `useServerSync`)
- **Server**: Hono HTTPS server with better-sqlite3, full test coverage for all repositories and API endpoints
- **MCP server**: TypeScript, compiled via esbuild, 30 tools (15 data + 15 server)
- **Onboarding**: 7-step wizard (welcome, how-it-works, TTS, sound effects, wake word, continuous listening, done)

---

## Completed Features

### Core Voice Interface
- [x] Push-to-talk recording (spacebar or click)
- [x] "Over" trigger word for hands-free sending
- [x] Wake word detection ("hey talkie" with mishearing variants)
- [x] Continuous listening mode
- [x] Streaming TTS responses with selectable system voices
- [x] Sound effects (cassette tape sounds for recording start/stop)
- [x] Custom wake word and trigger word settings

### Claude Integration
- [x] Claude Code mode (full agent capabilities via CLI)
- [x] Direct API mode (Anthropic API with streaming, model selection)
- [x] Session management for Claude Code
- [x] Activity feed showing real-time tool usage (40+ tools with icons, categories, colors)
- [x] Image analysis via Claude vision (drag-and-drop + media library)

### Conversation Management
- [x] Multi-conversation support (create, switch, rename, delete)
- [x] Cassette tape metaphor with illustrated tapes and spinning reels
- [x] Full-text search (FTS5, Cmd+K)
- [x] Export to Markdown and JSON
- [x] Context loading (include past conversations in prompts)
- [x] Per-conversation liner notes (markdown)
- [x] SQLite persistence with auto-migration from localStorage

### Plans System
- [x] Auto-detect plans in Claude responses
- [x] Status workflow (draft/approved/in_progress/completed/archived)
- [x] Plan CRUD with conversation linking

### UI/UX
- [x] 6 retro themes (TalkBoy, Bubble, Dial-Up, Finder, Guestbook, 1984)
- [x] Animated CSS robot avatar with 6 states
- [x] 7-step onboarding wizard
- [x] Keyboard shortcuts (Spacebar, Cmd+K, Cmd+E, Escape, ?)
- [x] Image lightbox with analysis sidebar
- [x] Floating action button (draggable, resizable)
- [x] Background jobs with SSE streaming

### Distribution
- [x] npm package (`npx walkietalkiebot`)
- [x] Claude Code plugin (MCP tools + skills)
- [x] Telegram bot integration
- [x] Marketing site (walkietalkie.bot) with docs

### Testing & Quality
- [x] 140 tests across 10 files
- [x] Client tests: store, exports, plan detection, components
- [x] Server tests: conversations, messages, plans, search, activities repositories + HTTP API
- [x] TypeScript throughout (including MCP server)

---

## Planned Features

### Tier 2: Nice to Have

#### Copy/Paste from Activity Feed
Allow copying tool output and pasting content into conversations.

#### Auto-scroll Improvements
Smarter scroll behavior — don't auto-scroll when user has scrolled up to read.

#### Voice Command Shortcuts
Custom triggers mapped to actions (e.g., "Deploy" runs deploy script, "Run tests" runs project tests).

### Tier 3: Medium Term

#### Project Context Auto-Loading
- Detect project by directory structure or config
- Auto-load relevant docs and past conversations

#### Change Preview System
Show diffs before applying changes with voice confirmation.

#### Premium Voice Options
ElevenLabs integration for more natural voices.

### Tier 4: Long Term Vision

#### Multi-Modal Responses
Voice + visual: explain verbally while highlighting code, auto-generate diagrams.

#### External Tool Integration
Calendar, notes (Notion), GitHub issue creation from conversations.

#### Proactive Suggestions
Context-aware prompts based on current project state.

#### Offline Transcription
Local Whisper model for privacy-sensitive environments.

#### Desktop App (Electron/Tauri)
Native app with system access, notifications, auto-updates.
