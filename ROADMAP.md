# Walkie Talkie Bot Roadmap

## Current State

Walkie Talkie Bot is a voice-first, cassette tape-themed interface for Claude Code with dual distribution (Claude Code plugin + full server with web UI). The codebase is TypeScript throughout, with ~170 unit tests across 13 test files (plus Playwright E2E + visual regression) covering the frontend (store, exports, components, plan detection) and server (5 database repositories + HTTP API layer + prompt builder).

### Architecture highlights
- **Frontend**: React 18 + Zustand, decomposed into 8 custom hooks (`useVoiceIO`, `useClaudeChat`, `useKeyboardControl`, `useDraggableFab`, `useImageAnalysis`, `useServerSync`, `useKeyboardShortcuts`, `useSoundEffects`)
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
- [x] Claude Code mode (full agent capabilities via CLI) — the sole integration path; Direct API mode was removed
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
- [x] Marketing site (walkietalkie.bot) with docs

### Testing & Quality
- [x] ~170 unit tests across 13 files + Playwright E2E and visual regression
- [x] Client tests: store, exports, plan detection, tool config, components (ModeSelector, MediaLibrary)
- [x] Server tests: conversations, messages, plans, search, activities repositories + HTTP API + prompt builder
- [x] TypeScript throughout (including MCP server)

---

## Planned Features

### Tier 0: Engineering follow-ups (tech debt)

These came out of an audit and are the recommended next foundation work:

- **Enable `noUncheckedIndexedAccess`.** ~100 call sites in `src` need attention;
  doing it carefully (real guards, not blanket `!`) will catch latent
  array/object-index bugs. Deferred from the initial strictness pass.
- **Fix the latent MCP server type error.** `mcp-server/index.ts` does not strictly
  typecheck against the current `@modelcontextprotocol/sdk` (the `tools/call`
  handler return type lost a `task` field). The esbuild build ignores it; once
  fixed, add `tsc -p mcp-server/tsconfig.json` to CI.
- **Test the core hooks and job orchestration.** `useClaudeChat`, `useVoiceIO`, and
  `server/jobs/*` (manager/runner) currently have no coverage despite holding the
  most complex logic.
- **Replace scattered `console.*` with a small leveled logger** and surface the
  ~8 silently-swallowed `catch {}` errors to the user.
- **Dependency upgrades**: React 18→19, Vite 5→8, Vitest 2→3 (do these behind CI).

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
