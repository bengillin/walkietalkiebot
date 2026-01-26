# Talkboy Roadmap

## Current State Summary

Talkboy is a voice-first interface for Claude with approximately 6,400 lines of code across 41 files. The core vision of making AI assistance feel natural and immediate through voice interaction has been realized.

---

## Completed Features

### Core Voice Interface
- [x] Push-to-talk recording (spacebar or click)
- [x] "Over" trigger word for hands-free sending
- [x] Wake word detection ("hey talkboy" with mishearing variants)
- [x] Continuous listening mode
- [x] Streaming TTS responses
- [x] Sound effects (listening start/stop, thinking, success, errors)
- [x] Custom wake word settings
- [x] Custom trigger word settings

### Claude Integration
- [x] Claude Code mode (full agent capabilities via CLI)
- [x] Direct API mode (Anthropic API with streaming)
- [x] Session management for Claude Code
- [x] Activity feed showing real-time tool usage (Read, Edit, Write, Bash, etc.)
- [x] Image analysis via Claude vision

### Conversation Management
- [x] Multi-conversation support (create, switch, delete)
- [x] Conversation history sidebar
- [x] Search through conversations with highlighted results
- [x] Export to Markdown, JSON, and Plain Text
- [x] Context loading (include past conversations in prompts)
- [x] localStorage persistence with auto-generated titles

### UI/UX
- [x] Animated avatar with 6 states (idle, listening, thinking, speaking, happy, confused)
- [x] Live transcript display
- [x] Text input option (toggleable)
- [x] Settings panel
- [x] Onboarding flow
- [x] Image lightbox with analysis sidebar
- [x] Keyboard shortcuts (Escape, Cmd+K, Cmd+E)

---

## Planned Features (Not Yet Built)

### Tier 1: High Impact

#### Browser URL Opening
Open URLs mentioned in conversation in the default browser via macOS `open` command.
- Useful for directing users to documentation, PRs, etc.

#### Media Library
Central repository for all images/files shared across conversations.
- Thumbnail grid view
- Search and filtering
- Link back to original conversation
- Organize by project, date, or tags

#### Better Wake Word (Picovoice Porcupine)
Current Web Speech API wake word is unreliable. Picovoice offers:
- More reliable always-on detection
- Built-in "Computer" wake word
- Lower false-positive rate

### Tier 2: Nice to Have

#### Copy/Paste from Activity Feed
Allow copying tool output and pasting content into conversations.

#### Auto-scroll Improvements
Smarter scroll behavior - don't auto-scroll when user has scrolled up to read.

#### Voice Command Shortcuts
Custom triggers mapped to actions:
- "Deploy" → runs deploy script
- "Run tests" → runs project test command
- User-configurable command mapping

### Tier 3: Medium Term

#### Project Context Auto-Loading
- Detect project by directory structure or `.talkboy` config
- Auto-load relevant docs and past conversations
- "Last time in this project, you were working on X"

#### Change Preview System
Show diffs before applying changes:
- Voice: "Here's what I'm about to change, should I proceed?"
- UI: Side-by-side diff viewer

#### Multiple Voice Options
- Different TTS voices per avatar personality
- ElevenLabs integration for natural voices (premium)

### Tier 4: Long Term Vision

#### Multi-Modal Responses
- Voice + Visual: Explain verbally while highlighting code
- Auto-generate diagrams
- Screen sharing of changes

#### External Tool Integration
- Calendar: "Block 2 hours for this refactor"
- Notes (Apple Notes, Notion): "Save this explanation"
- GitHub: "Create an issue for this bug"

#### Proactive Suggestions
- "I notice you're in the auth module, want to run the auth tests?"
- "This file has a syntax error, want me to fix it?"

#### Offline Transcription
Local Whisper model for privacy-sensitive environments.

#### Desktop App (Electron/Tauri)
Full system access, native notifications, auto-updates.

---

## Technical Debt & Cleanup

### Code to Remove
1. **`sendMessageViaIPC()`** in `src/lib/claude.ts` (lines 244-294) - never called
2. **`sendMessage()`** in `src/lib/claude.ts` (lines 99-132) - never called (streaming version used instead)

### Unused Dependency
- **`@rive-app/react-canvas`** - in package.json but never imported (Avatar uses CSS animations)

### Planning Docs to Archive
These planning docs can be moved to `/docs/archive/` or deleted:
- `PLAN-keyboard-shortcuts.md` - feature shipped
- `PLAN-response-formatting.md` - behavioral guideline, not code
- `PLAN-search-export.md` - feature shipped
- `PLANNING.md` (root) - superseded by this roadmap
- `docs/ARCHITECTURE.md` - describes planned structure, not actual
- `docs/DECISIONS.md` - ADRs are useful history, keep

### Documentation to Keep
- `README.md` - needs minor updates to reflect all features
- `PLAN.md` - current sprint tracking
- `docs/PLANNING.md` - vision document
- `docs/CHARACTER.md` - avatar design spec

---

## Branch Strategy Going Forward

Create feature branches for new work:
```
feature/browser-url-opening
feature/media-library
feature/porcupine-wake-word
```

Merge via PR with squash commits to keep main history clean.

---

## Consolidated File Structure

```
talkboy/
├── README.md                 # Project overview
├── ROADMAP.md                # This file - feature planning
├── PLAN.md                   # Current sprint tracking
├── docs/
│   ├── PLANNING.md           # Vision and philosophy
│   ├── CHARACTER.md          # Avatar design spec
│   ├── DECISIONS.md          # Architecture decision records
│   └── archive/              # Old planning docs (optional)
├── src/
│   ├── App.tsx               # Main app orchestration
│   ├── App.css
│   ├── main.tsx              # React entry point
│   ├── types/index.ts        # TypeScript definitions
│   ├── lib/
│   │   ├── store.ts          # Zustand state management
│   │   └── claude.ts         # Claude API integration
│   ├── hooks/
│   │   ├── useKeyboardShortcuts.ts
│   │   └── useSoundEffects.ts
│   ├── utils/
│   │   └── export.ts         # Conversation export
│   ├── components/
│   │   ├── avatar/
│   │   ├── voice/
│   │   ├── chat/
│   │   ├── dropzone/
│   │   ├── activity/
│   │   └── onboarding/
│   └── styles/
│       └── globals.css
└── vite.config.ts            # Build + API middleware
```

---

## Recommended Next Steps

1. **Cleanup** - Remove dead code and unused dependency
2. **Archive old docs** - Move completed planning docs
3. **Update README** - Reflect all current features
4. **Pick first Tier 1 feature** - Browser URL opening is probably easiest win
