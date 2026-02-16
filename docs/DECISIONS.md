# Decision Log

Track key decisions and their rationale.

## Template

```
## [Decision Title]
**Date**: YYYY-MM-DD
**Status**: Proposed | Accepted | Superseded
**Context**: Why is this decision needed?
**Decision**: What was decided?
**Rationale**: Why this choice over alternatives?
**Consequences**: What are the implications?
```

---

## Pending Decisions

### 1. MVP Platform Choice
**Status**: Proposed
**Options**:
- A) Web-first (React + Vite)
- B) Electron desktop
- C) VS Code extension
- D) Hybrid PWA

**Leaning**: Option A (Web-first) to validate UX quickly

---

### 2. Avatar Animation Format
**Status**: Proposed
**Options**:
- Lottie (JSON-based, After Effects workflow)
- Rive (interactive state machines)
- Sprite sheets (manual, full control)
- CSS/SVG (lightweight, limited)

**Leaning**: Rive for interactivity, Lottie as fallback

---

### 3. Voice Input Provider
**Status**: Proposed
**Options**:
- Web Speech API (free, Chrome-only)
- Whisper local (private, slow startup)
- Deepgram (fast, paid)
- AssemblyAI (accurate, paid)

**Leaning**: Web Speech API for MVP, add options later

---

### 4. Voice Output Provider
**Status**: Proposed
**Options**:
- Web Speech API (free, robotic)
- ElevenLabs (natural, expensive)
- Coqui TTS (open source, complex)

**Leaning**: Web Speech API default, ElevenLabs premium

---

### 5. State Management
**Status**: Proposed
**Options**:
- Zustand (simple, lightweight)
- Jotai (atomic, flexible)
- Redux Toolkit (familiar, verbose)
- React Context (built-in, re-render concerns)

**Leaning**: Zustand for simplicity

---

### 6. Default Avatar Character
**Status**: Open
**Considerations**:
- Should feel friendly and approachable
- Not too childish (professionals use this too)
- Gender-neutral or abstract?
- Tech-themed or universal?

**Ideas**:
- Friendly robot/android
- Abstract orb/blob with eyes
- Animal companion (owl? fox? cat?)
- Geometric character
- Customizable humanoid

---

## Accepted Decisions

### ADR-001: Avatar Character - Cutesy Robot
**Date**: 2026-01-25
**Status**: Accepted
**Decision**: The default avatar will be a cute, friendly robot character
**Rationale**:
- Tech-forward (fits the coding assistant context)
- Approachable and non-intimidating
- Gender-neutral
- Robots can have expressive "screens" or eyes for emotional states
- Appeals to both casual users and professionals
**Consequences**: Need to design robot character with expressive face/screen

---

### ADR-002: Animation Format - Rive
**Date**: 2026-01-25
**Status**: Accepted
**Decision**: Use Rive for avatar animations
**Rationale**:
- Built-in state machines (idle → listening → thinking → speaking)
- Interactive and reactive to inputs
- Smaller file sizes than Lottie typically
- Purpose-built for character animation
- Can blend between states smoothly
**Consequences**:
- Team needs to learn Rive editor
- @rive-app/react-canvas dependency
- Need to create .riv file for robot character

---

### ADR-003: Voice Input - Web Speech API (Primary)
**Date**: 2026-01-25
**Status**: Accepted
**Decision**: Use Web Speech API for real-time speech recognition
**Rationale**:
- True real-time streaming (words appear as you speak)
- Free, no API costs
- No setup required
- Good enough accuracy for conversational input
- Local Whisper is NOT real-time (processes chunks after recording)
**Consequences**:
- Chrome/Edge only (Firefox support limited)
- May need Deepgram fallback for production quality
- Need graceful degradation for unsupported browsers

---

### ADR-004: SQLite for Server Persistence
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Use SQLite via better-sqlite3 with WAL mode for server-side data persistence
**Rationale**:
- Synchronous API is simpler than async alternatives
- WAL mode handles concurrent reads from API and Telegram
- Single file deployment (no external DB server)
- localStorage kept as offline cache with auto-migration
**Consequences**:
- Requires `better-sqlite3` native module (compiled per platform)
- DB at `~/.talkboy/talkboy.db`
- Need schema versioning system for migrations

---

### ADR-005: Hono as Server Framework
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Use Hono framework for the HTTPS server
**Rationale**:
- Lightweight, Web Standards API compatible
- Built-in SSE streaming support (critical for Claude Code event streaming)
- Works with Node.js HTTPS server
- Minimal overhead over raw HTTP
**Consequences**:
- All API routes defined in single `server/api.ts` file
- Custom HTTPS wrapper needed since Hono's `serve()` doesn't support HTTPS directly

---

### ADR-006: Telegram Bot Integration
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Add a Telegram bot using grammy framework that routes through the existing `/api/claude-code` endpoint
**Rationale**:
- Enables mobile access to Claude without building a native app
- grammy is the most maintained Telegram bot library for Node.js
- Reusing the same API endpoint ensures consistent behavior between web and Telegram
**Consequences**:
- Per-user conversation state tracked in `telegram_state` table
- Long messages split at 4096 char limit
- No streaming in Telegram (waits for full response)
- Bot starts automatically with server if token is configured

---

### ADR-007: MCP Server for Claude Code Integration
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Expose TalkBoy functionality as MCP tools via stdio transport
**Rationale**:
- Allows Claude Code to launch TalkBoy, read transcripts, and respond to user voice input
- Enables bidirectional IPC where Claude Code can be an active participant in TalkBoy conversations
**Consequences**:
- 12 tools exposed
- All tools proxy to the HTTPS API (self-signed cert bypass required)
- Duplicate code between `mcp-server/index.js` and `bin/talkboy-mcp.js`

---

### ADR-008: Cassette Tape UI Theme
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Use a cassette tape / TalkBoy (Home Alone 2) theme for the UI
**Rationale**:
- Strong brand identity
- "Conversations as tapes" is an intuitive metaphor (insert, play, eject, switch)
- Retro aesthetic is distinctive
- The original TalkBoy was a voice recorder, fitting perfectly
**Consequences**:
- Custom CSS with theme variables
- McAllister theme (silver TalkBoy) as default
- Cassette components: CassetteTape (animated reels), TapeDeck (input bar), TapeCollection (conversation switcher), RetroTape, TapeCase

---

### ADR-009: Self-Signed HTTPS
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Auto-generate self-signed certificates for localhost HTTPS
**Rationale**:
- Web Speech API requires a secure context (HTTPS or localhost)
- Self-signed certs at `~/.talkboy/` allow HTTPS on any port
- Tailscale certs preferred when available
**Consequences**:
- Browser shows certificate warning on first visit
- `selfsigned` npm dependency
- `NODE_TLS_REJECT_UNAUTHORIZED=0` needed for internal API calls (MCP, Telegram)

---

### ADR-010: One-Shot Claude Processes
**Date**: 2026-02-01
**Status**: Accepted
**Decision**: Each message spawns a fresh `claude -p` process with `--no-session-persistence --permission-mode bypassPermissions`
**Rationale**:
- Avoids session file conflicts when multiple messages arrive
- No orphaned processes on crash
- Simple lifecycle (spawn, stream, exit)
- bypassPermissions avoids blocking on approval prompts
**Consequences**:
- No multi-turn tool context within a single Claude session (each message starts fresh)
- Conversation context passed via prompt text
- No ability to approve/reject individual tool calls
- Process cleanup trivial
