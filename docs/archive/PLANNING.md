# Talkboy Planning Document

## The Problem

Command-line interfaces are powerful but intimidating. Most people:
- Don't know terminal commands
- Find text-only interfaces cold and confusing
- Would rather talk than type
- Need visual feedback to understand what's happening

Apple succeeded by making computers friendly and visual. We can do the same for AI coding assistants.

## The Opportunity

Voice interfaces + AI + friendly avatars = accessible coding for everyone

---

## Feature Brainstorm (Go Wide)

### Avatar Ideas
- [ ] Pixel art companion (retro, lightweight)
- [ ] 3D rendered character (modern, expressive)
- [ ] Abstract blob/orb with expressions (simple, universal)
- [ ] Animal mascots (approachable)
- [ ] Robot/android (tech-forward)
- [ ] Customizable human-like assistant
- [ ] User-drawn/uploaded avatars
- [ ] Avatar "packs" or themes
- [ ] Seasonal/holiday variants
- [ ] Mood-based auto-switching

### Voice Ideas
- [ ] Push-to-talk (spacebar/button)
- [ ] Wake word ("Hey Talkboy")
- [ ] Continuous listening mode
- [ ] Multiple voice options per avatar
- [ ] Voice cloning for custom avatars
- [ ] Adjustable speech rate
- [ ] Voice commands for navigation ("go back", "show me that file")
- [ ] Multilingual support
- [ ] Accessibility: screen reader integration

### Visual Feedback Ideas
- [ ] Avatar expressions (thinking, happy, working, confused, celebrating)
- [ ] Animated background states
- [ ] Live file tree with highlights
- [ ] Code diff preview before applying
- [ ] Progress animations for long tasks
- [ ] "Workspace view" showing affected files
- [ ] Terminal output translated to plain English
- [ ] Sound effects for actions
- [ ] Haptic feedback (mobile)

### Personality/UX Ideas
- [ ] Onboarding tutorial with avatar guide
- [ ] Avatar "learns" your preferences
- [ ] Different communication styles (casual/formal/encouraging)
- [ ] Humor/personality toggles
- [ ] Celebration animations for completed tasks
- [ ] Gentle error explanations
- [ ] Suggested next steps
- [ ] History visualization ("here's what we built together")

### Platform Ideas
- [ ] Web app (easiest to start)
- [ ] Electron app (full system access)
- [ ] Tauri app (lighter than Electron)
- [ ] VS Code extension
- [ ] JetBrains plugin
- [ ] Mobile companion app
- [ ] iPad app for visual learners
- [ ] CLI wrapper (for power users who want voice)

### Integration Ideas
- [ ] Direct Claude API integration
- [ ] Wrap Claude Code subprocess
- [ ] Use Claude Code SDK (when available)
- [ ] GitHub integration for project context
- [ ] Figma integration for design-to-code
- [ ] Local file system access
- [ ] Browser extension for web-based coding

---

## Narrowing Down: MVP Candidates

### Option A: Web-First Minimal
**Scope**: Browser-based, single avatar, push-to-talk, Claude API only
**Pros**: Fast to build, works everywhere, no install
**Cons**: Limited file system access, can't run code locally
**Timeline**: Fastest

### Option B: Electron Desktop
**Scope**: Desktop app, single avatar, push-to-talk, wraps Claude Code
**Pros**: Full system access, can run real commands, native feel
**Cons**: Harder to distribute, platform-specific builds
**Timeline**: Medium

### Option C: VS Code Extension
**Scope**: Avatar panel in VS Code, voice input, integrates with existing workflow
**Pros**: Meets developers where they are, leverages VS Code ecosystem
**Cons**: Limited to VS Code users, less standalone appeal
**Timeline**: Medium

### Option D: Hybrid PWA
**Scope**: Progressive web app that can work offline, optional Electron wrapper
**Pros**: Best of both worlds, single codebase
**Cons**: More complex architecture
**Timeline**: Longer

---

## Recommended MVP Path

**Start with Option A (Web-First)** to validate the core experience:
1. Does voice input feel natural?
2. Does the avatar make it more engaging?
3. Do people actually prefer this over typing?

Then evolve to Option B (Electron) for full Claude Code integration.

---

## Technical Decisions to Make

### Avatar Format
| Option | Pros | Cons |
|--------|------|------|
| Lottie (JSON animations) | Lightweight, scalable, easy to create | Limited interactivity |
| Rive | Interactive, state machines | Smaller community |
| Sprite sheets | Simple, full control | Manual work, larger files |
| Three.js/WebGL | Full 3D capability | Complex, heavy |
| CSS animations | No dependencies | Limited expressiveness |

**Recommendation**: Start with Lottie or Rive for the default avatar

### Voice Input
| Option | Pros | Cons |
|--------|------|------|
| Web Speech API | Free, built-in | Requires Chrome, variable quality |
| Whisper (local) | Private, accurate | Requires local model, slow |
| Deepgram | Fast, accurate | Costs money, requires API |
| AssemblyAI | Good accuracy | Costs money |

**Recommendation**: Start with Web Speech API, add Whisper option later

### Voice Output
| Option | Pros | Cons |
|--------|------|------|
| Web Speech API | Free, built-in | Robotic voice |
| ElevenLabs | Natural voices | Expensive at scale |
| Coqui TTS | Open source, local | Setup complexity |
| Browser TTS + tuning | Free, decent quality | Limited voice options |

**Recommendation**: Start with browser TTS, offer ElevenLabs as premium option

---

## Open Questions

1. Should the avatar speak all of Claude's responses, or just summaries?
2. How do we handle code output? Read it? Show it visually?
3. What's the right balance of voice vs visual feedback?
4. How do we handle errors in a friendly way?
5. Should there be a "quiet mode" for working in public?
6. How do we make avatar creation accessible to non-artists?
7. What's the business model? Free/paid/open source?

---

## Next Steps

1. [ ] Decide on MVP scope (Option A recommended)
2. [ ] Pick tech stack
3. [ ] Design default avatar character
4. [ ] Build voice input/output proof of concept
5. [ ] Create basic chat UI
6. [ ] Integrate Claude API
7. [ ] Add avatar expressions
8. [ ] User testing
