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
